import threading
import uuid

import pytest

from app import config
from app.callback import JavaCallback
from app.omr import kern_check
from app.omr.pipeline import run_omr_job
from app.schemas import JobRequest
from tests.fake_java import FakeJava
from tests.fake_recognizer import FakeRecognizer
from tests.kern_samples import PAGE_1, PAGE_2_BARE, T, kern
from tests.synth import make_score_page
from tests.test_pipeline import BLANK, write_images


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
    """Mặc định coi như chưa cài music21 (cloud/CI không có); test nào cần thì tự đặt lại."""
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("unavailable", "chưa cài music21"))


def job_for(score, count=2, **options):
    return JobRequest(
        taskId=str(uuid.uuid4()),
        scoreId=score,
        inputs=[{"path": f"scores/{score}/original/{i:02d}-x.png", "kind": "IMAGE", "page": i} for i in range(1, count + 1)],
        options={"stopAfter": "MERGE", **options},
    )


def run(job, recognizer, cancel=None):
    run_omr_job(job, cancel or threading.Event(), JavaCallback(str(job.taskId)), recognizer=recognizer)


def setup_pages(root, score, count=2):
    write_images(root, score, [make_score_page(seed=i) for i in range(count)])
    return job_for(score, count)


def test_full_recognition_flow(storage_root, java):
    job = setup_pages(storage_root, "r1")
    recognizer = FakeRecognizer([PAGE_1, PAGE_2_BARE])
    run(job, recognizer)

    assert java.endpoints()[-1] == "complete" and "fail" not in java.endpoints()
    assert len(recognizer.calls) == 2 and recognizer.calls[0].endswith("pages/page-001.png")

    # tiến độ không giảm, đủ các bước, INFERENCE 30..85 rồi MERGE tới 90
    progress = [(b["progress"], b["step"]) for b in java.bodies("progress")]
    values = [p for p, _ in progress]
    assert values == sorted(values) and values[-1] == 90
    assert ("INFERENCE" in {s for _, s in progress}) and ("MERGE" in {s for _, s in progress})
    inference = [p for p, s in progress if s == "INFERENCE"]
    assert inference[0] == 30 and inference[-1] == 85 and 58 in inference  # 30 + 55 * 1 / 2 = 57.5 -> 58

    # file kern từng trang và bản ghép
    assert (storage_root / "scores/r1/kern/page-001.krn").read_text(encoding="utf-8").startswith("**kern")
    merged = (storage_root / "scores/r1/kern/merged.krn").read_text(encoding="utf-8")
    assert merged.startswith(f"**kern{T}**kern") and merged.rstrip().endswith(f"*-{T}*-")

    kern_files = [f for f in java.bodies("files") if f["fileType"] == "KERN"]
    assert len(kern_files) == 1
    assert kern_files[0]["storagePath"] == "scores/r1/kern/merged.krn"
    assert kern_files[0]["pageNumber"] is None
    assert kern_files[0]["meta"]["pages"] == ["scores/r1/kern/page-001.krn", "scores/r1/kern/page-002.krn"]
    assert kern_files[0]["sizeBytes"] == (storage_root / "scores/r1/kern/merged.krn").stat().st_size

    done = java.bodies("complete")[0]
    assert done["resultData"]["stoppedAfter"] == "MERGE" and done["resultData"]["pageCount"] == 2
    assert done["resultData"]["kernPath"] == "scores/r1/kern/merged.krn"
    assert done["resultData"]["inferenceMs"] == [7, 7]
    assert done["scoreMetadata"] == {
        "pageCount": 2,
        "measureCount": 4,
        "staffCount": 2,
        "keySignature": "G major",
        "timeSignature": "3/4",
        "tempoBpm": 96,
    }
    # music21 chưa cài thì có cảnh báo nhưng vẫn COMPLETED
    assert any("music21" in w for w in done["resultData"]["warnings"])


