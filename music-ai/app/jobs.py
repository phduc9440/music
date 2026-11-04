"""Hàng đợi job OMR: một luồng worker xử lý tuần tự (đặc tả mục 6.1: 1 job OMR một lúc).

Lý do tuần tự: nhánh sau chỉ có 1 model/1 GPU, chạy song song sẽ tranh bộ nhớ. Tiền xử lý ảnh nặng CPU nên cũng
không có lợi khi chạy nhiều job cùng lúc.
"""

from __future__ import annotations

import logging
import queue
import threading
from dataclasses import dataclass, field
from typing import Callable, Optional

from app.callback import JavaCallback
from app.config import get_settings
from app.omr.pipeline import run_omr_job
from app.schemas import JobRequest

log = logging.getLogger(__name__)

# Số job đã xong giữ lại trong bộ nhớ để nhận biết gửi trùng; quá số này thì bỏ bớt job cũ nhất
_MAX_REMEMBERED = 500

QUEUED, RUNNING, DONE, CANCELLED = "queued", "running", "done", "cancelled"


class QueueFullError(Exception):
    """Hàng đợi đã đầy."""


@dataclass
class _JobState:
    job: JobRequest
    status: str = QUEUED
    cancel_event: threading.Event = field(default_factory=threading.Event)


class JobManager:
    """Nhận job, xếp hàng, chạy tuần tự trên một luồng nền và hỗ trợ hủy."""

    def __init__(
        self,
        runner: Callable[[JobRequest, threading.Event, JavaCallback], None] = run_omr_job,
        callback_factory: Callable[[str], JavaCallback] = JavaCallback,
        max_queue: Optional[int] = None,
    ) -> None:
        self._runner = runner
        self._callback_factory = callback_factory
        self._queue: "queue.Queue[str]" = queue.Queue(maxsize=max_queue or get_settings().queue_max)
        self._jobs: dict[str, _JobState] = {}
        self._lock = threading.Lock()
        self._stopping = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # ------------------------------------------------------------------ vòng đời

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stopping.clear()
        self._thread = threading.Thread(target=self._worker, name="omr-worker", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stopping.set()
        with self._lock:
            for state in self._jobs.values():
                state.cancel_event.set()
        if self._thread:
            self._thread.join(timeout)

    # ------------------------------------------------------------------ API

    def submit(self, job: JobRequest) -> str:
        """Xếp hàng một job. Trả ``"accepted"``, hoặc ``"duplicate"`` nếu cùng taskId đang chờ/đang chạy.

        Gửi trùng là bình thường (Java gửi lại khi chưa chắc music-ai đã nhận), nên không tạo job thứ hai.
        Ném :class:`QueueFullError` nếu hàng đợi đầy.
        """
        task_id = str(job.taskId)
        with self._lock:
            existing = self._jobs.get(task_id)
            if existing and existing.status in (QUEUED, RUNNING):
                return "duplicate"
            state = _JobState(job=job)
            self._jobs[task_id] = state
            try:
                self._queue.put_nowait(task_id)
            except queue.Full:
                del self._jobs[task_id]
                raise QueueFullError() from None
            self._evict_old()
        return "accepted"

    def cancel(self, task_id: str) -> bool:
        """Hủy job đang chờ (bỏ khỏi hàng đợi) hoặc đang chạy (dừng ở lần kiểm tra kế tiếp). Trả False nếu không có."""
        with self._lock:
            state = self._jobs.get(task_id)
            if state is None or state.status in (DONE, CANCELLED):
                return False
            state.cancel_event.set()
            if state.status == QUEUED:
                state.status = CANCELLED
            return True

    @property
    def queue_size(self) -> int:
        """Số job đang chờ cộng job đang chạy."""
        with self._lock:
            return sum(1 for s in self._jobs.values() if s.status in (QUEUED, RUNNING))

    # ------------------------------------------------------------------ nội bộ

    def _worker(self) -> None:
        while not self._stopping.is_set():
            try:
                task_id = self._queue.get(timeout=0.5)
            except queue.Empty:
                continue
            with self._lock:
                state = self._jobs.get(task_id)
                if state is None or state.status != QUEUED:
                    continue  # đã bị hủy khi còn chờ
                state.status = RUNNING
            try:
                self._runner(state.job, state.cancel_event, self._callback_factory(task_id))
            except Exception:  # noqa: BLE001 - worker không được chết vì một job
                log.exception("Job %s thoát bằng ngoại lệ", task_id)
            finally:
                with self._lock:
                    state.status = DONE

    def _evict_old(self) -> None:
        """Gọi khi đang giữ khóa: bỏ bớt job đã xong cũ nhất nếu nhớ quá nhiều."""
        if len(self._jobs) <= _MAX_REMEMBERED:
            return
        for key in [k for k, s in self._jobs.items() if s.status in (DONE, CANCELLED)]:
            del self._jobs[key]
            if len(self._jobs) <= _MAX_REMEMBERED:
                break
