"""Bước EXPORT của pipeline (đặc tả mục 2.4): kern -> MusicXML -> MIDI.

music21 được thay bằng bản giả ghi MusicXML dựng sẵn; chuẩn hóa MusicXML và ghi MIDI là code thật.
"""

import threading
import uuid

import pytest
from pydantic import ValidationError

from app import config
from app.callback import JavaCallback
from app.convert.errors import ConversionError
from app.convert.musicxml import normalize_musicxml
from app.omr import kern_check, merge
from app.omr import pipeline as pipeline_module
from app.omr.pipeline import run_omr_job
from app.schemas import JobRequest, KernToMusicXmlRequest, MusicXmlToMidiRequest
from tests.fake_java import FakeJava
from tests.fake_recognizer import FakeRecognizer
from tests.kern_samples import PAGE_1, PAGE_2_BARE
from tests.synth import make_score_page
from tests.test_pipeline import write_images
from tests.xml_samples import note, part, score


@pytest.fixture()
def java(monkeypatch):
    server = FakeJava(key="test-key")
    monkeypatch.setenv("JAVA_BASE_URL", server.url)
    monkeypatch.setenv("CALLBACK_RETRIES", "1")
    config.get_settings.cache_clear()
    yield server
    server.stop()


@pytest.fixture(autouse=True)
def music21_unavailable(monkeypatch):
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("unavailable", "chưa cài music21"))


def four_measure_xml() -> bytes:
    """MusicXML như music21 trả về cho 4 ô nhịp 3/4 giọng Sol trưởng, tay trái đứng trước tay phải."""
    treble = [[note("G", 4, 1), note("A", 4, 1), note("B", 4, 1)] for _ in range(4)]
    bass = [[note("G", 2, 3)] for _ in range(4)]
    return score(part("P1", 1, ("F", 4), bass, tempo=96), part("P2", 1, ("G", 2), treble))


def fake_music21(monkeypatch, data=None, error=None, on_call=None):
    calls = []

    def fake(kern_path, out_path, tempo_bpm):
        calls.append((kern_path, out_path, tempo_bpm))
        if on_call:
            on_call()
        if error:
            raise error
        result = normalize_musicxml(data or four_measure_xml(), tempo_bpm)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(result.xml)
        return result

    monkeypatch.setattr(pipeline_module, "kern_file_to_musicxml_file", fake)
    return calls


def export_job(score_id, version=1, **options):
    pages = 2
    return JobRequest(
        taskId=str(uuid.uuid4()),
        scoreId=score_id,
        inputs=[
            {"path": f"scores/{score_id}/original/{i:02d}-x.png", "kind": "IMAGE", "page": i}
            for i in range(1, pages + 1)
        ],
        options={"stopAfter": "EXPORT", "musicXmlVersion": version, **options},
    )


def run(job, cancel=None):
    recognizer = FakeRecognizer([PAGE_1, PAGE_2_BARE])
    run_omr_job(job, cancel or threading.Event(), JavaCallback(str(job.taskId)), recognizer=recognizer)


def setup(storage_root, score_id, version=1, **options):
    write_images(storage_root, score_id, [make_score_page(seed=i) for i in range(2)])
    return export_job(score_id, version, **options)


