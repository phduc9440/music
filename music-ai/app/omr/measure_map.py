"""Bản đồ ô nhịp: mỗi ô của bản nhận diện nằm ở trang nào, hệ nào, khung nào trên ảnh trang (``result_data.measureMap``).

Web dùng để khoanh đúng ô trên ảnh khi người dùng chọn một ô trên sheet (và ngược lại), và để liệt kê "ô cần kiểm tra":

* ``DURATION``: tổng trường độ khác số chỉ nhịp (:func:`merge.bad_measures`);
* ``COUNT_MISMATCH``: ô thuộc hệ (hoặc trang) mà số ô đọc được khác số ô đếm trên ảnh, nên chưa chắc ô nào là thừa/thiếu.

Chỉ gán hệ và khung khi biết chắc ô nào thuộc hệ nào: trang được nhận diện lại theo hệ (biết số ô từng hệ), hoặc trang
đọc cả trang mà tổng số ô khớp số ô trên ảnh (chia tuần tự theo số ô từng hệ). Còn lại chỉ ghi trang.

Tọa độ theo ảnh trang đã tiền xử lý (``pages/page-NNN.png``, 1050x1485), gốc trên-trái: ``box = [x0, y0, x1, y1]``.
"""

from __future__ import annotations

from typing import Optional

from app.omr import merge
from app.omr.layout import PageLayout, System

FLAG_DURATION = "DURATION"
FLAG_COUNT = "COUNT_MISMATCH"

_BOX_PAD = 2.0
"""Khung ô lấy rộng ra trên/dưới hệ bấy nhiêu khoảng dòng kẻ (dòng kẻ phụ, dấu)."""


def build(
    merged: merge.MergeResult,
    pages: list[merge.PageKern],
    layouts: dict[int, PageLayout],
    system_counts: dict[int, list[Optional[int]]],
) -> tuple[list[dict], dict]:
    """Tạo ``(measureMap, measureCheck)``.

    ``pages``: kern từng trang đã chọn (theo thứ tự ghép); ``system_counts``: số ô từng hệ của các trang được nhận diện
    lại theo hệ (None cho hệ không đọc được).
    """
    ranges = {r["page"]: r for r in merge.page_measure_ranges(merged)}
    bad = set(merge.bad_measures(merged))
    entries: dict[int, dict] = {}
    report_pages: list[dict] = []
    image_total: Optional[int] = 0

    for page in pages:
        number = page.number
        layout = layouts.get(number)
        span = ranges.get(number)
        image = layout.measure_count if layout is not None and layout.confident else None
        image_total = image_total + image if image_total is not None and image is not None else None
        if span is None:
            report_pages.append({"page": number, "imageMeasures": image, "kernMeasures": 0})
            continue
        first, last = span["firstMeasure"], span["lastMeasure"]
        count = last - first + 1
        report_pages.append({"page": number, "imageMeasures": image, "kernMeasures": count})
        placed = _place(layout, count, system_counts.get(number))
        for offset in range(count):
            measure = first + offset
            if measure in entries:  # ô vắt qua chỗ nối trang: giữ vị trí ở trang trước
                continue
            entry: dict = {"measure": measure, "page": number, "system": None, "box": None, "flags": []}
            if placed is not None:
                system_index, box, mismatch = placed[offset]
                entry["system"] = system_index + 1
                entry["box"] = box
                if mismatch:
                    entry["flags"].append(FLAG_COUNT)
            elif image is not None and image != count:
                entry["flags"].append(FLAG_COUNT)
            if measure in bad:
                entry["flags"].append(FLAG_DURATION)
            entries[measure] = entry

    check = {
        "imageMeasures": image_total,
        "kernMeasures": merge.count_measures(merged.lines),
        "pages": report_pages,
    }
    return [entries[m] for m in sorted(entries)], check


def _place(
    layout: Optional[PageLayout], count: int, counts: Optional[list[Optional[int]]]
) -> Optional[list[tuple[int, Optional[list[int]], bool]]]:
    """Vị trí ``count`` ô của một trang: mỗi ô ``(chỉ số hệ, khung hoặc None, hệ lệch số ô)``; None nếu không chia được."""
    if layout is None or not layout.confident or not layout.systems:
        return None
    if counts is not None and len(counts) == len(layout.systems) and all(c is not None for c in counts):
        per_system = [int(c) for c in counts]  # type: ignore[arg-type]
    elif layout.bars_confident and layout.measure_count == count:
        per_system = [s.measures or 0 for s in layout.systems]
    else:
        return None
    if sum(per_system) != count:
        return None
    placed: list[tuple[int, Optional[list[int]], bool]] = []
    for index, (system, got) in enumerate(zip(layout.systems, per_system)):
        exact = system.bars_closed and system.measures == got
        for position in range(got):
            box = _measure_box(layout, system, position) if exact else _system_box(layout, system)
            placed.append((index, box, not exact and system.measures is not None and system.bars_closed))
    return placed


def _vertical(layout: PageLayout, system: System) -> tuple[int, int]:
    pad = _BOX_PAD * layout.interline
    return max(0, int(system.top - pad)), min(layout.height, int(system.bottom + pad))


def _system_box(layout: PageLayout, system: System) -> list[int]:
    y0, y1 = _vertical(layout, system)
    return [int(system.left), y0, int(system.right), y1]


def _measure_box(layout: PageLayout, system: System, position: int) -> list[int]:
    y0, y1 = _vertical(layout, system)
    bars = system.barlines
    x0 = int(system.left) if position == 0 else bars[position - 1]
    x1 = bars[position] if position < len(bars) else int(system.right)
    return [x0, y0, x1, y1]