def test_empty_page_is_skipped_with_warning(storage_root, java):
    job = setup_pages(storage_root, "r2")
    run(job, FakeRecognizer([PAGE_1, "không có kern gì cả"]))
    done = java.bodies("complete")[0]
    assert any("Trang 2" in w and "**kern" in w for w in done["resultData"]["warnings"])
    assert done["resultData"]["pageCount"] == 2  # số trang ảnh; kern chỉ ghép trang dùng được
    assert "fail" not in java.endpoints()


def test_all_pages_empty_fails_recognition_empty(storage_root, java):
    job = setup_pages(storage_root, "r3")
    run(job, FakeRecognizer([kern("**kern|**kern", "=1|=1", "*-|*-")]))
    assert java.bodies("fail") == [{"errorCode": "RECOGNITION_EMPTY", "message": "không nhận diện được nốt nào ở cả 2 trang"}]
    assert "complete" not in java.endpoints()
    assert not (storage_root / "scores/r3/kern/merged.krn").exists()


def test_spine_mismatch_fails(storage_root, java, monkeypatch):
    # Mặc định ghép nới lỏng (tự vá số spine); test này kiểm tra chế độ nghiêm ngặt theo đúng đặc tả
    monkeypatch.setenv("MERGE_LENIENT_SPINES", "false")
    config.get_settings.cache_clear()
    job = setup_pages(storage_root, "r4")
    ragged = kern("**kern|**kern|**kern", "=1|=1|=1", "4c|4e|4g", "*^|*|*", "4c|4c|4e|4g")
    run(job, FakeRecognizer([PAGE_1, ragged]))
    assert java.bodies("fail") == [{"errorCode": "MERGE_SPINE_MISMATCH", "message": "trang 2"}]


def test_kern_parse_error_fails_but_keeps_file(storage_root, java, monkeypatch):
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("error", "ValueError: dòng 7 sai"))
    job = setup_pages(storage_root, "r5")
    run(job, FakeRecognizer([PAGE_1, PAGE_2_BARE]))
    assert java.bodies("fail") == [{"errorCode": "KERN_PARSE_ERROR", "message": "ValueError: dòng 7 sai"}]
    assert (storage_root / "scores/r5/kern/merged.krn").exists()
    # file KERN đã được đăng ký trước khi báo lỗi để người dùng xem lại được
    assert any(f["fileType"] == "KERN" for f in java.bodies("files"))
    assert "complete" not in java.endpoints()


def test_kern_parse_error_only_warns_in_warn_mode(storage_root, java, monkeypatch):
    monkeypatch.setenv("KERN_PARSE_MODE", "warn")
    config.get_settings.cache_clear()
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("error", "ValueError: dòng 7 sai"))
    job = setup_pages(storage_root, "r6")
    run(job, FakeRecognizer([PAGE_1, PAGE_2_BARE]))
    done = java.bodies("complete")[0]
    assert any("music21 không đọc được kern" in w for w in done["resultData"]["warnings"])


def test_music21_ok_adds_no_warning(storage_root, java, monkeypatch):
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("ok", ""))
    job = setup_pages(storage_root, "r7")
    run(job, FakeRecognizer([PAGE_1, PAGE_2_BARE]))
    assert java.bodies("complete")[0]["resultData"]["warnings"] == []


def test_model_not_loaded_fails(storage_root, java):
    job = setup_pages(storage_root, "r8")
    run(job, FakeRecognizer([], state="failed", error="ImportError: no module named torch"))
    assert java.bodies("fail") == [{"errorCode": "MODEL_NOT_LOADED", "message": "ImportError: no module named torch"}]
    # tiền xử lý đã chạy xong và ảnh trang vẫn được đăng ký
    assert len([f for f in java.bodies("files") if f["fileType"] == "PNG"]) == 2


