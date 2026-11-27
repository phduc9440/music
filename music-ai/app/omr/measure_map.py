"""Bản đồ ô nhịp: mỗi ô của bản nhận diện nằm ở trang nào, hệ nào, khung nào trên ảnh trang (``result_data.measureMap``).

Web dùng để khoanh đúng ô trên ảnh khi người dùng chọn một ô trên sheet (và ngược lại), và để liệt kê "ô cần kiểm tra":

* ``DURATION``: tổng trường độ khác số chỉ nhịp (:func:`merge.bad_measures`);
* ``COUNT_MISMATCH``: ô thuộc hệ (hoặc trang) mà số ô đọc được khác số ô đếm trên ảnh, nên chưa chắc ô nào là thừa/thiếu.

Chỉ gán hệ và khung khi biết chắc ô nào thuộc hệ nào: trang được nhận diện lại theo hệ (biết số ô từng hệ), trang đọc
cả trang mà tổng số ô khớp số ô trên ảnh (chia tuần tự theo số ô từng hệ), hoặc trang lệch số ô mà căn được từng ô kern
với từng ô ảnh theo số đầu nốt (:func:`estimate_system_counts`: chỉ hệ chứa chỗ thừa/thiếu ô bị gắn ``COUNT_MISMATCH``,
thay vì mọi ô của trang). Còn lại chỉ ghi trang.

Tọa độ theo ảnh trang đã tiền xử lý (``pages/page-NNN.png``, 1050x1485), gốc trên-trái: ``box = [x0, y0, x1, y1]``.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

from app.omr import merge
from app.omr.layout import PageLayout, System

FLAG_DURATION = "DURATION"
FLAG_COUNT = "COUNT_MISMATCH"
FLAG_LAYOUT = "LAYOUT_UNCHECKED"
"""Trang có khuông nhưng bố cục không tin được (các hệ khác số khuông, vạch nối không rõ): không kiểm được số khuông và
số ô trên ảnh, nên mọi ô của trang đều cần đối chiếu (trước đây Review chỉ báo vài ô lệch trường độ dù cả trang có thể
mất ô)."""

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
        report_pages.append(
            {"page": number, "imageMeasures": image, "kernMeasures": count, "layoutChecked": not layout_unchecked(layout)}
        )
        placed = _place(layout, count, system_counts.get(number))
        for offset in range(count):
            measure = first + offset
            if measure in entries:  # ô vắt qua chỗ nối trang: giữ vị trí ở trang trước
                continue
            entry: dict = {"measure": measure, "page": number, "system": None, "box": None, "flags": []}
            if placed is not None:
                system_index, box, mismatch, exact = placed[offset]
                entry["system"] = system_index + 1
                entry["box"] = box
                if exact:
                    entry["_exact"] = True  # khung đúng ô trên ảnh (không phải khung cả hệ): đếm được ký hiệu PDF trong ô
                if mismatch:
                    entry["flags"].append(FLAG_COUNT)
            elif image is not None and image != count:
                entry["flags"].append(FLAG_COUNT)
            if measure in bad:
                entry["flags"].append(FLAG_DURATION)
            if layout_unchecked(layout):
                entry["flags"].append(FLAG_LAYOUT)
            entries[measure] = entry

    check = {
        "imageMeasures": image_total,
        "kernMeasures": merge.count_measures(merged.lines),
        "pages": report_pages,
    }
    return [entries[m] for m in sorted(entries)], check


def layout_unchecked(layout: Optional[PageLayout]) -> bool:
    """Trang có khuông nhạc nhưng bố cục không đủ tin để kiểm số khuông/số ô (xem :data:`FLAG_LAYOUT`)."""
    return layout is not None and bool(layout.systems) and not layout.confident


_ESTIMATE_GAP = 0.8
"""Chi phí bỏ qua một ô (ô ảnh model bỏ sót / ô kern model đọc thừa) khi căn theo số đầu nốt."""

_ESTIMATE_MAX_COST = 0.35
"""Chi phí ghép trung bình (|a - b| / max(a, b)) tối đa để tin phép căn."""


def kern_note_counts(merged: merge.MergeResult, page: int) -> list[int]:
    """Số nốt có cao độ (tính từng nốt trong hợp âm) của từng ô kern thuộc trang ``page``, theo thứ tự và cùng cách đánh
    số với :func:`merge.page_measure_ranges`."""
    counts: dict[int, int] = {}
    measure = 1
    has_data = False
    for line, line_page in zip(merged.lines, merged.line_pages):
        if merge.is_barline(line):
            if has_data:
                measure += 1
            has_data = False
            continue
        if not merge.is_data_line(line):
            continue
        has_data = True
        if line_page != page:
            continue
        notes = sum(
            1
            for cell in line.split("\t")
            for token in cell.split(" ")
            if token and token != "." and "r" not in token and any(c in "abcdefgABCDEFG" for c in token)
        )
        counts[measure] = counts.get(measure, 0) + notes
    return [counts[m] for m in sorted(counts)]


def estimate_system_counts(kern_counts: list[int], image_measures: list[tuple[int, int]], systems: int) -> Optional[list[int]]:
    """Số ô kern thuộc từng hệ khi số ô kern khác số ô trên ảnh, bằng cách căn hai dãy "số nốt mỗi ô" (quy hoạch động,
    được bỏ qua ô ở cả hai phía). ``image_measures``: ``(chỉ số hệ, số đầu nốt)`` của từng ô trên ảnh theo thứ tự.

    Ô kern thừa (không ghép được) được tính cho hệ của ô ghép được đứng trước nó (không có thì đứng sau). Trả None khi hai
    dãy lệch nhau quá nhiều hoặc phép căn không đủ tốt: lúc đó không biết ô nào thuộc hệ nào."""
    n, m = len(kern_counts), len(image_measures)
    if n == 0 or m == 0 or abs(n - m) > max(2, m // 5):
        return None
    image_counts = [c for _s, c in image_measures]

    def cost_of(a: int, b: int) -> float:
        return abs(a - b) / float(max(a, b, 1))

    table = np.zeros((n + 1, m + 1))
    table[:, 0] = np.arange(n + 1) * _ESTIMATE_GAP
    table[0, :] = np.arange(m + 1) * _ESTIMATE_GAP
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            table[i, j] = min(
                table[i - 1, j - 1] + cost_of(kern_counts[i - 1], image_counts[j - 1]),
                table[i - 1, j] + _ESTIMATE_GAP,
                table[i, j - 1] + _ESTIMATE_GAP,
            )
    matched: dict[int, int] = {}
    costs: list[float] = []
    i, j = n, m
    while i > 0 and j > 0:
        diagonal = table[i - 1, j - 1] + cost_of(kern_counts[i - 1], image_counts[j - 1])
        if abs(table[i, j] - diagonal) < 1e-9:
            matched[i - 1] = j - 1
            costs.append(cost_of(kern_counts[i - 1], image_counts[j - 1]))
            i, j = i - 1, j - 1
        elif abs(table[i, j] - (table[i - 1, j] + _ESTIMATE_GAP)) < 1e-9:
            i -= 1
        else:
            j -= 1
    if len(matched) < 0.6 * min(n, m) or sum(costs) / len(costs) > _ESTIMATE_MAX_COST:
        return None
    system_of: list[Optional[int]] = [image_measures[matched[k]][0] if k in matched else None for k in range(n)]
    for k in range(n):  # ô thừa: theo ô đứng trước
        if system_of[k] is None and k > 0:
            system_of[k] = system_of[k - 1]
    for k in range(n - 1, -1, -1):  # ô thừa ở đầu trang: theo ô đứng sau
        if system_of[k] is None and k + 1 < n:
            system_of[k] = system_of[k + 1]
    if any(s is None for s in system_of):
        return None
    counts = [0] * systems
    for s in system_of:
        counts[int(s)] += 1  # type: ignore[arg-type]
    return counts


def image_measure_heads(layout: PageLayout, heads_x: list[tuple[int, float]]) -> Optional[list[tuple[int, int]]]:
    """``(chỉ số hệ, số đầu nốt)`` của từng ô trên ảnh từ vạch nhịp của bố cục; ``heads_x``: ``(chỉ số hệ, x)`` của
    từng đầu nốt (mọi khuông). None nếu bố cục chưa đếm chắc số ô."""
    if not layout.confident or not layout.bars_confident or not layout.systems:
        return None
    out: list[tuple[int, int]] = []
    for index, system in enumerate(layout.systems):
        edges = [float(system.left)] + [float(b) for b in system.barlines]
        if not system.bars_closed:
            edges.append(float(system.right) + 1.0)
        own = [x for s, x in heads_x if s == index]
        for a, b in zip(edges, edges[1:]):
            out.append((index, sum(1 for x in own if a <= x < b)))
    return out


def _place(
    layout: Optional[PageLayout], count: int, counts: Optional[list[Optional[int]]]
) -> Optional[list[tuple[int, Optional[list[int]], bool, bool]]]:
    """Vị trí ``count`` ô của một trang: mỗi ô ``(chỉ số hệ, khung hoặc None, hệ lệch số ô, khung đúng ô)``; None nếu
    không chia được."""
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
    placed: list[tuple[int, Optional[list[int]], bool, bool]] = []
    for index, (system, got) in enumerate(zip(layout.systems, per_system)):
        exact = system.bars_closed and system.measures == got
        for position in range(got):
            box = _measure_box(layout, system, position) if exact else _system_box(layout, system)
            placed.append((index, box, not exact and system.measures is not None and system.bars_closed, exact))
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
