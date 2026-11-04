"""Pipeline OMR của music-ai (đặc tả mục 2.2, 2.3, 6.3).

Mỗi bước báo tiến độ về Java qua callback:

    SPLIT_PDF   (5-10%)   tách PDF thành ảnh từng trang / đọc các ảnh đầu vào
    PREPROCESS  (10-30%)  tiền xử lý từng trang -> lưu ``pages/page-NNN.png`` -> callback ``files`` -> báo tiến độ
    INFERENCE   (30-85%)  Transcoda nhận diện từng trang -> lưu ``kern/page-NNN.krn`` (tiến độ 30 + 55 * xong / tổng)
    MERGE       (85-90%)  làm sạch, ghép kern, kiểm tra -> lưu ``kern/merged.krn`` -> callback ``files`` (KERN)

Sau MERGE job kết thúc bằng callback ``complete`` (``omr.stop-after=MERGE``); bước EXPORT (MusicXML/MIDI) là của nhánh
feature/omr-export-musicxml-midi: viết ``_run_export`` rồi gọi trong :func:`_run` ngay trước ``_finish``.
``stopAfter=PREPROCESS`` vẫn được hỗ trợ (chạy riêng phần tiền xử lý, không cần model).

Quy tắc dừng job:
  * Java hủy (``DELETE /omr/jobs/{id}``) -> dừng ở lần kiểm tra kế tiếp (giữa các trang, giữa các bước nhỏ và giữa các
    token khi suy luận), không gọi callback (Java đã ghi CANCELLED).
  * Quá 10 phút cho cả job, quá 90 giây cho tiền xử lý hoặc suy luận một trang -> FAILED ``TASK_TIMEOUT``.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

import cv2
import numpy as np

from app import storage
from app.callback import JavaCallback, TaskGone
from app.config import Settings, get_settings
from app.omr import kern_check, merge
from app.omr.pdf import iter_pdf_pages
from app.omr.preprocess import PreprocessOptions, UnreadablePage, load_image_gray, process_page
from app.omr.transcoda import Recognizer, RecognizerNotReady, get_recognizer
from app.schemas import JobRequest

log = logging.getLogger(__name__)

STEP_SPLIT_PDF = "SPLIT_PDF"
STEP_PREPROCESS = "PREPROCESS"
STEP_INFERENCE = "INFERENCE"
STEP_MERGE = "MERGE"
STEP_EXPORT = "EXPORT"
# Giá trị stopAfter chấp nhận; EXPORT (chưa có) được hiểu là chạy tới MERGE
STOP_AFTER_VALUES = (STEP_PREPROCESS, STEP_INFERENCE, STEP_MERGE, STEP_EXPORT)

PAGE_COUNT_RECOGNITION_MESSAGE = "không nhận diện được nốt nào ở cả {n} trang"


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

    def start_page(self, page_number: int, timeout_s: Optional[float] = None) -> None:
        """Bắt đầu tính hạn cho một trang; ``timeout_s`` thay cho hạn mặc định (suy luận có hạn riêng)."""
        self.current_page = page_number
        self._page_deadline = self._clock() + (timeout_s if timeout_s is not None else self._page_timeout)

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
    recognizer: Optional[Recognizer] = None
    page_kern_paths: list[str] = field(default_factory=list)
    inference_ms: list[int] = field(default_factory=list)

    @property
    def task_id(self) -> str:
        return str(self.job.taskId)


# ====================================================================== điểm vào


def run_omr_job(
    job: JobRequest,
    cancel: threading.Event,
    callback: JavaCallback,
    settings: Optional[Settings] = None,
    recognizer: Optional[Recognizer] = None,
) -> None:
    """Chạy một job OMR từ đầu tới cuối. Không ném lỗi ra ngoài: mọi kết cục đều được báo về Java (trừ khi bị hủy).

    ``recognizer`` mặc định là Transcoda dùng chung của dịch vụ; test truyền bản giả.
    """
    settings = settings or get_settings()
    budget = Budget(cancel, settings.task_timeout_s, settings.page_timeout_s)
    ctx = JobContext(job=job, callback=callback, budget=budget, settings=settings, warnings=[], recognizer=recognizer)
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
    except RecognizerNotReady as exc:
        log.error("Job %s: model chưa dùng được: %s", ctx.task_id, exc)
        _safe_fail(ctx, "MODEL_NOT_LOADED", str(exc)[:300])
    except merge.MergeSpineMismatch as exc:
        _safe_fail(ctx, "MERGE_SPINE_MISMATCH", f"trang {exc.page_number}")
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
    requested = options.stopAfter.strip().upper()
    if requested not in STOP_AFTER_VALUES:
        ctx.warnings.append(f"Bước dừng {requested!r} không hợp lệ, chạy tới bước {STEP_MERGE}")
    # Chưa có bước EXPORT và INFERENCE không đứng riêng: mọi giá trị sau PREPROCESS đều chạy tới MERGE
    stop_after = STEP_PREPROCESS if requested == STEP_PREPROCESS else STEP_MERGE

    ctx.budget.check()
    ctx.callback.progress(5, STEP_SPLIT_PDF)
    pages = _split_pages(ctx)

    ctx.callback.progress(10, STEP_PREPROCESS)
    kept_pages = _preprocess_pages(ctx, pages)

    ctx.budget.check()
    if options.preprocess and not kept_pages:
        # Có tiền xử lý mà không còn trang nào có khuông nhạc thì không còn gì để nhận diện
        ctx.callback.fail("NO_STAFF_DETECTED", None)
        return

    extra: dict = {}
    score_metadata: dict = {}
    if stop_after != STEP_PREPROCESS:
        recognized = _recognize_pages(ctx, kept_pages)
        if recognized is None:  # RECOGNITION_EMPTY đã được báo
            return
        merged = _merge_pages(ctx, recognized)
        if merged is None:  # KERN_PARSE_ERROR đã được báo
            return
        extra, score_metadata = merged
    _finish(
        ctx,
        total_pages=len(pages),
        kept_pages=len(kept_pages),
        stop_after=stop_after,
        extra=extra,
        score_metadata=score_metadata,
    )


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


def _preprocess_pages(ctx: JobContext, pages: list[Optional[tuple[int, np.ndarray]]]) -> list[tuple[int, str]]:
    """Bước PREPROCESS (10-30%): xử lý từng trang, lưu PNG, callback ``files``.

    Trả danh sách ``(số_trang_đầu_ra, đường_dẫn_PNG_tương_đối)`` của các trang giữ lại.
    """
    budget, callback = ctx.budget, ctx.callback
    options = ctx.job.options
    popts = PreprocessOptions(
        preprocess=options.preprocess, binarize=options.binarize, source_type=options.sourceType
    )
    score_id = ctx.job.scoreId
    _clear_old_pages(score_id)

    total = len(pages)
    kept = 0
    kept_pages: list[tuple[int, str]] = []
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
            kept_pages.append((kept, relative))
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
    return kept_pages


def _recognize_pages(ctx: JobContext, kept_pages: list[tuple[int, str]]) -> Optional[list[merge.PageKern]]:
    """Bước INFERENCE (30-85%): Transcoda nhận diện từng trang, lưu ``kern/page-NNN.krn``, làm sạch.

    Trả danh sách trang kern dùng được (theo thứ tự trang). Trang rỗng hoặc không có ``**kern`` bị bỏ kèm cảnh báo; không
    còn trang nào thì báo FAILED ``RECOGNITION_EMPTY`` và trả None.
    """
    budget, callback, settings = ctx.budget, ctx.callback, ctx.settings
    recognizer = ctx.recognizer or get_recognizer()
    score_id = ctx.job.scoreId

    # Model có thể còn đang nạp (khởi động chưa lâu): chờ tối đa model_wait_s, vẫn hủy/hết hạn được trong lúc chờ
    callback.progress(30, STEP_INFERENCE)
    recognizer.wait_ready(budget.check, settings.model_wait_s)
    _clear_old_kern_pages(score_id)

    total = len(kept_pages)
    usable: list[merge.PageKern] = []
    ctx.page_kern_paths = []
    ctx.inference_ms = []
    for done, (page_number, png_relative) in enumerate(kept_pages, start=1):
        budget.start_page(page_number, settings.inference_page_timeout_s)
        budget.check()
        result = recognizer.recognize(storage.resolve(png_relative), budget.check)
        budget.end_page()
        ctx.inference_ms.append(result.millis)

        # Lưu kern thô đã chuẩn hóa xuống dòng để có thể mở ra đối chiếu khi cần gỡ lỗi
        relative = _save_text(f"scores/{score_id}/kern/page-{page_number:03d}.krn", merge.normalize_text(result.text))
        ctx.page_kern_paths.append(relative)

        page, warnings = merge.clean_page(
            page_number, result.text, max_repeat=settings.max_repeat_lines, truncated=result.truncated
        )
        ctx.warnings.extend(warnings)
        if page is not None:
            usable.append(page)
        callback.progress(30 + round(55 * done / total), STEP_INFERENCE)

    if not usable:
        callback.fail("RECOGNITION_EMPTY", PAGE_COUNT_RECOGNITION_MESSAGE.format(n=total))
        return None
    return usable


def _merge_pages(ctx: JobContext, pages: list[merge.PageKern]) -> Optional[tuple[dict, dict]]:
    """Bước MERGE (85-90%): ghép kern, kiểm tra, lưu ``kern/merged.krn`` và báo file KERN.

    Trả ``(result_data_bổ_sung, scoreMetadata)``. Trả None nếu đã báo FAILED ``KERN_PARSE_ERROR`` (file kern vẫn được
    lưu và đăng ký để gỡ lỗi). Số spine không khớp thì :class:`merge.MergeSpineMismatch` được ném và xử lý ở
    :func:`run_omr_job`.
    """
    budget, callback, settings = ctx.budget, ctx.callback, ctx.settings
    score_id = ctx.job.scoreId
    budget.check()
    callback.progress(85, STEP_MERGE)

    merged = merge.merge_pages(pages, lenient=settings.lenient_spines)
    ctx.warnings.extend(merged.warnings)
    ctx.warnings.extend(merge.check_measures(merged))
    if merged.spines not in (2, 3):  # 2 = piano, 3 = giọng + piano; số khác thì thường là model đọc sai
        ctx.warnings.append(
            f"Bản kern có {merged.spines} spine (thường là 2 cho piano hoặc 3 cho giọng và piano), "
            "các nút Tắt/Solo từng tay có thể không dùng được"
        )

    relative = _save_text(f"scores/{score_id}/kern/merged.krn", merged.text)
    callback.file(
        file_type="KERN",
        storage_path=relative,
        page_number=None,
        content_type="text/plain",
        size_bytes=storage.resolve(relative).stat().st_size,
        meta={"pages": ctx.page_kern_paths, "spines": merged.spines},
    )
    budget.check()
    callback.progress(88, STEP_MERGE)

    status, detail = kern_check.parse_check(storage.resolve(relative))
    if status == "error":
        message = f"music21 không đọc được kern: {detail}"
        if settings.kern_parse_mode == "warn":
            ctx.warnings.append(message)
        else:
            callback.fail("KERN_PARSE_ERROR", detail[:300])
            return None
    elif status == "unavailable":
        ctx.warnings.append(f"Chưa kiểm tra cú pháp kern bằng music21: {detail}")

    meta = merge.extract_metadata(merged)
    callback.progress(90, STEP_MERGE)

    extra = {
        "kernPath": relative,
        "kernPages": ctx.page_kern_paths,
        "spines": merged.spines,
        "model": settings.model_id,
        "numBeams": settings.num_beams,
        "inferenceMs": ctx.inference_ms,
    }
    score_metadata: dict = {"measureCount": meta.measure_count, "staffCount": meta.staff_count}
    if meta.key_signature:
        score_metadata["keySignature"] = meta.key_signature
    if meta.time_signature:
        score_metadata["timeSignature"] = meta.time_signature
    if meta.tempo_bpm:
        score_metadata["tempoBpm"] = meta.tempo_bpm
    return extra, score_metadata


def _finish(
    ctx: JobContext,
    total_pages: int,
    kept_pages: int,
    stop_after: str,
    extra: dict,
    score_metadata: dict,
) -> None:
    options = ctx.job.options
    result_data = {
        "pageCount": kept_pages,
        "sourcePageCount": total_pages,
        "warnings": ctx.warnings,
        "preprocess": options.preprocess,
        "binarize": options.binarize,
        "stoppedAfter": stop_after,
        **extra,
    }
    ctx.callback.complete(result_data, {"pageCount": kept_pages, **score_metadata})


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


def _clear_old_kern_pages(score_id: str) -> None:
    """Xóa các ``kern/page-*.krn`` của lần chạy trước; ``merged.krn`` cũ giữ lại tới khi bản mới được ghi đè."""
    kern_dir = storage.resolve(f"scores/{score_id}/kern")
    if not kern_dir.is_dir():
        return
    for entry in kern_dir.iterdir():
        if entry.is_file() and entry.name.startswith("page-") and entry.suffix == ".krn":
            try:
                entry.unlink()
            except OSError as exc:
                log.warning("Không xóa được %s: %s", entry, exc)


def _save_text(relative: str, text: str) -> str:
    """Ghi file văn bản UTF-8 vào storage (ghi file tạm rồi đổi tên) và trả đường dẫn tương đối."""
    target = storage.resolve(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(target.name + ".tmp")
    temp.write_text(text, encoding="utf-8")
    os.replace(temp, target)
    return relative


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