def test_export_writes_versioned_files_and_reports_them(storage_root, java, monkeypatch):
    calls = fake_music21(monkeypatch)
    run(setup(storage_root, "e1", version=2))

    assert java.endpoints()[-1] == "complete" and "fail" not in java.endpoints()
    # music21 nhận kern đã ghép và tempo rút từ *MM96
    assert calls[0][0] == storage_root / "scores/e1/kern/merged.krn"
    assert calls[0][1] == storage_root / "scores/e1/musicxml/v2.musicxml" and calls[0][2] == 96

    files = {f["fileType"]: f for f in java.bodies("files") if f["fileType"] in ("MUSICXML", "MIDI")}
    xml, midi = files["MUSICXML"], files["MIDI"]
    assert xml["storagePath"] == "scores/e1/musicxml/v2.musicxml" and xml["version"] == 2
    assert xml["contentType"] == "application/vnd.recordare.musicxml+xml"
    assert xml["sizeBytes"] == (storage_root / xml["storagePath"]).stat().st_size
    assert midi["storagePath"] == "scores/e1/midi/v2.mid" and midi["version"] == 2
    assert midi["meta"]["sourceVersion"] == 2 and midi["meta"]["tracks"] == 2
    assert (storage_root / midi["storagePath"]).read_bytes()[:4] == b"MThd"
    # MusicXML đăng ký trước MIDI, cả hai trước complete
    order = [(e, b.get("fileType")) for _, e, b in java.calls if e in ("files", "complete")]
    assert order.index(("files", "MUSICXML")) < order.index(("files", "MIDI")) < order.index(("complete", None))

    progress = [(b["progress"], b["step"]) for b in java.bodies("progress")]
    values = [p for p, _ in progress]
    assert values == sorted(values) and progress[-1] == (98, "EXPORT") and (95, "EXPORT") in progress


def test_complete_carries_metadata_from_musicxml_and_no_stopped_after(storage_root, java, monkeypatch):
    fake_music21(monkeypatch)
    run(setup(storage_root, "e2", version=3))
    done = java.bodies("complete")[0]

    assert "stoppedAfter" not in done["resultData"]  # chạy đủ pipeline không phải "dừng sớm"
    assert done["resultData"]["musicXmlVersion"] == 3
    assert done["resultData"]["musicXmlPath"] == "scores/e2/musicxml/v3.musicxml"
    assert done["resultData"]["midiPath"] == "scores/e2/midi/v3.mid"
    assert done["resultData"]["pageMeasures"] == [
        {"page": 1, "firstMeasure": 1, "lastMeasure": 2},
        {"page": 2, "firstMeasure": 3, "lastMeasure": 4},
    ]
    assert done["scoreMetadata"] == {
        "pageCount": 2,
        "measureCount": 4,
        "staffCount": 2,
        "keySignature": "G",  # định dạng của đặc tả mục 1.1 (không phải "G major" như tạm rút từ kern)
        "timeSignature": "3/4",
        "tempoBpm": 96,
    }
    assert not any("khác MusicXML" in w for w in done["resultData"]["warnings"])


def test_measure_count_mismatch_clamps_pages_and_warns(storage_root, java, monkeypatch):
    two_measures = score(
        part("P1", 1, ("F", 4), [[note("G", 2, 3)]] * 2), part("P2", 1, ("G", 2), [[note("G", 4, 3)]] * 2)
    )
    fake_music21(monkeypatch, data=two_measures)
    run(setup(storage_root, "e3"))
    done = java.bodies("complete")[0]

    assert done["resultData"]["pageMeasures"][-1] == {"page": 2, "firstMeasure": 2, "lastMeasure": 2}
    assert any("khác MusicXML" in w for w in done["resultData"]["warnings"])


@pytest.mark.parametrize(
    "error, code, message",
    [
        (ConversionError("music21 không đọc được kern: dòng 7 sai"), "EXPORT_ERROR", "music21 không đọc được kern"),
        (RuntimeError("boom"), "EXPORT_ERROR", "RuntimeError: boom"),
    ],
)
def test_export_failure_reports_export_error_and_keeps_kern(storage_root, java, monkeypatch, error, code, message):
    fake_music21(monkeypatch, error=error)
    run(setup(storage_root, "e4"))

    [failure] = java.bodies("fail")
    assert failure["errorCode"] == code and message in failure["message"]
    assert "complete" not in java.endpoints()
    assert not [f for f in java.bodies("files") if f["fileType"] in ("MUSICXML", "MIDI")]
    assert (storage_root / "scores/e4/kern/merged.krn").exists()  # vẫn giữ kern để gỡ lỗi


