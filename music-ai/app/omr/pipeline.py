"""Pipeline OMR của music-ai (đặc tả mục 2.2, 6.3).

Hiện có hai bước, mỗi bước báo tiến độ về Java qua callback:

    SPLIT_PDF   (5-10%)   tách PDF thành ảnh từng trang / đọc các ảnh đầu vào
    PREPROCESS  (10-30%)  tiền xử lý từng trang -> lưu ``pages/page-NNN.png`` -> callback ``files`` -> báo tiến độ

Sau PREPROCESS, job tạm kết thúc (``omr.stop-after=PREPROCESS``) bằng callback ``complete``.

CẮM THÊM BƯỚC Ở NHÁNH feature/omr-recognition: thêm hằng bước vào ``IMPLEMENTED_STEPS``, viết hàm
``_run_inference``/``_run_merge``/``_run_export`` nhận ``JobContext`` rồi gọi chúng trong :func:`_run` ngay trước
``_finish``; các khoảng tiến độ tiếp theo là INFERENCE 30-85%, MERGE 85-90%, EXPORT 90-100%.

Quy tắc dừng job:
  * Java hủy (``DELETE /omr/jobs/{id}``) -> dừng ở lần kiểm tra kế tiếp (giữa các trang và giữa các bước nhỏ), không
    gọi callback (Java đã ghi CANCELLED).
  * Quá 10 phút cho cả job hoặc quá 90 giây cho một trang -> FAILED ``TASK_TIMEOUT``.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Callable, Optional

import cv2
import numpy as np

from app import storage
from app.callback import JavaCallback, TaskGone
from app.config import Settings, get_settings
from app.omr.pdf import iter_pdf_pages
from app.omr.preprocess import PreprocessOptions, UnreadablePage, load_image_gray, process_page
from app.schemas import JobRequest

log = logging.getLogger(__name__)

STEP_SPLIT_PDF = "SPLIT_PDF"
STEP_PREPROCESS = "PREPROCESS"
IMPLEMENTED_STEPS = (STEP_SPLIT_PDF, STEP_PREPROCESS)


class JobCancelled(Exception):
    """Java đã yêu cầu hủy job."""


class JobTimeout(Exception):
    """Quá thời gian cho cả job hoặc cho một trang."""

    def __init__(self, scope: str, page_number: Optional[int] = None) -> None:
        super().__init__(scope)
        self.scope = scope
        self.page_number = page_number


class Budget:
    """Theo dõi hủy và hạn thời gian. Gọi :meth:`check` giữa các bước nhỏ để job dừng được kịp thời.

    Python không ngắt được một lệnh OpenCV đang chạy, nên "dừng" nghĩa là dừng ở lần ``check`` kế tiếp. Mỗi bước nhỏ
    của một trang chỉ kéo dài vài trăm mili giây nên độ trễ chấp nhận được.
    """

    def __init__(
        self,
        cancel: threading.Event,
        task_timeout_s: float,
        page_timeout_s: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._cancel = cancel
        self._clock = clock
        self._page_timeout = page_timeout_s
        self._task_deadline = clock() + task_timeout_s
        self._page_deadline: Optional[float] = None
        self.current_page: Optional[int] = None

    def start_page(self, page_number: int) -> None:
        self.current_page = page_number
        self._page_deadline = self._clock() + self._page_timeout

    def end_page(self) -> None:
        self._page_deadline = None
        self.current_page = None

    def check(self) -> None:
        if self._cancel.is_set():
            raise JobCancelled()
        now = self._clock()
        if now > self._task_deadline:
            raise JobTimeout("task")
        if self._page_deadline is not None and now > self._page_deadline:
            raise JobTimeout("page", self.current_page)


@dataclass
class JobContext:
    job: JobRequest
    callback: JavaCallback
    budget: Budget
    settings: Settings
    warnings: list[str]

    @property
    def task_id(self) -> str:
        return str(self.job.taskId)


# ====================================================================== điểm vào


def run_omr_job(
    job: JobRequest,
    cancel: threading.Event,
    callback: JavaCallback,
    settings: Optional[Settings] = None,
) -> None:
    """Chạy một job OMR từ đầu tới cuối. Không ném lỗi ra ngoài: mọi kết cục đều được báo về Java (trừ khi bị hủy)."""
    settings = settings or get_settings()
    budget = Budget(cancel, settings.task_timeout_s, settings.page_timeout_s)
    ctx = JobContext(job=job, callback=callback, budget=budget, settings=settings, warnings=[])
    try:
        _run(ctx)
    except JobCancelled:
        log.info("Job %s đã bị hủy, dừng xử lý", ctx.task_id)
    except TaskGone:
        log.warning("Task %s không còn ở phía Java, bỏ job", ctx.task_id)
    except JobTimeout as exc:
        if exc.scope == "page":
            _safe_fail(ctx, "TASK_TIMEOUT", f"trang {exc.page_number} quá {settings.page_timeout_s} giây")
        else:
            _safe_fail(ctx, "TASK_TIMEOUT", f"quá {settings.task_timeout_s} giây")
    except UnreadablePage as exc:
        where = f"trang {exc.page_number}" if exc.page_number else "trang 1"
        log.warning("Job %s: %s không đọc được: %s", ctx.task_id, where, exc)
        _safe_fail(ctx, "PAGE_UNREADABLE", where)
    except Exception as exc:  # noqa: BLE001 - lỗi không lường trước vẫn phải báo về Java
        log.exception("Job %s gặp lỗi không mong đợi", ctx.task_id)
        _safe_fail(ctx, "INTERNAL_ERROR", type(exc).__name__)


def _safe_fail(ctx: JobContext, code: str, message: Optional[str]) -> None:
    try:
        ctx.callback.fail(code, message)
    except TaskGone:
        pass


# ====================================================================== các bước


def _run(ctx: JobContext) -> None:
    options = ctx.job.options
    stop_after = options.stopAfter.strip().upper()
    if stop_after not in IMPLEMENTED_STEPS:
        # Nhánh này chưa có bước nhận diện: dừng sau tiền xử lý và nói rõ trong cảnh báo
        ctx.warnings.append(f"Bước {stop_after} chưa được hỗ trợ ở bản này, dừng sau {STEP_PREPROCESS}")
        stop_after = STEP_PREPROCESS

    ctx.budget.check()
    ctx.callback.progress(5, STEP_SPLIT_PDF)
    pages = _split_pages(ctx)

    ctx.callback.progress(10, STEP_PREPROCESS)
    kept = _preprocess_pages(ctx, pages)

    ctx.budget.check()
    _finish(ctx, total_pages=len(pages), kept_pages=kept, stop_after=stop_after)


def _split_pages(ctx: JobContext) -> list[Optional[tuple[int, np.ndarray]]]:
    """Bước SPLIT_PDF (5-10%): trả danh sách ``(số_trang_gốc, ảnh_xám)``."""
    budget, callback = ctx.budget, ctx.callback
    inputs = ctx.job.inputs
    pages: list[Optional[tuple[int, np.ndarray]]] = []

    if inputs[0].kind == "PDF":
        path = storage.resolve_existing_file(inputs[0].path)
        total, iterator = iter_pdf_pages(path)
        for index in range(total):
            budget.start_page(index + 1)
            budget.check()
            try:
                page_number, gray = next(iterator)
            except UnreadablePage as exc:
                exc.page_number = exc.page_number or index + 1
                raise
            pages.append((page_number, gray))
            budget.end_page()
            callback.progress(5 + round(5 * (index + 1) / total), STEP_SPLIT_PDF)
        return pages

    # Nhiều ảnh: sắp theo số trang Java gửi (không có thì theo thứ tự nhận)
    ordered = sorted(enumerate(inputs), key=lambda item: (item[1].page or item[0] + 1, item[0]))
    total = len(ordered)
    for position, (original_index, item) in enumerate(ordered):
        page_number = item.page or original_index + 1
        budget.start_page(page_number)
        budget.check()
        try:
            gray = load_image_gray(storage.resolve_existing_file(item.path))
        except UnreadablePage as exc:
            exc.page_number = page_number
            raise
        pages.append((page_number, gray))
        budget.end_page()
        callback.progress(5 + round(5 * (position + 1) / total), STEP_SPLIT_PDF)
    return pages


def _preprocess_pages(ctx: JobContext, pages: list[Optional[tuple[int, np.ndarray]]]) -> int:
    """Bước PREPROCESS (10-30%): xử lý từng trang, lưu PNG, callback ``files``. Trả số trang giữ lại."""
    budget, callback = ctx.budget, ctx.callback
    options = ctx.job.options
    popts = PreprocessOptions(
        preprocess=options.preprocess, binarize=options.binarize, source_type=options.sourceType
    )
    score_id = ctx.job.scoreId
    _clear_old_pages(score_id)

    total = len(pages)
    kept = 0
    for index in range(total):
        page_number, gray = pages[index]  # type: ignore[misc]
        pages[index] = None  # giải phóng bộ nhớ ngay khi xử lý xong trang
        budget.start_page(page_number)
        budget.check()
        try:
            result = process_page(gray, popts, page_number, budget.check)
        except (JobCancelled, JobTimeout, TaskGone):
            raise
        except UnreadablePage as exc:
            exc.page_number = exc.page_number or page_number
            raise
        except Exception as exc:  # noqa: BLE001 - lỗi OpenCV/numpy trên một trang = trang không xử lý được
            log.exception("Lỗi khi tiền xử lý trang %s của job %s", page_number, ctx.task_id)
            raise UnreadablePage(str(exc), page_number) from exc

        ctx.warnings.extend(result.warnings)
        if not result.skipped and result.image is not None:
            kept += 1
            # Đánh số theo thứ tự đầu ra (liền mạch 1..N kể cả khi có trang bị bỏ); trang gốc nằm trong meta.sourcePage
            relative, size = _save_page_png(score_id, kept, result.image)
            callback.file(
                file_type="PNG",
                storage_path=relative,
                page_number=kept,
                content_type="image/png",
                size_bytes=size,
                meta=result.meta,
            )
        budget.end_page()
        callback.progress(10 + round(20 * (index + 1) / total), STEP_PREPROCESS)
    return kept


def _finish(ctx: JobContext, total_pages: int, kept_pages: int, stop_after: str) -> None:
    options = ctx.job.options
    # Nếu có tiền xử lý mà không còn trang nào có khuông nhạc thì không còn gì để nhận diện
    if options.preprocess and kept_pages == 0:
        ctx.callback.fail("NO_STAFF_DETECTED", None)
        return
    result_data = {
        "pageCount": kept_pages,
        "sourcePageCount": total_pages,
        "warnings": ctx.warnings,
        "preprocess": options.preprocess,
        "binarize": options.binarize,
        "stoppedAfter": stop_after,
    }
    ctx.callback.complete(result_data, {"pageCount": kept_pages})


# ====================================================================== ghi file


def _clear_old_pages(score_id: str) -> None:
    """Xóa các ``page-*.png`` của lần chạy trước để không sót trang cũ khi lần này ít trang hơn."""
    pages_dir = storage.resolve(f"scores/{score_id}/pages")
    if not pages_dir.is_dir():
        return
    for entry in pages_dir.iterdir():
        if entry.is_file() and entry.name.startswith("page-") and entry.suffix == ".png":
            try:
                entry.unlink()
            except OSError as exc:
                log.warning("Không xóa được %s: %s", entry, exc)


def _save_page_png(score_id: str, number: int, image: np.ndarray) -> tuple[str, int]:
    """Ghi ảnh trang (xám 8-bit) vào ``scores/{scoreId}/pages/page-NNN.png`` và trả ``(đường_dẫn_tương_đối, byte)``.

    Ghi ra file tạm rồi đổi tên để Java không bao giờ đọc phải file ghi dở. PNG xám 8-bit là đủ: model tự chuyển sang
    RGB khi tiền xử lý.
    """
    relative = f"scores/{score_id}/pages/page-{number:03d}.png"
    target = storage.resolve(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(".png", image, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    if not ok:
        raise RuntimeError("Không mã hóa được PNG")
    temp = target.with_suffix(".png.tmp")
    temp.write_bytes(encoded.tobytes())
    os.replace(temp, target)
    return relative, target.stat().st_size
