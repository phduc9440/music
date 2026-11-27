"""Kiểm tra đường PDF.

* ``test_pipeline_with_fake_pymupdf``: dùng PyMuPDF giả, chạy được ở mọi nơi, kiểm tra logic pipeline cho PDF.
* ``test_real_pymupdf``: dùng PyMuPDF thật, tự bỏ qua nếu chưa cài (``pip install pymupdf``).
"""

import sys
import types
import uuid

import cv2
import numpy as np
import pytest
from PIL import Image

from app import config
from app.callback import JavaCallback
from app.omr.pipeline import run_omr_job
from app.schemas import JobRequest
from tests.fake_java import FakeJava
from tests.synth import make_score_page

import threading


def _fake_pymupdf(pages):
    """Module giả có đúng các hàm mà app/omr/pdf.py dùng."""
    module = types.ModuleType("pymupdf")
    module.csGRAY = "gray"
    module.Matrix = lambda x, y: (x, y)

    class Pixmap:
        def __init__(self, array):
            self.height, self.width = array.shape
            padded = np.zeros((self.height, self.width + 4), np.uint8)  # stride > width như PyMuPDF thật
            padded[:, : self.width] = array
            self.stride = self.width + 4
            self.samples = padded.tobytes()

    class Page:
        def __init__(self, array):
            self._array = array
            self.rect = types.SimpleNamespace(width=595.0, height=842.0)

        def get_pixmap(self, matrix, colorspace, alpha):
            assert colorspace == "gray" and alpha is False
            return Pixmap(self._array)

    class Document:
        needs_pass = False
        is_encrypted = False

        def __init__(self):
            self.page_count = len(pages)

        def load_page(self, index):
            return Page(pages[index])

        def close(self):
            pass

    module.open = lambda path: Document()
    return module


def _pdf_job(root, score="p1"):
    rel = f"scores/{score}/original/01-x.pdf"
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"%PDF-1.4 fake")
    return JobRequest(
        taskId=str(uuid.uuid4()),
        scoreId=score,
        inputs=[{"path": rel, "kind": "PDF"}],
        options={"sourceType": "PDF_NATIVE", "stopAfter": "PREPROCESS"},
    )


@pytest.fixture()
def java(monkeypatch):
    server = FakeJava(key="test-key")
    monkeypatch.setenv("JAVA_BASE_URL", server.url)
    monkeypatch.setenv("CALLBACK_RETRIES", "1")
    config.get_settings.cache_clear()
    yield server
    server.stop()


def test_pipeline_with_fake_pymupdf(storage_root, java, monkeypatch):
    pages = [make_score_page(width=1240, height=1754, systems=3), np.full((1754, 1240), 255, np.uint8)]
    monkeypatch.setitem(sys.modules, "pymupdf", _fake_pymupdf(pages))
    job = _pdf_job(storage_root)
    run_omr_job(job, threading.Event(), JavaCallback(str(job.taskId)))

    assert java.endpoints()[-1] == "complete"
    assert java.bodies("progress")[0] == {"progress": 5, "step": "SPLIT_PDF"}
    assert [f["meta"]["sourcePage"] for f in java.bodies("files")] == [1]  # trang 2 trắng bị bỏ
    assert java.bodies("complete")[0]["resultData"]["pageCount"] == 1
    png = cv2.imread(str(storage_root / "scores/p1/pages/page-001.png"), cv2.IMREAD_GRAYSCALE)
    assert png.shape == (1485, 1050)


def test_encrypted_pdf_fails_as_unreadable(storage_root, java, monkeypatch):
    module = _fake_pymupdf([make_score_page()])
    original_open = module.open

    def encrypted(path):
        document = original_open(path)
        document.needs_pass = True
        return document

    module.open = encrypted
    monkeypatch.setitem(sys.modules, "pymupdf", module)
    job = _pdf_job(storage_root, "p2")
    run_omr_job(job, threading.Event(), JavaCallback(str(job.taskId)))
    assert java.bodies("fail") == [{"errorCode": "PAGE_UNREADABLE", "message": "trang 1"}]


def test_real_pymupdf(storage_root, java, tmp_path):
    pytest.importorskip("pymupdf")
    pages = [Image.fromarray(make_score_page(width=1240, height=1754, systems=3, seed=i)) for i in range(2)]
    rel = "scores/real/original/01-x.pdf"
    path = storage_root / rel
    path.parent.mkdir(parents=True)
    pages[0].save(path, "PDF", save_all=True, append_images=pages[1:], resolution=150)
    job = JobRequest(
        taskId=str(uuid.uuid4()), scoreId="real", inputs=[{"path": rel, "kind": "PDF"}], options={"stopAfter": "PREPROCESS"}
    )
    run_omr_job(job, threading.Event(), JavaCallback(str(job.taskId)))
    assert java.endpoints()[-1] == "complete"
    assert [f["pageNumber"] for f in java.bodies("files")] == [1, 2]


