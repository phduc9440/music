import threading
import time
import uuid

import cv2
import numpy as np
import pytest

from app import config
from app.callback import JavaCallback
from app.jobs import JobManager, QueueFullError
from app.omr.pipeline import run_omr_job
from app.schemas import JobRequest
from tests.fake_java import FakeJava
from tests.synth import make_score_page


@pytest.fixture()
def java(monkeypatch):
    server = FakeJava(key="test-key")
    monkeypatch.setenv("JAVA_BASE_URL", server.url)
    monkeypatch.setenv("CALLBACK_RETRIES", "1")
    config.get_settings.cache_clear()
    yield server
    server.stop()


def write_images(root, score, pages):
    """pages: danh sách ảnh xám hoặc bytes (file hỏng). Trả danh sách input cho job."""
    inputs = []
    for i, page in enumerate(pages, start=1):
        rel = f"scores/{score}/original/{i:02d}-x.png"
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(page, bytes):
            path.write_bytes(page)
        else:
            cv2.imwrite(str(path), page)
        inputs.append({"path": rel, "kind": "IMAGE", "page": i})
    return inputs


def make_job(score, inputs, **options):
    options.setdefault("stopAfter", "PREPROCESS")  # các test ở file này chỉ kiểm tra phần tiền xử lý
    return JobRequest(taskId=str(uuid.uuid4()), scoreId=score, inputs=inputs, options=options)


def run(job, cancel=None, callback=None):
    run_omr_job(job, cancel or threading.Event(), callback or JavaCallback(str(job.taskId)))


BLANK = np.full((2400, 1700), 255, np.uint8)


def test_full_flow_skips_blank_page_and_reports_progress(storage_root, java):
    inputs = write_images(storage_root, "s1", [make_score_page(tilt=1.5), BLANK, make_score_page(seed=3)])
    job = make_job("s1", inputs, sourceType="SCAN")
    run(job)

    assert java.endpoints()[-1] == "complete"
    progress = [b["progress"] for b in java.bodies("progress")]
    assert progress == sorted(progress) and progress[0] == 5 and progress[-1] == 30
    assert {b["step"] for b in java.bodies("progress")} == {"SPLIT_PDF", "PREPROCESS"}

    files = java.bodies("files")
    assert [f["pageNumber"] for f in files] == [1, 2]  # đánh số liền mạch dù trang 2 gốc bị bỏ
    assert [f["meta"]["sourcePage"] for f in files] == [1, 3]
    assert files[0]["storagePath"] == "scores/s1/pages/page-001.png"
    assert files[0]["fileType"] == "PNG" and files[0]["meta"]["width"] == 1050 and files[0]["meta"]["height"] == 1485
    assert files[0]["meta"]["deskewAngle"] == pytest.approx(-1.5, abs=0.2)

    for f in files:  # file thật sự có trên đĩa, đúng kích thước, kích thước byte khớp
        png = cv2.imread(str(storage_root / f["storagePath"]), cv2.IMREAD_GRAYSCALE)
        assert png.shape == (1485, 1050)
        assert (storage_root / f["storagePath"]).stat().st_size == f["sizeBytes"]
    assert not list((storage_root / "scores/s1/pages").glob("*.tmp"))

    done = java.bodies("complete")[0]
    assert done["resultData"]["pageCount"] == 2 and done["resultData"]["sourcePageCount"] == 3
    assert any("Trang 2 không có khuông nhạc" in w for w in done["resultData"]["warnings"])
    assert done["scoreMetadata"] == {"pageCount": 2}
    assert "fail" not in java.endpoints()


def test_all_pages_without_staff_fails(storage_root, java):
    run(make_job("s2", write_images(storage_root, "s2", [BLANK, BLANK])))
    assert java.endpoints()[-1] == "fail"
    assert java.bodies("fail")[0] == {"errorCode": "NO_STAFF_DETECTED"}
    assert "complete" not in java.endpoints()


def test_unreadable_page_reports_page_number(storage_root, java):
    inputs = write_images(storage_root, "s3", [make_score_page(), b"this is not an image"])
    run(make_job("s3", inputs))
    assert java.bodies("fail") == [{"errorCode": "PAGE_UNREADABLE", "message": "trang 2"}]


def test_preprocess_false_keeps_every_page(storage_root, java):
    inputs = write_images(storage_root, "s4", [BLANK, make_score_page()])
    run(make_job("s4", inputs, preprocess=False))
    files = java.bodies("files")
    assert len(files) == 2 and all(f["meta"]["preprocessed"] is False for f in files)
    assert java.bodies("complete")[0]["resultData"]["pageCount"] == 2


def test_stop_after_preprocess_ends_without_inference(storage_root, java):
    run(make_job("s5", write_images(storage_root, "s5", [make_score_page()]), stopAfter="PREPROCESS"))
    result = java.bodies("complete")[0]["resultData"]
    assert result["stoppedAfter"] == "PREPROCESS" and "kernPath" not in result


def test_old_pages_are_removed_on_rerun(storage_root, java):
    stale = storage_root / "scores/s6/pages/page-007.png"
    stale.parent.mkdir(parents=True)
    stale.write_bytes(b"old")
    run(make_job("s6", write_images(storage_root, "s6", [make_score_page()])))
    assert not stale.exists() and (storage_root / "scores/s6/pages/page-001.png").exists()


