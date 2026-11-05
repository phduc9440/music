"""Pipeline OMR của music-ai (đặc tả mục 2.2, 2.3, 6.3).

Mỗi bước báo tiến độ về Java qua callback:

    SPLIT_PDF   (5-10%)   tách PDF thành ảnh từng trang / đọc các ảnh đầu vào
    PREPROCESS  (10-30%)  tiền xử lý từng trang -> lưu ``pages/page-NNN.png`` -> callback ``files`` -> báo tiến độ
    INFERENCE   (30-85%)  Transcoda nhận diện từng trang -> lưu ``kern/page-NNN.krn`` (tiến độ 30 + 55 * xong / tổng)
                (85%)     trang có số spine khác số khuông trên ảnh (bố cục ``layout/page-NNN.json``) được nhận diện
                          lại theo từng hệ trong thời gian còn dư của job (``app/omr/routing.py``)
    MERGE       (85-90%)  làm sạch, ghép kern, kiểm tra -> lưu ``kern/merged.krn`` -> callback ``files`` (KERN)
    EXPORT      (90-98%)  kern -> ``musicxml/v{n}.musicxml`` -> ``midi/v{n}.mid`` -> callback ``files`` (MUSICXML, MIDI)

Sau EXPORT job kết thúc bằng callback ``complete`` (mặc định ``omr.stop-after=EXPORT``). ``stopAfter=PREPROCESS`` và
``stopAfter=MERGE`` vẫn được hỗ trợ để chạy riêng từng phần (PREPROCESS không cần model).

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
from app.convert.errors import ConversionError
from app.convert.kern import kern_file_to_musicxml_file
from app.convert.midi import musicxml_file_to_midi_file
from app.omr import kern_check, merge, routing
from app.omr.layout import PageLayout, analyze_layout
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
# Giá trị stopAfter chấp nhận; INFERENCE không đứng riêng nên được hiểu là chạy tới MERGE
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

    def remaining_s(self) -> float:
        """Số giây còn lại trước hạn của cả job."""
        return self._task_deadline - self._clock()

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
    page_measures: list[dict] = field(default_factory=list)
    """Ô nhịp đầu/cuối của từng trang theo bản kern ghép (bước MERGE tính, bước EXPORT hiệu chỉnh và báo về Java)."""
    kern_measure_count: int = 0
    layouts: dict[int, PageLayout] = field(default_factory=dict)
    """Bố cục từng trang (theo số trang đầu ra), tính ở bước PREPROCESS."""
    routing: list[dict] = field(default_factory=list)
    """Trang nào được nhận diện lại theo hệ và chọn ứng viên nào (``result_data.routing.pages``)."""
    staff_roles: Optional[list[str]] = None
    """Vai trò khuông từ trên xuống của cả bản (từ bố cục), đã ghi vào kern ghép bằng ``*Ivox``/``*Ipiano``."""

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
        ctx.warnings.append(f"Bước dừng {requested!r} không hợp lệ, chạy tới bước {STEP_EXPORT}")
        stop_after = STEP_EXPORT
    elif requested in (STEP_PREPROCESS, STEP_EXPORT):
        stop_after = requested
    else:  # INFERENCE không đứng riêng (ghép kern ngay sau khi nhận diện) nên chạy tới MERGE
        stop_after = STEP_MERGE

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
        if stop_after == STEP_EXPORT:
            exported = _export(ctx, extra, score_metadata)
            if exported is None:  # EXPORT_ERROR đã được báo
                return
            extra, score_metadata = exported
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
    _clear_dir(score_id, "layout", (".json",))
    ctx.layouts = {}

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
            _analyze_page_layout(ctx, kept, result.image)
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
    ctx.page_kern_paths = []
    ctx.inference_ms = []
    ctx.routing = []
    primary: dict[int, Optional[merge.PageKern]] = {}
    page_warnings: dict[int, list[str]] = {}
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
        primary[page_number] = page
        page_warnings[page_number] = warnings
        callback.progress(30 + round(55 * done / total), STEP_INFERENCE)

    _route_pages(ctx, recognizer, kept_pages, primary, page_warnings)

    usable: list[merge.PageKern] = []
    for page_number, _ in kept_pages:
        ctx.warnings.extend(page_warnings[page_number])
        if primary[page_number] is not None:
            usable.append(primary[page_number])
    if not usable:
        callback.fail("RECOGNITION_EMPTY", PAGE_COUNT_RECOGNITION_MESSAGE.format(n=total))
        return None
    return usable


class _RoutingAbort(Exception):
    """Dừng nhận diện lại một trang (không đủ thời gian, một hệ quá hạn). Job vẫn chạy tiếp với kết quả cả trang."""


def _route_pages(
    ctx: JobContext,
    recognizer: Recognizer,
    kept_pages: list[tuple[int, str]],
    primary: dict[int, Optional[merge.PageKern]],
    page_warnings: dict[int, list[str]],
) -> None:
    """Kiểm tra số spine từng trang theo bố cục; trang sai thì nhận diện lại theo hệ (``app/omr/routing.py``).

    Chạy SAU khi mọi trang đã có kết quả lượt chính, nên tiến độ không bị chặn bởi trang khó; chỉ dùng thời gian còn lại
    của job trừ ``routing_reserve_s`` cho bước ghép/xuất. Không đủ thời gian, một hệ quá hạn hay kết quả theo hệ không
    tốt hơn thì giữ kết quả cả trang kèm cảnh báo: bước này không bao giờ làm job FAILED. Hủy job vẫn dừng ngay.

    Sửa trực tiếp ``primary`` (kern được chọn), ``page_warnings``, ``ctx.page_kern_paths`` và ``ctx.routing``.
    """
    budget, callback, settings = ctx.budget, ctx.callback, ctx.settings
    mode = settings.omr_routing
    score_id = ctx.job.scoreId
    _clear_dir(score_id, "routing", (".png", ".krn"))
    paths = dict(kept_pages)
    positions = {page_number: index for index, (page_number, _) in enumerate(kept_pages)}
    todo = [
        pn
        for pn, _ in kept_pages
        if routing.needs_fallback(mode, ctx.layouts.get(pn), primary[pn], settings.routing_measures)
    ]

    # Trang sai số khuông nhưng không nhận diện lại được (tắt định tuyến) thì ít nhất phải cảnh báo
    for page_number, _ in kept_pages:
        expected = routing.expected_staves(ctx.layouts.get(page_number))
        page = primary[page_number]
        if page_number not in todo and expected is not None and page is not None and page.spines != expected:
            page_warnings[page_number].append(_mismatch_message(page_number, page.spines, expected))
    if not todo:
        return

    callback.progress(85, STEP_INFERENCE)
    page_seconds = (sum(ctx.inference_ms) / len(ctx.inference_ms) / 1000.0) if ctx.inference_ms else 30.0
    for page_number in todo:
        budget.check()
        layout = ctx.layouts[page_number]
        expected = layout.staff_count or 0
        before = primary[page_number]
        report = routing.PageRouting(
            page=page_number, expected=expected, primary_spines=before.spines if before is not None else None
        )
        ctx.routing.append(report.to_dict())  # thay bằng bản đầy đủ ở cuối vòng lặp
        started = time.monotonic()
        if budget.remaining_s() - settings.routing_reserve_s < max(10.0, 1.2 * page_seconds):
            report.skipped = "không đủ thời gian"
            _finish_routing(ctx, report, before, page_warnings, started)
            continue

        gray = cv2.imread(str(storage.resolve(paths[page_number])), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            report.skipped = "không đọc lại được ảnh trang"
            _finish_routing(ctx, report, before, page_warnings, started)
            continue
        last_seconds = [page_seconds / max(1, len(layout.systems))]

        def recognize_system(
            image: np.ndarray, index: int, beams: Optional[int], tag: Optional[str] = None, pn: int = page_number
        ) -> tuple[str, bool]:
            limit = min(float(settings.inference_page_timeout_s), budget.remaining_s() - settings.routing_reserve_s)
            if limit < 5.0:
                raise _RoutingAbort("không đủ thời gian")
            suffix = f"-b{beams}" if beams else ""
            name = f"scores/{score_id}/routing/page-{pn:03d}-s{index + 1:02d}" + (f"-{tag}" if tag else "")
            png_relative, _ = _save_png(f"{name}.png", image)
            begin = time.monotonic()
            budget.start_page(pn, limit)
            try:
                kwargs = {"num_beams": beams} if beams else {}
                result = recognizer.recognize(storage.resolve(png_relative), budget.check, **kwargs)
            except JobTimeout as exc:
                if exc.scope == "page":
                    raise _RoutingAbort(f"hệ {index + 1} quá {int(limit)} giây") from exc
                raise
            finally:
                budget.end_page()
            last_seconds[0] = time.monotonic() - begin
            _save_text(f"{name}{suffix}.krn", merge.normalize_text(result.text))
            return result.text, result.truncated

        def can_retry() -> bool:
            # Thử lại bằng beam search chậm hơn ~3 lần một lần greedy
            return budget.remaining_s() - settings.routing_reserve_s > 3.5 * last_seconds[0] + 5.0

        try:
            candidate, systems, warnings = routing.recognize_by_systems(
                page_number,
                gray,
                layout,
                recognize_system,
                settings.routing_retry_beams,
                can_retry,
                max_repeat=settings.max_repeat_lines,
                meter=next((m for m in map(routing.page_meter, primary.values()) if m), None),
            )
        except _RoutingAbort as exc:
            report.skipped = str(exc)
            _finish_routing(ctx, report, before, page_warnings, started)
            continue

        report.systems = len(systems)
        report.systems_ok = sum(
            1 for r, sy in zip(systems, layout.systems) if r.page is not None and r.page.spines == len(sy.staves)
        )
        report.retries = sum(max(0, r.attempts - 1) for r in systems)
        report.role_split = sum(1 for r in systems if r.method == "roles")
        complete = all(r.page is not None for r in systems)
        source, chosen, primary_score, systems_score = routing.choose(
            before,
            candidate if complete or before is None else None,
            expected,
            report.systems_ok / report.systems if report.systems else 0.0,
        )
        report.chosen, report.primary_score, report.systems_score = source, primary_score, systems_score
        if source == routing.SOURCE_SYSTEMS and chosen is not None:
            relative = _save_text(
                f"scores/{score_id}/routing/page-{page_number:03d}-systems.krn", _page_text(chosen)
            )
            report.kern_path = relative
            ctx.page_kern_paths[positions[page_number]] = relative
            primary[page_number] = chosen
            # Cảnh báo của lượt chính (sinh lặp, chạm giới hạn...) không còn đúng với kết quả mới
            what = (
                f"kết quả cả trang có {before.spines} khuông trong khi ảnh có {expected} khuông mỗi hệ"
                if before is not None
                else "kết quả cả trang không dùng được"
            )
            page_warnings[page_number] = [
                f"Trang {page_number}: {what}, đã nhận diện lại theo từng hệ ({report.systems} hệ)"
            ] + warnings
        _finish_routing(ctx, report, before, page_warnings, started)


def _finish_routing(
    ctx: JobContext,
    report: routing.PageRouting,
    before: Optional[merge.PageKern],
    page_warnings: dict[int, list[str]],
    started: float,
) -> None:
    """Ghi báo cáo định tuyến của một trang; giữ kết quả cả trang mà vẫn sai số khuông thì cảnh báo kèm lý do."""
    report.millis = int((time.monotonic() - started) * 1000)
    ctx.routing[-1] = report.to_dict()
    if report.chosen == routing.SOURCE_PAGE and before is not None and before.spines != report.expected:
        reason = report.skipped or "nhận diện lại theo hệ không cho kết quả tốt hơn"
        page_warnings[report.page].append(
            _mismatch_message(report.page, before.spines, report.expected) + f"; chưa sửa được ({reason})"
        )


def _mismatch_message(page_number: int, found: int, expected: int) -> str:
    return (
        f"Trang {page_number}: đọc được {found} khuông trong khi ảnh có {expected} khuông mỗi hệ "
        "(có thể thiếu một khuông, ví dụ giọng hát)"
    )


def _page_text(page: merge.PageKern) -> str:
    return "\n".join([page.header, *page.body, "\t".join(["*-"] * page.spines)]) + "\n"


def _analyze_page_layout(ctx: JobContext, page_number: int, image: np.ndarray) -> None:
    """Bố cục trang (vài chục ms): lưu ``layout/page-NNN.json`` và giữ trong ``ctx.layouts``. Lỗi thì bỏ qua."""
    try:
        layout = analyze_layout(image)
    except Exception:  # noqa: BLE001 - bố cục chỉ là thông tin phụ, không được làm hỏng job
        log.exception("Không phân tích được bố cục trang %s của job %s", page_number, ctx.task_id)
        return
    ctx.layouts[page_number] = layout
    try:
        _save_text(f"scores/{ctx.job.scoreId}/layout/page-{page_number:03d}.json", layout.to_json())
    except OSError as exc:
        log.warning("Không ghi được bố cục trang %s: %s", page_number, exc)


def _job_roles(ctx: JobContext, spines: int) -> Optional[list[str]]:
    """Vai trò khuông phổ biến nhất trong các trang có bố cục tin cậy và đúng ``spines`` khuông mỗi hệ."""
    counts: dict[tuple[str, ...], int] = {}
    for layout in ctx.layouts.values():
        roles = layout.roles
        if layout.confident and roles is not None and len(roles) == spines:
            counts[tuple(roles)] = counts.get(tuple(roles), 0) + 1
    if not counts:
        return None
    return list(max(counts, key=lambda key: counts[key]))


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
    ctx.staff_roles = _job_roles(ctx, merged.spines)
    if ctx.staff_roles is not None:
        merged = merge.annotate_roles(merged, ctx.staff_roles)
    ctx.warnings.extend(merged.warnings)
    ctx.warnings.extend(merge.check_measures(merged))
    if ctx.staff_roles is None and merged.spines not in (2, 3):  # 2 = piano, 3 = giọng + piano
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
    ctx.page_measures = merge.page_measure_ranges(merged)
    ctx.kern_measure_count = meta.measure_count
    callback.progress(90, STEP_MERGE)

    extra = {
        "kernPath": relative,
        "kernPages": ctx.page_kern_paths,
        "spines": merged.spines,
        "model": settings.model_id,
        "numBeams": settings.num_beams,
        "inferenceMs": ctx.inference_ms,
    }
    if ctx.staff_roles is not None:
        extra["staffRoles"] = ctx.staff_roles
    if ctx.routing or settings.omr_routing != routing.MODE_OFF:
        extra["routing"] = {"mode": settings.omr_routing, "pages": ctx.routing}
    score_metadata: dict = {"measureCount": meta.measure_count, "staffCount": meta.staff_count}
    if meta.key_signature:
        score_metadata["keySignature"] = meta.key_signature
    if meta.time_signature:
        score_metadata["timeSignature"] = meta.time_signature
    if meta.tempo_bpm:
        score_metadata["tempoBpm"] = meta.tempo_bpm
    return extra, score_metadata


def _export(ctx: JobContext, extra: dict, score_metadata: dict) -> Optional[tuple[dict, dict]]:
    """Bước EXPORT (90-98%): kern -> ``musicxml/v{n}.musicxml`` -> ``midi/v{n}.mid``, báo hai file về Java.

    ``n`` là ``options.musicXmlVersion`` (Java tính) nên nhận diện lại không ghi đè bản cũ. Hai file chỉ được đăng ký
    (callback ``files``) sau khi cả hai đã ghi xong, để task lỗi giữa chừng không làm MusicXML cũ mất vị trí hiện hành.
    Trả ``(result_data_bổ_sung, scoreMetadata_đã_cập_nhật)``; trả None nếu đã báo FAILED ``EXPORT_ERROR``.
    """
    budget, callback = ctx.budget, ctx.callback
    score_id = ctx.job.scoreId
    version = ctx.job.options.musicXmlVersion
    budget.check()
    callback.progress(90, STEP_EXPORT)

    xml_relative = f"scores/{score_id}/musicxml/v{version}.musicxml"
    midi_relative = f"scores/{score_id}/midi/v{version}.mid"
    try:
        normalized = kern_file_to_musicxml_file(
            storage.resolve(extra["kernPath"]), storage.resolve(xml_relative), score_metadata.get("tempoBpm")
        )
        budget.check()
        callback.progress(95, STEP_EXPORT)
        midi = musicxml_file_to_midi_file(
            storage.resolve(xml_relative), storage.resolve(midi_relative), normalized.tempo_bpm
        )
    except ConversionError as exc:
        log.warning("Job %s: xuất MusicXML/MIDI lỗi: %s", ctx.task_id, exc)
        callback.fail("EXPORT_ERROR", str(exc)[:300])
        return None
    except (JobCancelled, JobTimeout, TaskGone):
        raise
    except Exception as exc:  # noqa: BLE001 - music21 có thể ném đủ loại lỗi trên kern lạ
        log.exception("Job %s: lỗi không mong đợi khi xuất MusicXML/MIDI", ctx.task_id)
        callback.fail("EXPORT_ERROR", f"{type(exc).__name__}: {exc}"[:300])
        return None

    ctx.warnings.extend(normalized.warnings)
    if ctx.kern_measure_count and ctx.kern_measure_count != normalized.measure_count:
        ctx.warnings.append(
            f"Số ô nhịp trong kern ({ctx.kern_measure_count}) khác MusicXML ({normalized.measure_count}), "
            "ảnh trang và bản nhạc đặt cạnh nhau có thể lệch"
        )
    if normalized.staff_count != 2 and len(normalized.parts) <= 1 and not any("spine" in w for w in ctx.warnings):
        ctx.warnings.append(
            f"Bản nhạc có {normalized.staff_count} khuông (piano thường có 2), "
            "các nút Tắt/Solo từng tay có thể không dùng được"
        )

    budget.check()
    callback.progress(98, STEP_EXPORT)
    callback.file(
        file_type="MUSICXML",
        storage_path=xml_relative,
        page_number=None,
        content_type="application/vnd.recordare.musicxml+xml",
        size_bytes=storage.resolve(xml_relative).stat().st_size,
        meta={
            "staffCount": normalized.staff_count,
            "measureCount": normalized.measure_count,
            "parts": normalized.parts,
        },
        version=version,
    )
    callback.file(
        file_type="MIDI",
        storage_path=midi_relative,
        page_number=None,
        content_type="audio/midi",
        size_bytes=storage.resolve(midi_relative).stat().st_size,
        meta={"sourceVersion": version, "tracks": midi.tracks, "notes": midi.notes, "seconds": midi.seconds},
        version=version,
    )

    count = normalized.measure_count
    page_measures = [
        {
            "page": r["page"],
            "firstMeasure": min(r["firstMeasure"], count),
            "lastMeasure": min(r["lastMeasure"], count),
        }
        for r in ctx.page_measures
    ]
    result_extra = {
        **extra,
        "musicXmlPath": xml_relative,
        "midiPath": midi_relative,
        "musicXmlVersion": version,
        "pageMeasures": page_measures,
    }
    # MusicXML là nguồn đúng nhất cho metadata (đặc tả mục 2.4): ghi đè các giá trị rút tạm từ kern
    metadata = {
        **score_metadata,
        "measureCount": normalized.measure_count,
        "staffCount": normalized.staff_count,
        "tempoBpm": normalized.tempo_bpm,
    }
    if normalized.key_signature:
        metadata["keySignature"] = normalized.key_signature
    if normalized.time_signature:
        metadata["timeSignature"] = normalized.time_signature
    return result_extra, metadata


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
        **extra,
    }
    if stop_after != STEP_EXPORT:  # chạy đủ pipeline thì không phải "dừng sớm"; web dựa vào khóa này để báo
        result_data["stoppedAfter"] = stop_after
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


def _clear_dir(score_id: str, name: str, suffixes: tuple[str, ...]) -> None:
    """Xóa file (đúng đuôi) do lần chạy trước để lại trong ``scores/{scoreId}/{name}/``."""
    folder = storage.resolve(f"scores/{score_id}/{name}")
    if not folder.is_dir():
        return
    for entry in folder.iterdir():
        if entry.is_file() and entry.suffix in suffixes:
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


def _save_png(relative: str, image: np.ndarray) -> tuple[str, int]:
    """Ghi ảnh xám 8-bit ra PNG trong storage (ghi file tạm rồi đổi tên), trả ``(đường_dẫn_tương_đối, byte)``."""
    target = storage.resolve(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(".png", image, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    if not ok:
        raise RuntimeError("Không mã hóa được PNG")
    temp = target.with_suffix(".png.tmp")
    temp.write_bytes(encoded.tobytes())
    os.replace(temp, target)
    return relative, target.stat().st_size


def _save_page_png(score_id: str, number: int, image: np.ndarray) -> tuple[str, int]:
    """Ghi ảnh trang (xám 8-bit) vào ``scores/{scoreId}/pages/page-NNN.png`` và trả ``(đường_dẫn_tương_đối, byte)``.

    Ghi ra file tạm rồi đổi tên để Java không bao giờ đọc phải file ghi dở. PNG xám 8-bit là đủ: model tự chuyển sang
    RGB khi tiền xử lý.
    """
    return _save_png(f"scores/{score_id}/pages/page-{number:03d}.png", image)
