"""OMR-T03: ngân sách thời gian theo số trang và nhịp tim tiến độ."""

from __future__ import annotations

import threading

from app import config
from app.omr.pipeline import Budget, JobTimeout, ProgressHeartbeat


def test_task_budget_grows_with_pages_and_stops_at_the_cap(monkeypatch):
    monkeypatch.setenv("TASK_TIMEOUT_BASE_S", "300")
    monkeypatch.setenv("TASK_TIMEOUT_PER_PAGE_S", "180")
    monkeypatch.setenv("TASK_TIMEOUT_S", "1800")
    config.get_settings.cache_clear()
    settings = config.get_settings()
    assert settings.task_budget_s(1) == 480
    assert settings.task_budget_s(6) == 1380  # bài 6 trang trên CPU không còn bị cắt ở 600 giây
    assert settings.task_budget_s(40) == 1800
    assert settings.task_budget_s(0) == 480  # chưa biết số trang: tính như một trang


def test_budget_can_be_extended_after_split():
    now = [0.0]
    budget = Budget(threading.Event(), 100, 90, clock=lambda: now[0])
    now[0] = 150
    budget.set_task_budget(200)
    budget.check()  # còn hạn vì ngân sách mới tính từ lúc bắt đầu job
    now[0] = 201
    try:
        budget.check()
    except JobTimeout as exc:
        assert exc.scope == "task"
    else:
        raise AssertionError("phải hết hạn")


class _Recorder:
    def __init__(self) -> None:
        self.calls: list[tuple[int, str]] = []

    def progress(self, progress: int, step: str) -> bool:
        self.calls.append((progress, step))
        return True

    def complete(self, result_data, score_metadata=None) -> bool:
        return True


def test_heartbeat_resends_the_last_progress_only_when_quiet_too_long():
    now = [0.0]
    inner = _Recorder()
    beat = ProgressHeartbeat(inner, 240, clock=lambda: now[0])
    assert beat.beat() is False  # chưa có tiến độ nào
    beat.progress(30, "INFERENCE")
    now[0] = 200
    assert beat.beat() is False
    now[0] = 241
    assert beat.beat() is True
    assert inner.calls == [(30, "INFERENCE"), (30, "INFERENCE")]
    assert beat.complete({}) is True  # lời gọi khác chuyển thẳng cho callback gốc