def test_cancel_stops_between_pages_without_callbacks(storage_root, java):
    inputs = write_images(storage_root, "s7", [make_score_page(seed=i) for i in range(4)])
    cancel = threading.Event()

    class CancelAfterFirstFile(JavaCallback):
        def file(self, **kwargs):
            ok = super().file(**kwargs)
            cancel.set()  # Java hủy ngay sau trang đầu
            return ok

    job = make_job("s7", inputs)
    run(job, cancel, CancelAfterFirstFile(str(job.taskId)))
    assert len(java.bodies("files")) == 1
    assert "complete" not in java.endpoints() and "fail" not in java.endpoints()


def test_page_timeout_fails_with_task_timeout(storage_root, java, monkeypatch):
    monkeypatch.setenv("PAGE_TIMEOUT_S", "0")
    config.get_settings.cache_clear()
    run(make_job("s8", write_images(storage_root, "s8", [make_score_page()])))
    fail = java.bodies("fail")[0]
    assert fail["errorCode"] == "TASK_TIMEOUT" and "trang 1" in fail["message"]


def test_task_gone_stops_quietly(storage_root, java):
    java.reject_with["progress"] = 404  # Java báo task không còn
    run(make_job("s9", write_images(storage_root, "s9", [make_score_page()])))
    assert "fail" not in java.endpoints() and "complete" not in java.endpoints()


def test_wrong_key_is_not_retried(storage_root, java, monkeypatch):
    monkeypatch.setenv("INTERNAL_KEY", "wrong")
    config.get_settings.cache_clear()
    assert JavaCallback(str(uuid.uuid4())).progress(5, "SPLIT_PDF") is False
    assert java.calls == []


def test_unreachable_java_does_not_crash_job(storage_root, monkeypatch):
    monkeypatch.setenv("JAVA_BASE_URL", "http://127.0.0.1:9")  # không ai nghe
    monkeypatch.setenv("CALLBACK_RETRIES", "1")
    config.get_settings.cache_clear()
    run(make_job("s10", write_images(storage_root, "s10", [make_score_page()])))
    assert (storage_root / "scores/s10/pages/page-001.png").exists()


# ---------------------------------------------------------------- JobManager


def _job(storage_root, score="m"):
    return make_job(score, write_images(storage_root, score, [make_score_page(width=900, height=1200, systems=1)]))


def wait_for(predicate, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if predicate():
            return True
        time.sleep(0.02)
    return False


def test_manager_runs_sequentially_and_dedups(storage_root):
    order, gate = [], threading.Event()

    def runner(job, cancel, callback):
        order.append(("start", str(job.taskId)))
        gate.wait(2)
        order.append(("end", str(job.taskId)))

    manager = JobManager(runner=runner, callback_factory=lambda tid: None, max_queue=2)
    manager.start()
    try:
        a, b = _job(storage_root, "a"), _job(storage_root, "b")
        assert manager.submit(a) == "accepted"
        assert manager.submit(a) == "duplicate"  # Java gửi lại cùng taskId
        assert manager.submit(b) == "accepted"
        assert wait_for(lambda: len(order) == 1) and manager.queue_size == 2
        gate.set()
        assert wait_for(lambda: len(order) == 4)
        # Tuần tự: a xong hẳn rồi mới tới b
        assert [e[0] for e in order] == ["start", "end", "start", "end"]
        assert order[0][1] == str(a.taskId) and order[2][1] == str(b.taskId)
        assert wait_for(lambda: manager.queue_size == 0)
    finally:
        manager.stop()


def test_manager_cancel_queued_and_unknown(storage_root):
    started, gate = threading.Event(), threading.Event()
    ran = []

    def runner(job, cancel, callback):
        ran.append(str(job.taskId))
        started.set()
        gate.wait(2)

    manager = JobManager(runner=runner, callback_factory=lambda tid: None)
    manager.start()
    try:
        first, second = _job(storage_root, "c1"), _job(storage_root, "c2")
        manager.submit(first)
        manager.submit(second)
        assert started.wait(2)
        assert manager.cancel(str(second.taskId)) is True  # đang chờ -> bỏ khỏi hàng đợi
        assert manager.cancel(str(uuid.uuid4())) is False
        gate.set()
        assert wait_for(lambda: manager.queue_size == 0)
        assert ran == [str(first.taskId)]  # job thứ hai không bao giờ chạy
    finally:
        manager.stop()


def test_manager_cancel_running_sets_event(storage_root):
    seen, started = {}, threading.Event()

    def runner(job, cancel, callback):
        started.set()
        seen["cancelled"] = cancel.wait(2)

    manager = JobManager(runner=runner, callback_factory=lambda tid: None)
    manager.start()
    try:
        job = _job(storage_root, "c3")
        manager.submit(job)
        assert started.wait(2)
        assert manager.cancel(str(job.taskId)) is True
        assert wait_for(lambda: "cancelled" in seen) and seen["cancelled"] is True
    finally:
        manager.stop()


def test_manager_queue_full(storage_root):
    gate = threading.Event()
    manager = JobManager(
        runner=lambda job, cancel, cb: gate.wait(2), callback_factory=lambda tid: None, max_queue=1
    )  # chưa start: hàng đợi không bị rút
    manager.submit(_job(storage_root, "q1"))
    with pytest.raises(QueueFullError):
        manager.submit(_job(storage_root, "q2"))
    gate.set()