def test_measure_and_spine_warnings_are_forwarded(storage_root, java):
    job = setup_pages(storage_root, "r9")
    bad = PAGE_2_BARE.replace(f"4E{T}4e", f"2E{T}2e")
    run(job, FakeRecognizer([PAGE_1, bad]))
    warnings = java.bodies("complete")[0]["resultData"]["warnings"]
    assert any(w.startswith("Trang 2, ô nhịp 3:") for w in warnings)


def test_truncated_output_warns(storage_root, java):
    job = setup_pages(storage_root, "r10", 1)
    run(job_for("r10", 1), FakeRecognizer([PAGE_1.replace(f"*-{T}*-\n", "")], truncated=True))
    warnings = java.bodies("complete")[0]["resultData"]["warnings"]
    assert any("chạm giới hạn" in w for w in warnings)


def test_cancel_during_inference_stops_without_callbacks(storage_root, java):
    job = setup_pages(storage_root, "r11", 3)
    cancel = threading.Event()
    recognizer = FakeRecognizer([PAGE_1], on_call=lambda i: cancel.set() if i == 0 else None, delay_s=0.2)
    run(job, recognizer, cancel)
    assert len(recognizer.calls) == 1
    assert "complete" not in java.endpoints() and "fail" not in java.endpoints()
    assert not (storage_root / "scores/r11/kern/merged.krn").exists()


def test_inference_page_timeout_fails_with_task_timeout(storage_root, java, monkeypatch):
    monkeypatch.setenv("INFERENCE_PAGE_TIMEOUT_S", "0")
    config.get_settings.cache_clear()
    job = setup_pages(storage_root, "r12", 1)
    run(job, FakeRecognizer([PAGE_1], delay_s=1.0))
    fail = java.bodies("fail")[0]
    assert fail["errorCode"] == "TASK_TIMEOUT" and fail["message"].startswith("trang 1 quá")


def test_stop_after_preprocess_does_not_touch_model(storage_root, java):
    write_images(storage_root, "r13", [make_score_page()])
    job = job_for("r13", 1, stopAfter="PREPROCESS")
    recognizer = FakeRecognizer([PAGE_1])
    run(job, recognizer)
    assert recognizer.calls == []
    done = java.bodies("complete")[0]
    assert done["resultData"]["stoppedAfter"] == "PREPROCESS" and "kernPath" not in done["resultData"]
    assert done["scoreMetadata"] == {"pageCount": 1}


@pytest.mark.parametrize("stop_after", ["EXPORT", "INFERENCE", "merge"])
def test_later_stop_after_values_run_through_merge(storage_root, java, stop_after):
    write_images(storage_root, "r14", [make_score_page()])
    run(job_for("r14", 1, stopAfter=stop_after), FakeRecognizer([PAGE_1]))
    assert java.bodies("complete")[0]["resultData"]["stoppedAfter"] == "MERGE"


def test_unknown_stop_after_warns_and_runs_through_merge(storage_root, java):
    write_images(storage_root, "r15", [make_score_page()])
    run(job_for("r15", 1, stopAfter="NONSENSE"), FakeRecognizer([PAGE_1]))
    result = java.bodies("complete")[0]["resultData"]
    assert result["stoppedAfter"] == "MERGE" and any("NONSENSE" in w for w in result["warnings"])


def test_old_page_kern_files_are_removed_on_rerun(storage_root, java):
    stale = storage_root / "scores/r16/kern/page-009.krn"
    stale.parent.mkdir(parents=True)
    stale.write_text("cũ", encoding="utf-8")
    write_images(storage_root, "r16", [make_score_page()])
    run(job_for("r16", 1), FakeRecognizer([PAGE_1]))
    assert not stale.exists() and (storage_root / "scores/r16/kern/page-001.krn").exists()


def test_no_staff_still_fails_before_inference(storage_root, java):
    write_images(storage_root, "r17", [BLANK])
    recognizer = FakeRecognizer([PAGE_1])
    run(job_for("r17", 1), recognizer)
    assert java.bodies("fail") == [{"errorCode": "NO_STAFF_DETECTED"}]
    assert recognizer.calls == []
