"""Tích hợp nhánh lời ca và sửa 8va vào pipeline (Java giả, Transcoda giả, OCR giả; không cần torch/music21)."""

import threading
import uuid
import xml.etree.ElementTree as ET

import pytest

from app import config
from app.callback import JavaCallback
from app.eval.score import read_musicxml
from app.omr import engines, kern_check
from app.omr import pipeline as pipeline_module
from app.omr.pipeline import run_omr_job
from app.schemas import JobRequest
from tests.fake_java import FakeJava
from tests.fake_recognizer import FakeRecognizer
from tests.test_export import fake_music21
from tests.test_lyrics import BlobOcr, melody_page_with_lyrics, melody_xml
from tests.test_pipeline import write_images

KERN_3 = "*clefG2\n*k[b-]\n*M3/4\n2f\n4g\n=\n2f\n4g\n=\n*8va\n2ff\n4gg\n="
"""Ô 3 có *8va ảo (kiểu Transcoda): nốt phải được đưa về F4/G4."""

TEXTS = ["Nguyện", "dâng", "Chúa", "lễ", "tình", "yêu"]


@pytest.fixture()
def java(monkeypatch):
    server = FakeJava(key="test-key")
    monkeypatch.setenv("JAVA_BASE_URL", server.url)
    monkeypatch.setenv("CALLBACK_RETRIES", "1")
    config.get_settings.cache_clear()
    yield server
    server.stop()
    config.get_settings.cache_clear()


@pytest.fixture(autouse=True)
def no_music21(monkeypatch):
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("unavailable", "chưa cài music21"))


def job(score_id, inputs):
    return JobRequest(
        taskId=str(uuid.uuid4()),
        scoreId=score_id,
        inputs=inputs,
        options={"stopAfter": "EXPORT", "musicXmlVersion": 1},
    )


def run(storage_root, score_id, monkeypatch, ocr=True):
    page, _ = melody_page_with_lyrics()
    inputs = write_images(storage_root, score_id, [page])
    fake_music21(monkeypatch, data=melody_xml(3))
    monkeypatch.setattr(pipeline_module, "get_text_engine", lambda: (BlobOcr(TEXTS), None) if ocr else (None, "x"))
    recognizer = FakeRecognizer([KERN_3])
    request = job(score_id, inputs)
    run_omr_job(request, threading.Event(), JavaCallback(str(request.taskId)), recognizer=recognizer)


def test_pipeline_writes_lyrics_into_musicxml(storage_root, java, monkeypatch):
    run(storage_root, "ly1", monkeypatch)
    assert java.endpoints()[-1] == "complete"
    done = java.bodies("complete")[0]["resultData"]
    lyrics = done["lyrics"]
    assert lyrics["status"] == "done" and lyrics["placed"] == 6 and lyrics["verses"] == [1]
    assert lyrics["path"] == "scores/ly1/lyrics/lyrics.json"
    assert (storage_root / "scores/ly1/ocr/page-001.png").is_file()
    xml = (storage_root / "scores/ly1/musicxml/v1.musicxml").read_bytes()
    parsed = read_musicxml(xml)
    assert [l.text for l in sorted(parsed.lyrics, key=lambda l: (l.measure, l.attack))] == TEXTS
    ET.fromstring(xml)  # vẫn là XML hợp lệ
    # MIDI vẫn được ghi sau khi chèn lời
    assert (storage_root / "scores/ly1/midi/v1.mid").read_bytes()[:4] == b"MThd"


def test_pipeline_fixes_fake_ottava_on_single_staff(storage_root, java, monkeypatch):
    run(storage_root, "ly2", monkeypatch)
    merged = (storage_root / "scores/ly2/kern/merged.krn").read_text()
    assert "8va" not in merged and "2ff" not in merged
    raw = (storage_root / "scores/ly2/kern/page-001.krn").read_text()
    assert "*8va" in raw  # kern thô của model vẫn được lưu nguyên để đối chiếu
    warnings = java.bodies("complete")[0]["resultData"]["warnings"]
    assert any("8va" in w for w in warnings)


def test_pipeline_without_ocr_still_completes(storage_root, java, monkeypatch):
    run(storage_root, "ly3", monkeypatch, ocr=False)
    done = java.bodies("complete")[0]["resultData"]
    assert done["lyrics"] == {"status": "skipped", "reason": "x"}
    assert not any("lời ca" in w for w in done["warnings"])


def test_lyrics_off(storage_root, java, monkeypatch):
    monkeypatch.setenv("OMR_LYRICS", "off")
    config.get_settings.cache_clear()
    run(storage_root, "ly4", monkeypatch)
    done = java.bodies("complete")[0]["resultData"]
    assert "lyrics" not in done
    assert not (storage_root / "scores/ly4/ocr").exists()


def test_engine_registry(monkeypatch):
    with pytest.raises(engines.UnknownEngine):
        engines.create_engine("khong-co")
    marker = object()
    engines.register_engine("thu-nghiem", lambda settings: marker)
    assert engines.create_engine("thu-nghiem") is marker
    assert "transcoda" in engines.available_engines()
    monkeypatch.setenv("OMR_OTTAVA", "sai")
    config.get_settings.cache_clear()
    with pytest.raises(ValueError):
        config.get_settings()
    config.get_settings.cache_clear()


def test_command_engine_reads_output_and_stdout(tmp_path, monkeypatch):
    import sys

    script = tmp_path / "fake_infer.py"
    script.write_text(
        "import sys\n"
        "args = dict(zip(sys.argv[1::2], sys.argv[2::2]))\n"
        "kern = '*clefG2\\n4c\\n=\\n'\n"
        "if '--out' in args:\n"
        "    open(args['--out'], 'w').write(kern)\n"
        "else:\n"
        "    print(kern)\n"
    )
    monkeypatch.setenv("OMR_ENGINE", "command")
    monkeypatch.setenv("OMR_ENGINE_COMMAND", f"{sys.executable} {script} --image {{image}} --out {{output}}")
    config.get_settings.cache_clear()
    engine = engines.create_engine()
    engine.wait_ready(lambda: None, 1)
    result = engine.recognize(tmp_path / "x.png", lambda: None)
    assert result.text.startswith("*clefG2") and result.millis >= 0
    monkeypatch.setenv("OMR_ENGINE_COMMAND", f"{sys.executable} {script} --image {{image}}")
    config.get_settings.cache_clear()
    assert "4c" in engines.create_engine().recognize(tmp_path / "x.png", lambda: None).text
    monkeypatch.setenv("OMR_ENGINE_COMMAND", "")
    config.get_settings.cache_clear()
    with pytest.raises(Exception):
        engines.create_engine().wait_ready(lambda: None, 1)
    config.get_settings.cache_clear()
