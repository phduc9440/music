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
        options={"sourceType": "PDF_NATIVE"},
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
        taskId=str(uuid.uuid4()), scoreId="real", inputs=[{"path": rel, "kind": "PDF"}], options={}
    )
    run_omr_job(job, threading.Event(), JavaCallback(str(job.taskId)))
    assert java.endpoints()[-1] == "complete"
    assert [f["pageNumber"] for f in java.bodies("files")] == [1, 2]