def test_vector_pdf_pages_are_cleaned_by_their_text_layer(storage_root, java, monkeypatch):
    from app.omr import vector_pdf

    pages = [make_score_page(width=1240, height=1754, systems=3)]
    module = _fake_pymupdf(pages)
    spans = [
        {"font": "ABCDEF+Leland", "text": "" * 30, "size": 20.0, "bbox": (100, 300, 400, 320)},
        {"font": "Times-Roman", "text": "Ave Maria", "size": 22.0, "bbox": (230, 40, 360, 62)},
    ]
    module_page = module.open("x").load_page(0).__class__
    module_page.get_text = lambda self, kind, **kw: {"blocks": [{"type": 0, "lines": [{"spans": spans}]}]}
    monkeypatch.setitem(sys.modules, "pymupdf", module)
    calls = []
    original = vector_pdf.clean_page
    monkeypatch.setattr(vector_pdf, "clean_page", lambda gray, text: calls.append(text) or original(gray, text))
    job = _pdf_job(storage_root, score="p2")
    run_omr_job(job, threading.Event(), JavaCallback(str(job.taskId)))

    assert java.endpoints()[-1] == "complete"
    assert len(calls) == 1 and calls[0].is_music


def test_vector_pdf_music_glyphs_fix_pitches_and_flag_measures(storage_root, java, monkeypatch):
    """PDF vector (O-13): đầu nốt đọc từ font nhạc của PDF sửa cao độ đọc sai và đánh dấu ô thiếu nốt."""
    from tests.fake_recognizer import FakeRecognizer
    from tests.synth import make_melody_page

    notes = []
    image = make_melody_page(width=1240, height=1754, measures=(4, 3), notes=notes)
    scale = 1240 / 595.0
    chars = [
        {"c": "" if kind == "black" else "", "origin": (x / scale - 4, y / scale), "bbox": (x / scale - 4, y / scale - 10, x / scale + 4, y / scale + 10)}
        for _s, _m, kind, x, y, _step in notes
    ]
    span = {"font": "ABCDEF+Leland", "size": 20.0, "bbox": (0, 0, 595, 842), "chars": chars}
    module = _fake_pymupdf([image])
    module_page = module.open("x").load_page(0).__class__
    module_page.get_text = lambda self, kind, **kw: {"blocks": [{"type": 0, "lines": [{"spans": [span]}]}]}
    monkeypatch.setitem(sys.modules, "pymupdf", module)

    def token(step, duration):
        degree = 30 + step
        letter, octave = "cdefgab"[degree % 7], degree // 7
        return duration + (letter * (octave - 3) if octave >= 4 else letter.upper() * (4 - octave))

    rows = ["**kern", "*clefG2", "*M7/8"]
    cells = sorted({(n[0], n[1]) for n in notes})
    for index, (system, measure) in enumerate(cells):
        own = [n for n in notes if n[0] == system and n[1] == measure]
        half, quarter, eighth = token(own[0][5], "2"), token(own[1][5], "4"), token(own[2][5], "8")
        if index == 1:
            quarter = token(own[1][5] + 7, "4")  # model đọc lệch quãng tám
        if index == 3:
            quarter = "4r"  # model bỏ sót một nốt
        rows += [half, quarter, eighth, "=" if index < len(cells) - 1 else "=="]
    rows.append("*-")

    job = _pdf_job(storage_root, score="g1")
    job.options.stopAfter = "MERGE"
    run_omr_job(job, threading.Event(), JavaCallback(str(job.taskId)), recognizer=FakeRecognizer(["\n".join(rows) + "\n"]))

    assert java.endpoints()[-1] == "complete"
    data = java.bodies("complete")[0]["resultData"]
    assert data["vectorPdf"]["glyphPages"] == [1] and data["vectorPdf"]["glyphs"]["head"] == len(notes)
    assert data["measureCheck"]["pdfMeasures"] == len(cells)
    assert any(f["code"] == "PDF_PITCH_FIXED" for f in data["autoFixes"])
    flags = [e["flags"] for e in data["measureMap"]]
    assert "PDF_MISMATCH" in flags[3] and all("PDF_MISMATCH" not in f for i, f in enumerate(flags) if i != 3)
    merged = (storage_root / "scores/g1/kern/merged.krn").read_text(encoding="utf-8")
    assert token(notes[4][5], "4") in merged.split("\n")


def test_scanned_page_inside_a_pdf_is_denoised_as_a_scan(storage_root, java, monkeypatch):
    """O-11: chọn "PDF gốc" nhưng trang là ảnh scan nhúng trong PDF (một ảnh phủ kín trang, không có font nhạc)."""
    from app.omr import pipeline

    module = _fake_pymupdf([make_score_page(width=1240, height=1754, systems=3, noise=12.0)])
    module_page = module.open("x").load_page(0).__class__
    module_page.get_text = lambda self, kind, **kw: {"blocks": []}
    module_page.get_image_info = lambda self: [{"bbox": (0, 0, 595, 842)}]
    monkeypatch.setitem(sys.modules, "pymupdf", module)
    used = []
    original = pipeline.process_page
    monkeypatch.setattr(pipeline, "process_page", lambda gray, options, *a: used.append(options.source_type) or original(gray, options, *a))
    job = _pdf_job(storage_root, score="s1")
    run_omr_job(job, threading.Event(), JavaCallback(str(job.taskId)))

    assert java.endpoints()[-1] == "complete"
    assert used == ["SCAN"]
    items = java.bodies("complete")[0]["resultData"]["warningItems"]
    assert [i["page"] for i in items if i["code"] == "PAGE_SCANNED_PDF"] == [1]
