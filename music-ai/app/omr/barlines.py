"""Dò vạch nhịp trên ảnh trang để biết mỗi hệ có bao nhiêu ô nhịp (chỉ dùng OpenCV/numpy, không cần model).

Transcoda giải mã tự hồi quy cả trang nên đôi khi "lạc chỗ": đọc xong một hệ lại quay về đọc lại hệ trước, hoặc lặp nguyên
một khối ô nhịp tới hết giới hạn token. Số khuông vẫn đúng nên kiểm tra theo spine (``routing.py``) không thấy. Số ô nhịp
đếm trên ảnh là thước đo độc lập với model: kern có nhiều ô hơn ảnh thì chắc chắn có phần sinh thừa.

Cách dò, cho từng khuông của hệ (tọa độ lấy từ :mod:`app.omr.layout`):

1. Cột có mực phủ >= 90% chiều cao khuông, mảnh (< 0,9 khoảng dòng kẻ), không nằm sát mép trái khuông (vạch đầu hệ).
2. Bỏ thân nốt: mực kéo dài ra ngoài khuông quá 0,6 khoảng dòng kẻ mà không nối liền sang khuông kề trong hệ (thân nốt
   có dòng kẻ phụ, khóa Sol), hoặc một trong bốn góc cạnh hai đầu vạch có mực (đầu nốt đặc/rỗng nằm ở một đầu thân nốt).
   Dòng kẻ được bỏ trước khi đo, kể cả dòng kẻ hơi nghiêng của ảnh quét. Vạch nhịp có các góc trắng.
3. Gộp ứng viên các khuông theo x (vạch kép, vạch kết, vạch nhắc lại thành một); giữ cụm xuất hiện ở ít nhất nửa số khuông
   của hệ hoặc nối liền sang khuông kề (vạch xuyên grand staff).
4. Số ô của hệ = số vạch; hệ không kết thúc bằng vạch nhịp ở mép phải thì thêm 1 và coi là không chắc chắn.

Không ném lỗi: bố cục rỗng thì không làm gì.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import cv2
import numpy as np

if TYPE_CHECKING:  # tránh import vòng: layout.py gọi module này ở cuối analyze_layout
    from app.omr.layout import PageLayout, Staff, System

_COVERAGE = 0.9
"""Tỉ lệ hàng của khuông mà một cột phải có mực để là ứng viên vạch nhịp."""

_MAX_WIDTH = 0.9
"""Độ dày tối đa của vạch (theo khoảng dòng kẻ); dày hơn là đầu nốt/khối chữ."""

_DOUBLE_GAP = 0.6
"""Hai nét dọc cách nhau không quá bấy nhiêu khoảng dòng kẻ là một vạch kép/vạch kết (đo nét dính cho cả cụm)."""

_MAX_DOUBLE_WIDTH = 1.8
"""Bề rộng tối đa của vạch kép/vạch kết (mảnh + khe + dày)."""

_LEFT_SKIP = 0.6
"""Bỏ ứng viên sát mép trái khuông (vạch đầu hệ), theo khoảng dòng kẻ."""

_OVERSHOOT = 0.6
"""Mực kéo dài ra ngoài khuông quá bấy nhiêu khoảng dòng kẻ (mà không nối sang khuông kề) thì là thân nốt."""

_OUTER_OVERSHOOT = 1.3
"""Vạch đã nối sang khuông kề ở một đầu thì đầu còn lại (nếu là mép ngoài của hệ) được lấn ra ngoài khuông tới bấy nhiêu."""

_MERGE = 1.6
"""Hai vạch (của các khuông khác nhau trong hệ) cách nhau không quá bấy nhiêu khoảng dòng kẻ là cùng một vạch."""

_HEAD_INK = 0.06
"""Tỉ lệ mực tối đa ở các góc cạnh hai đầu vạch (sau khi bỏ dòng kẻ). Thân nốt có đầu nốt (đặc hoặc rỗng) ở một đầu nên
một góc có nhiều mực (thường >= 0,09); vạch nhịp thì các góc gần như trắng."""

_HEAD_WIDTH = 1.1
"""Bề rộng ô góc (khoảng dòng kẻ): đủ chứa đầu nốt dính vào thân, chưa chạm nốt kế tiếp sau vạch nhịp."""

_HEAD_HEIGHT = 1.0
"""Chiều cao ô góc tính từ dòng kẻ ngoài cùng vào trong khuông (khoảng dòng kẻ)."""

_HEAD_OUTSIDE = 0.6
"""Ô góc lấn ra ngoài khuông bấy nhiêu khoảng dòng kẻ (đầu nốt nằm trên/dưới dòng kẻ ngoài cùng)."""

_LINK_GAP = 1.0
"""Vạch xuyên grand staff của bản quét cũ có thể đứt vài điểm ảnh trước khi chạm khuông kề: coi là nối liền nếu hở không
quá bấy nhiêu khoảng dòng kẻ."""

_WEAK_HEAD_INK = 0.15
"""Ứng viên có mực ở các góc trong khoảng (``_HEAD_INK``, ``_WEAK_HEAD_INK``] là ứng viên yếu: ở khuông đông nốt (piano, nốt
sát vạch) vạch thật cũng bị nốt kề đè vào các góc. Ứng viên yếu chỉ được tính khi một khuông khác của hệ có ứng viên chắc
ở cùng vị trí và phải nối liền sang khuông kề (vạch xuyên grand staff), vì thân nốt, số chỉ nhịp hiếm khi nối liền hai
khuông."""


@dataclass
class SystemBars:
    """Vạch nhịp của một hệ."""

    barlines: list[int] = field(default_factory=list)
    """Tọa độ x (giữa vạch) của các vạch nhịp, trái sang phải, không gồm vạch đầu hệ."""

    measures: int = 0
    closed: bool = False
    """Hệ kết thúc bằng một vạch nhịp ở mép phải (bình thường). False thì số ô có thể sai."""


def annotate(layout: "PageLayout", ink: np.ndarray) -> None:
    """Dò vạch nhịp mọi hệ của ``layout`` và ghi vào ``System.barlines``/``measures``/``bars_closed`` (sửa trực tiếp)."""
    if not layout.systems or layout.interline <= 0:
        return
    residue = _without_lines(ink)
    # mép phải trang: dòng kẻ của bản quét cũ đứt sớm nên mép phải của từng khuông/hệ có thể thấp hơn vạch kết thật
    page_right = max((staff.right for system in layout.systems for staff in system.staves), default=0.0)
    for system in layout.systems:
        bars = detect_system(system, ink, residue, layout.interline, page_right)
        system.barlines = bars.barlines
        system.measures = bars.measures
        system.bars_closed = bars.closed


def _without_lines(ink: np.ndarray) -> np.ndarray:
    """Mặt nạ mực đã bỏ dòng kẻ (và mép dày của dòng kẻ). Dòng kẻ của ảnh quét hơi nghiêng đi theo bậc thang, từng đoạn
    ngắn hơn nhân mở hình thái, nên nới mực một hàng theo chiều dọc rồi mới mở, sau đó nới kết quả thêm một hàng."""
    width = ink.shape[1]
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, width // 40), 1))
    vertical = np.ones((3, 1), np.uint8)
    lines = cv2.dilate(cv2.morphologyEx(cv2.dilate(ink, vertical), cv2.MORPH_OPEN, kernel), vertical)
    return (ink & (1 - lines)).astype(np.uint8)


def detect_system(
    system: "System", ink: np.ndarray, residue: np.ndarray, interline: float, page_right: float = 0.0
) -> SystemBars:
    """Vạch nhịp của một hệ. ``residue`` là mặt nạ mực đã bỏ dòng kẻ (:func:`_without_lines`); ``page_right``: mép phải
    xa nhất của các khuông trong trang."""
    candidates: list[tuple[float, int, bool, bool]] = []
    staves = system.staves
    for index, staff in enumerate(staves):
        above = staves[index - 1] if index > 0 else None
        below = staves[index + 1] if index + 1 < len(staves) else None
        for x, linked, weak in _staff_candidates(staff, above, below, ink, residue, interline, page_right):
            candidates.append((x, index, linked, weak))
    candidates.sort()

    clusters: list[dict] = []
    for x, staff_index, linked, weak in candidates:
        if not (clusters and x - clusters[-1]["last"] <= _MERGE * interline):
            clusters.append({"first": x, "last": x, "staves": set(), "strong": 0, "linked": False})
        cluster = clusters[-1]
        cluster["last"] = x
        cluster["staves"].add(staff_index)
        cluster["strong"] += 0 if weak else 1
        cluster["linked"] = cluster["linked"] or linked

    need = (len(staves) + 1) // 2
    kept = [c for c in clusters if c["strong"] and (len(c["staves"]) >= need or c["linked"])]
    barlines = [int(round((c["first"] + c["last"]) / 2)) for c in kept]
    closed = bool(kept) and system.right - kept[-1]["last"] <= _MERGE * interline
    measures = len(kept) + (0 if closed else 1)
    return SystemBars(barlines=barlines, measures=measures, closed=closed)


def _staff_candidates(
    staff: "Staff",
    above: "Staff | None",
    below: "Staff | None",
    ink: np.ndarray,
    residue: np.ndarray,
    interline: float,
    page_right: float = 0.0,
) -> list[tuple[float, bool, bool]]:
    """Ứng viên vạch nhịp của một khuông: ``(x giữa vạch, nối liền sang khuông kề, yếu)``."""
    height, width = ink.shape
    top, bottom = int(round(staff.top)), int(round(staff.bottom))
    if bottom <= top or top < 0 or bottom >= height:
        return []
    coverage = ink[top : bottom + 1, :].mean(axis=0)
    # mép phải lấy theo khuông dài nhất của hệ và của trang: dòng kẻ của ảnh quét có thể đứt sớm làm khuông trông ngắn hơn
    right_edge = max(staff.right, above.right if above else 0, below.right if below else 0, page_right)
    results: list[tuple[float, bool, bool]] = []
    for x0, x1, parts in _bar_groups(_runs(np.flatnonzero(coverage >= _COVERAGE)), interline):
        if x1 - x0 + 1 > (_MAX_WIDTH if parts == 1 else _MAX_DOUBLE_WIDTH) * interline:
            continue
        if x0 < staff.left + _LEFT_SKIP * interline or x1 > right_edge + _LEFT_SKIP * interline:
            continue
        column = ink[:, max(0, x0 - 1) : min(width, x1 + 2)].max(axis=1)
        up = _extent(column, top - 1, -1)
        down = _extent(column, bottom + 1, 1)
        linked_up = above is not None and top - up <= above.bottom + _LINK_GAP * interline
        linked_down = below is not None and bottom + down >= below.top - _LINK_GAP * interline
        linked = linked_up or linked_down
        # đầu ngoài của vạch xuyên grand staff có thể lấn quá mép khuông một chút (vạch dày, mép khuông ước lượng lệch)
        up_limit = (_OUTER_OVERSHOOT if linked and above is None else _OVERSHOOT) * interline
        down_limit = (_OUTER_OVERSHOOT if linked and below is None else _OVERSHOOT) * interline
        if up > up_limit and not linked_up:
            continue
        if down > down_limit and not linked_down:
            continue
        head = _head_ink(residue, top, bottom, x0, x1, interline)
        if head > _WEAK_HEAD_INK:
            continue
        weak = head > _HEAD_INK
        if weak and not linked:  # số chỉ nhịp (hai số 4 chồng nhau) cũng phủ kín khuông: ứng viên yếu phải nối liền sang khuông kề
            continue
        results.append(((x0 + x1) / 2, linked, weak))
    return results


def _runs(columns: np.ndarray) -> list[tuple[int, int]]:
    """Gom các cột liền nhau thành đoạn ``(đầu, cuối)``."""
    runs: list[list[int]] = []
    for x in columns.tolist():
        if runs and x - runs[-1][1] <= 1:
            runs[-1][1] = x
        else:
            runs.append([x, x])
    return [(a, b) for a, b in runs]


def _bar_groups(runs: list[tuple[int, int]], interline: float) -> list[tuple[int, int, int]]:
    """Gộp các nét dọc sát nhau (vạch kép, vạch kết) thành ``(đầu, cuối, số nét)``; nét đứng riêng có số nét 1."""
    groups: list[list[int]] = []
    for x0, x1 in runs:
        if groups and x0 - groups[-1][1] - 1 <= _DOUBLE_GAP * interline:
            groups[-1][1] = x1
            groups[-1][2] += 1
        else:
            groups.append([x0, x1, 1])
    return [(a, b, n) for a, b, n in groups]


def _extent(column: np.ndarray, start: int, step: int) -> int:
    """Số hàng có mực liên tiếp từ ``start`` theo hướng ``step``."""
    count = 0
    row = start
    while 0 <= row < column.shape[0] and column[row]:
        count += 1
        row += step
    return count


def _head_ink(residue: np.ndarray, top: int, bottom: int, x0: int, x1: int, interline: float) -> float:
    """Tỉ lệ mực lớn nhất trong bốn ô góc cạnh hai đầu vạch ``[x0, x1]`` (trái/phải × trên/dưới), nơi đầu nốt dính
    vào thân nốt."""
    height, width = residue.shape
    w = max(2, int(round(_HEAD_WIDTH * interline)))
    inside = int(round(_HEAD_HEIGHT * interline))
    outside = int(round(_HEAD_OUTSIDE * interline))
    best = 0.0
    for y0, y1 in ((bottom - inside, bottom + outside), (top - outside, top + inside)):
        for xa, xb in ((x0 - 1 - w, x0 - 1), (x1 + 2, x1 + 2 + w)):
            box = residue[max(0, y0) : min(height, y1 + 1), max(0, xa) : min(width, xb)]
            if box.size:
                best = max(best, float(box.mean()))
    return best
