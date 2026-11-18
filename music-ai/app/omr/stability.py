"""Đọc lại các hệ có ô nghi ngờ với ảnh dịch vài pixel và bỏ phiếu theo ô nhịp (``OMR_TTA``).

Ý tưởng (test-time augmentation): một ô model đọc *chắc* thì dịch ảnh vài pixel vẫn ra cùng kết quả; ô đọc "may rủi"
(nốt sát dòng kẻ phụ, chữ lời ca dính khuông...) thì mỗi lần một khác. Không cần train gì, chỉ tốn thêm thời gian đọc.

Quy trình cho mỗi hệ có ít nhất một ô dưới :data:`review.REVIEW_THRESHOLD` (tối đa ``OMR_TTA_MAX_SYSTEMS`` hệ mỗi job,
chỉ khi job còn đủ thời gian):

1. Dịch ảnh trang lên/xuống ``±OMR_TTA_SHIFT_PX`` pixel, cắt hệ như bước nhận diện lại theo hệ (hệ giữa trang đọc kèm hệ
   đầu để có số chỉ nhịp), đọc ``OMR_TTA`` lần (mỗi độ dịch một lần).
2. Lần đọc nào có đúng số ô và số spine như bản đang dùng thì so từng ô (chỉ so trường độ + cao độ + dấu hóa).
3. Ô mọi lần đọc đều giống bản gốc: ``_stable`` (cộng điểm tin cậy). Ô khác nhau: cờ ``UNSTABLE``, các cách đọc khác được
   giữ làm ứng viên cho lớp AI (:mod:`app.omr.llm_check`).
4. **Thay** bản gốc chỉ khi đủ chắc: ít nhất 2 lần đọc lại giống hệt nhau, khác bản gốc, đúng tổng trường độ trong khi
   bản gốc sai (hoặc bản gốc dính cờ tầm âm/bước nhảy còn cách đọc mới thì không), và không tách/gộp spine.

Hàm ở đây không phụ thuộc model: ``read_system(ảnh_trang_ảo, số_trang, chỉ_số_hệ, tag)`` do pipeline truyền vào.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np

from app.omr import merge, review, routing
from app.omr.layout import PageLayout

ReadSystem = Callable[[np.ndarray, int, int, str], Optional[merge.PageKern]]
"""``read_system(ảnh_trang_ảo, số_trang, chỉ_số_hệ, tag)`` -> kern đọc được từ ảnh (None nếu không đọc được)."""


@dataclass
class StabilityReport:
    systems: int = 0
    reads: int = 0
    compared: int = 0
    """Số lần đọc lại dùng được để so (đúng số ô, đúng số spine)."""

    stable: int = 0
    unstable: int = 0
    replaced: int = 0
    skipped: Optional[str] = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        data = {
            "systems": self.systems,
            "reads": self.reads,
            "compared": self.compared,
            "stable": self.stable,
            "unstable": self.unstable,
            "replaced": self.replaced,
        }
        if self.skipped:
            data["skipped"] = self.skipped
        return data


def shift_image(gray: np.ndarray, dy: int) -> np.ndarray:
    """Dịch ảnh theo chiều dọc ``dy`` pixel (dương = xuống), phần trống tô trắng."""
    if dy == 0:
        return gray
    out = np.full_like(gray, 255)
    if dy > 0:
        out[dy:] = gray[:-dy]
    else:
        out[:dy] = gray[-dy:]
    return out


def system_image(gray: np.ndarray, layout: PageLayout, index: int) -> Optional[np.ndarray]:
    """Ảnh trang ảo để đọc riêng hệ ``index``: hệ đầu đặt một mình; hệ sau đặt dưới hệ đầu (cần số chỉ nhịp)."""
    if index == 0:
        return routing.virtual_page(gray, routing.system_bands(layout)[0])
    return routing.context_page(gray, layout, index)


def drop_context(page: Optional[merge.PageKern], layout: PageLayout, index: int) -> Optional[merge.PageKern]:
    """Bỏ phần của hệ đầu khỏi kết quả đọc trang ngữ cảnh (như :func:`routing.read_with_context`)."""
    if page is None or index == 0:
        return page
    first = layout.systems[0]
    if not (first.bars_closed and first.measures):
        return None
    chunks = merge.split_measures(page.body)
    data_chunks = [i for i, c in enumerate(chunks) if any(merge.is_data_line(line) for line in c)]
    if len(data_chunks) <= first.measures:
        return None
    cut = data_chunks[first.measures]
    interpretations = [line for line in chunks[0] if line.startswith("*")]
    body = interpretations + [line for chunk in chunks[cut:] for line in chunk]
    return merge.PageKern(number=page.number, header=page.header, body=body)


def data_chunks(page: merge.PageKern) -> list[list[str]]:
    """Các ô có dữ liệu của một lần đọc, theo thứ tự."""
    return [c for c in merge.split_measures(page.body) if any(merge.is_data_line(line) for line in c)]


def _regular(chunk: list[str], spines: int) -> bool:
    for line in chunk:
        if line.startswith("*") and any(t in ("*^", "*v", "*+", "*-") for t in line.split(merge.TAB)):
            return False
        if merge.is_data_line(line) and len(line.split(merge.TAB)) != spines:
            return False
    return True


def verify(
    result: merge.MergeResult,
    entries: list[dict],
    layouts: dict[int, PageLayout],
    page_images: dict[int, np.ndarray],
    read_system: ReadSystem,
    shifts: list[int],
    max_systems: int,
    has_time: Callable[[], bool],
    roles_top_down: Optional[list[str]] = None,
    abort: tuple[type[BaseException], ...] = (),
) -> tuple[merge.MergeResult, StabilityReport]:
    """Đọc lại các hệ có ô nghi ngờ, ghi ``_stable``/``_alternatives``/cờ ``UNSTABLE`` vào ``entries`` và trả bản kern
    (có thể đã thay vài ô) cùng báo cáo. ``entries`` phải đã qua :func:`review.annotate`.

    ``abort``: loại lỗi ``read_system`` ném ra khi phải dừng đọc lại (hết thời gian...); job vẫn chạy tiếp."""
    report = StabilityReport()
    if not shifts or max_systems <= 0:
        report.skipped = "tắt"
        return result, report

    by_system: dict[tuple[int, int], list[dict]] = {}
    for entry in entries:
        if entry.get("system") is None:
            continue
        by_system.setdefault((entry["page"], entry["system"]), []).append(entry)
    targets = [
        key
        for key, group in sorted(by_system.items())
        if any(e.get("confidence", 1.0) < review.REVIEW_THRESHOLD for e in group)
        and key[0] in layouts
        and key[0] in page_images
    ]
    # Hệ nhiều ô nghi ngờ nhất trước
    targets.sort(key=lambda key: -sum(1 for e in by_system[key] if e.get("confidence", 1.0) < review.REVIEW_THRESHOLD))
    targets = targets[:max_systems]

    for page_number, system_number in targets:
        if not has_time():
            report.skipped = "không đủ thời gian"
            break
        layout = layouts[page_number]
        index = system_number - 1
        if index >= len(layout.systems):
            continue
        group = sorted(by_system[(page_number, system_number)], key=lambda e: e["measure"])
        report.systems += 1
        reads: list[list[list[str]]] = []
        for shift in shifts:
            if not has_time():
                report.skipped = "không đủ thời gian"
                break
            image = system_image(shift_image(page_images[page_number], shift), layout, index)
            if image is None:
                break
            report.reads += 1
            try:
                page = read_system(image, page_number, index, f"tta{shift:+d}")
            except abort as exc:
                report.skipped = str(exc) or "dừng đọc lại"
                break
            page = drop_context(page, layout, index)
            if page is None or page.spines != result.spines:
                continue
            chunks = data_chunks(page)
            if len(chunks) != len(group):
                continue
            report.compared += 1
            reads.append(chunks)
        if not reads:
            continue
        result = _vote(result, group, reads, report, roles_top_down)
    return result, report


def _vote(
    result: merge.MergeResult,
    group: list[dict],
    reads: list[list[list[str]]],
    report: StabilityReport,
    roles_top_down: Optional[list[str]],
) -> merge.MergeResult:
    slices = {s.ordinal: s for s in review.slice_measures(result)}
    for position, entry in enumerate(group):
        piece = slices.get(entry["measure"])
        if piece is None:
            continue
        original = piece.lines(result)
        base = review.normalize_lines(original)
        variants = [chunks[position] for chunks in reads]
        keys = [review.normalize_lines(v) for v in variants]
        if all(k == base for k in keys):
            entry["_stable"] = True
            report.stable += 1
            continue
        report.unstable += 1
        flags = entry.setdefault("flags", [])
        if review.FLAG_UNSTABLE not in flags:
            flags.append(review.FLAG_UNSTABLE)
        alternatives: list[list[str]] = []
        seen = {base}
        for key, variant in zip(keys, variants):
            if key not in seen:
                seen.add(key)
                alternatives.append([line for line in variant if merge.is_data_line(line)])
        entry["_alternatives"] = alternatives
        agreed = len(keys) >= 2 and all(k == keys[0] for k in keys) and keys[0] != base
        if not agreed or not piece.regular or not _regular(variants[0], result.spines):
            entry.setdefault("_notes", []).append(
                f"Đọc lại hệ này {len(keys) + 1} lần cho kết quả khác nhau ở ô {entry['measure']}"
            )
            continue
        old_ok = review.chunk_duration_ok(original, result.spines, piece.meter)
        new_ok = review.chunk_duration_ok(variants[0], result.spines, piece.meter)
        soft = {review.FLAG_RANGE, review.FLAG_LEAP} & set(flags)
        better = (new_ok is True and old_ok is False) or (
            bool(soft) and new_ok is not False and _clears_soft(result, piece, variants[0], soft, roles_top_down)
        )
        if not better:
            entry.setdefault("_notes", []).append(
                f"Đọc lại hệ này {len(keys) + 1} lần cho kết quả khác nhau ở ô {entry['measure']}"
            )
            continue
        result = review.replace_measure(result, piece, variants[0])
        slices = {s.ordinal: s for s in review.slice_measures(result)}
        report.replaced += 1
        entry["flags"] = [f for f in flags if f not in (review.FLAG_UNSTABLE, review.FLAG_DURATION)]
        entry["_stable"] = False
        entry["_replaced"] = True
        entry.setdefault("_notes", []).append(
            f"Đã thay ô {entry['measure']} bằng cách đọc giống nhau của {len(keys)} lần đọc lại "
            "(bản đọc đầu sai trường độ hoặc tầm âm)"
        )
        report.notes.append(f"Trang {entry['page']}, ô nhịp {entry['measure']}: đã sửa theo các lần đọc lại hệ")
    return result


def _clears_soft(
    result: merge.MergeResult,
    piece: review.MeasureSlice,
    variant: list[str],
    soft: set[str],
    roles_top_down: Optional[list[str]],
) -> bool:
    """Cách đọc mới không còn lỗi tầm âm/bước nhảy ở ô này (thử thay rồi phân tích lại)."""
    trial = review.replace_measure(result, piece, variant)
    found = review.analyze(trial, roles_top_down)
    return not any(f.flag in soft for f in found.get(piece.ordinal, []))