def test_cancel_during_export_sends_nothing_more(storage_root, java, monkeypatch):
    cancel = threading.Event()
    fake_music21(monkeypatch, on_call=cancel.set)
    run(setup(storage_root, "e5"), cancel=cancel)

    assert "complete" not in java.endpoints() and "fail" not in java.endpoints()
    assert not [f for f in java.bodies("files") if f["fileType"] in ("MUSICXML", "MIDI")]


def test_stop_after_merge_skips_export(storage_root, java, monkeypatch):
    calls = fake_music21(monkeypatch)
    run(setup(storage_root, "e6", stopAfter="MERGE"))

    assert calls == [] and java.bodies("complete")[0]["resultData"]["stoppedAfter"] == "MERGE"


def test_unknown_stop_after_runs_full_pipeline_with_warning(storage_root, java, monkeypatch):
    fake_music21(monkeypatch)
    run(setup(storage_root, "e7", stopAfter="XYZ"))
    done = java.bodies("complete")[0]

    assert "musicXmlPath" in done["resultData"]
    assert any("XYZ" in w for w in done["resultData"]["warnings"])


def test_page_measure_ranges_follow_merged_kern():
    p1, _ = merge.clean_page(1, PAGE_1)
    p2, _ = merge.clean_page(2, PAGE_2_BARE)
    merged = merge.merge_pages([p1, p2])
    assert merge.page_measure_ranges(merged) == [
        {"page": 1, "firstMeasure": 1, "lastMeasure": 2},
        {"page": 2, "firstMeasure": 3, "lastMeasure": 4},
    ]
    assert merge.extract_metadata(merged).measure_count == 4


# ---------------------------------------------------------------- schema /convert/**


def make_files(storage_root, *relatives):
    for relative in relatives:
        target = storage_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"x")


def test_job_options_accept_music_xml_version(storage_root):
    make_files(storage_root, "scores/s1/original/01-x.png", "scores/s1/original/02-x.png")
    assert export_job("s1", version=5).options.musicXmlVersion == 5
    with pytest.raises(ValidationError, match="musicXmlVersion"):  # đúng lỗi về version, không phải thiếu file
        export_job("s1", version=0)


def test_convert_requests_accept_valid_paths(storage_root):
    make_files(storage_root, "scores/a/kern/merged.krn", "scores/a/musicxml/v1.musicxml")
    kern = KernToMusicXmlRequest(kernPath="scores/a/kern/merged.krn", outPath="scores/a/musicxml/v2.musicxml")
    assert kern.tempoBpm is None
    midi = MusicXmlToMidiRequest(musicXmlPath="scores/a/musicxml/v1.musicxml", outPath="scores/a/midi/v1.mid")
    assert midi.tempoBpm == 100


@pytest.mark.parametrize(
    "out_path",
    [
        "scores/a/musicxml/../../b/x.mid",  # thoát thư mục
        "/etc/x.mid",  # tuyệt đối
        "scores/b/midi/v1.mid",  # khác bản nhạc
        "scores/a/midi/v1.txt",  # sai đuôi
        "midi/v1.mid",  # không nằm trong scores/{id}/
    ],
)
def test_convert_midi_request_rejects_unsafe_output(storage_root, out_path):
    make_files(storage_root, "scores/a/musicxml/v1.musicxml")
    with pytest.raises(ValidationError):
        MusicXmlToMidiRequest(musicXmlPath="scores/a/musicxml/v1.musicxml", outPath=out_path)


def test_convert_requests_reject_missing_input_and_bad_tempo(storage_root):
    with pytest.raises(ValidationError):
        KernToMusicXmlRequest(kernPath="scores/a/kern/merged.krn", outPath="scores/a/musicxml/v1.musicxml")
    make_files(storage_root, "scores/a/musicxml/v1.musicxml")
    with pytest.raises(ValidationError):
        MusicXmlToMidiRequest(musicXmlPath="scores/a/musicxml/v1.musicxml", outPath="scores/a/midi/v1.mid", tempoBpm=5)
