"""Phân tích bố cục trang nhạc: khuông, hệ khuông và vai trò từng khuông (chỉ dùng OpenCV, không cần model).

Chạy trên chính ảnh trang đã tiền xử lý (1050x1485) mà Transcoda nhận, để số khuông đo được so thẳng với số spine model
sinh ra. Kết quả dùng cho ba việc:

* **kiểm tra**: trang có ``n`` khuông mỗi hệ thì kern của trang phải có ``n`` spine ``**kern``;
* **nhận diện lại theo hệ**: tọa độ từng hệ để cắt thành "trang ảo" (``app/omr/routing.py``);
* **vai trò**: khuông nào là giọng hát/nhạc cụ một khuông (``SINGLE``), khuông nào thuộc piano (``PIANO``), để bước
  xuất tách part "Giọng hát" khỏi part "Piano".

Các bước:

1. Mặt nạ mực, giữ nét ngang dài (mở hình thái), chiếu theo hàng -> các dòng kẻ.
2. Khoảng cách dòng kẻ (interline) = trung vị khoảng cách giữa các dòng liền nhau (4/5 khoảng cách nằm trong khuông).
3. Gom các dòng gần nhau thành khuông 5 dòng; chịu được thiếu 1-2 dòng (dòng kẻ bị nốt/chữ che khi nhị phân hóa).
4. Gom khuông thành hệ: hai khuông liền nhau cùng lề trái và có vạch dọc nối ở lề trái thì cùng hệ.
5. Vai trò: cặp khuông có ngoặc ở lề trái (ngoặc nhọn piano) là ``PIANO``; không thấy ngoặc thì theo quy ước của bản
   giọng hát/hợp xướng có đệm: hai khuông dưới cùng của hệ là piano, các khuông phía trên là ``SINGLE``.

Không ném lỗi: ảnh không đọc được bố cục thì trả bố cục rỗng với ``confident=False`` và pipeline chạy như cũ.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

ROLE_PIANO = "PIANO"
"""Một khuông của grand staff piano (2 khuông nối bằng ngoặc nhọn)."""

ROLE_SINGLE = "SINGLE"
"""Khuông đơn: giọng hát hoặc nhạc cụ một khuông."""

_INK_MAX = 200
"""Ngưỡng mực tối đa. Ảnh số sạch (nền 255) có dòng kẻ mảnh bị khử răng cưa thành xám nhạt, nên ngưỡng phải khá cao;
nền giấy tối hơn thì ngưỡng hạ theo (xem :func:`_ink_mask`)."""

_MIN_STAFF_WIDTH_RATIO = 0.35
"""Khuông ngắn hơn tỉ lệ này so với khuông dài nhất trang thì bỏ (nét ngang lẻ, khuông ossia nhỏ)."""

_CONNECT_COVERAGE = 0.85
"""Tỉ lệ hàng có mực tối thiểu của vạch dọc nối hai khuông (vạch hệ hoặc ngoặc)."""


@dataclass
class Staff:
    """Một khuông 5 dòng. Tọa độ theo pixel của ảnh trang (gốc trên-trái)."""

    top: int
    """Dòng kẻ trên cùng."""

    bottom: int
    """Dòng kẻ dưới cùng."""

    left: int
    right: int
    lines: int
    """Số dòng kẻ dò được trực tiếp (thiếu thì đã được nội suy cho đủ 5)."""

    role: str = ROLE_SINGLE

    def to_dict(self) -> dict:
        return {
            "top": self.top,
            "bottom": self.bottom,
            "left": self.left,
            "right": self.right,
            "lines": self.lines,
            "role": self.role,
        }


@dataclass
class System:
    """Một hệ khuông: các khuông đọc cùng lúc, từ trên xuống."""

    staves: list[Staff]
    connected: bool = False
    """True nếu các khuông được nối bằng vạch dọc ở lề trái (bằng chứng chắc chắn là cùng hệ)."""

    @property
    def top(self) -> int:
        return self.staves[0].top

    @property
    def bottom(self) -> int:
        return self.staves[-1].bottom

    @property
    def left(self) -> int:
        return min(s.left for s in self.staves)

    @property
    def right(self) -> int:
        return max(s.right for s in self.staves)

    @property
    def roles(self) -> list[str]:
        return [s.role for s in self.staves]

    def to_dict(self) -> dict:
        return {
            "top": self.top,
            "bottom": self.bottom,
            "left": self.left,
            "right": self.right,
            "connected": self.connected,
            "staves": [s.to_dict() for s in self.staves],
        }


@dataclass
class PageLayout:
    """Bố cục một trang. ``confident`` False thì chỉ dùng để tham khảo, không dùng để nhận diện lại."""

    width: int
    height: int
    interline: float
    systems: list[System] = field(default_factory=list)
    confident: bool = False
    notes: list[str] = field(default_factory=list)
    """Lý do bố cục không đáng tin (để ghi log/gỡ lỗi)."""

    @property
    def staff_counts(self) -> list[int]:
        return [len(s.staves) for s in self.systems]

    @property
    def staff_count(self) -> Optional[int]:
        """Số khuông mỗi hệ nếu mọi hệ giống nhau, ngược lại None."""
        counts = set(self.staff_counts)
        return counts.pop() if len(counts) == 1 else None

    @property
    def roles(self) -> Optional[list[str]]:
        """Vai trò từng khuông (trên xuống) nếu mọi hệ cùng số khuông và cùng vai trò, ngược lại None."""
        if not self.systems:
            return None
        first = self.systems[0].roles
        if all(s.roles == first for s in self.systems):
            return first
        return None

    def to_dict(self) -> dict:
        return {
            "width": self.width,
            "height": self.height,
            "interline": round(self.interline, 2),
            "confident": self.confident,
            "staffCount": self.staff_count,
            "roles": self.roles,
            "notes": self.notes,
            "systems": [s.to_dict() for s in self.systems],
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=1)


# ====================================================================== điểm vào


def analyze_layout(gray: np.ndarray) -> PageLayout:
    """Phân tích bố cục ảnh trang xám uint8. Không ném lỗi với ảnh hợp lệ."""
    if gray.ndim != 2 or gray.size == 0:
        return PageLayout(width=0, height=0, interline=0.0, notes=["ảnh rỗng"])
    height, width = gray.shape
    ink = _ink_mask(gray)
    layout = PageLayout(width=width, height=height, interline=0.0)

    lines, profile = _staff_lines(ink)
    if len(lines) < 5:
        layout.notes.append(f"chỉ thấy {len(lines)} dòng kẻ")
        return layout
    diffs = np.diff(lines)
    interline = float(np.median(diffs))
    if not 3.0 <= interline <= 40.0:
        layout.notes.append(f"khoảng cách dòng kẻ bất thường ({interline:.1f}px)")
        return layout
    layout.interline = interline

    horizontal = _horizontal(ink)
    staves = _group_staves(lines, profile, interline, horizontal)
    if not staves:
        layout.notes.append("không gom được khuông nào")
        return layout
    longest = max(s.right - s.left for s in staves)
    staves = [s for s in staves if s.right - s.left >= _MIN_STAFF_WIDTH_RATIO * longest]

    layout.systems = _group_systems(staves, ink, interline)
    for system in layout.systems:
        _assign_roles(system, ink, interline)

    counts = layout.staff_counts
    if layout.staff_count is None:
        layout.notes.append(f"các hệ có số khuông khác nhau {counts}")
    if any(not s.connected for s in layout.systems if len(s.staves) > 1):
        layout.notes.append("có hệ nhiều khuông không thấy vạch nối ở lề trái")
    layout.confident = bool(layout.systems) and layout.staff_count is not None and not layout.notes
    return layout


def analyze_layout_file(path) -> PageLayout:
    """Đọc PNG trang (xám) rồi phân tích. File không đọc được thì trả bố cục rỗng."""
    gray = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if gray is None:
        return PageLayout(width=0, height=0, interline=0.0, notes=["không đọc được ảnh"])
    return analyze_layout(gray)


# ====================================================================== dòng kẻ và khuông


def _ink_mask(gray: np.ndarray) -> np.ndarray:
    """Mặt nạ mực 0/1: tối hơn nền giấy (phân vị 90) ít nhất 40 mức, tối đa :data:`_INK_MAX`."""
    background = float(np.percentile(gray, 90))
    threshold = min(_INK_MAX, background - 40)
    return (gray < threshold).astype(np.uint8)


def _horizontal(ink: np.ndarray) -> np.ndarray:
    """Chỉ giữ nét ngang dài (dòng kẻ), bỏ đầu nốt, chữ, thân nốt."""
    width = ink.shape[1]
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, width // 40), 1))
    return cv2.morphologyEx(ink, cv2.MORPH_OPEN, kernel)


def _staff_lines(ink: np.ndarray) -> tuple[list[float], np.ndarray]:
    """Tâm (theo y) các dòng kẻ và profile hàng của nét ngang dài."""
    horizontal = _horizontal(ink)
    # Nới 1 hàng lên/xuống: dòng kẻ hơi nghiêng (cuối trang ảnh chụp) trải trên 2-3 hàng mà vẫn được đếm đủ chiều dài
    spread = cv2.dilate(horizontal, np.ones((3, 1), np.uint8))
    profile = spread.sum(axis=1).astype(np.float64)
    positive = profile[profile > 0]
    if positive.size == 0:
        return [], profile
    # 35% của dòng dài nhất: hệ cuối bài thường ngắn hơn cả trang nhưng vẫn phải nhận
    threshold = 0.35 * float(np.percentile(positive, 98))
    rows = np.flatnonzero(profile >= threshold)
    centers: list[float] = []
    start = previous = None
    for row in rows:
        if previous is not None and row - previous <= 1:
            previous = row
            continue
        if start is not None:
            centers.append(_weighted_center(profile, start, previous))
        start = previous = row
    if start is not None:
        centers.append(_weighted_center(profile, start, previous))
    return centers, profile


def _weighted_center(profile: np.ndarray, start: int, end: int) -> float:
    rows = np.arange(start, end + 1)
    weights = profile[start : end + 1]
    return float((rows * weights).sum() / weights.sum()) if weights.sum() else (start + end) / 2.0


def _group_staves(lines: list[float], profile: np.ndarray, interline: float, horizontal: np.ndarray) -> list[Staff]:
    """Gom dòng kẻ thành khuông.

    Các dòng gần nhau (cách nhau tối đa ~2,4 interline) tạo thành một nhóm. Trong mỗi nhóm, tìm lặp lại "lược" 5 dòng
    cách đều interline khớp được nhiều dòng nhất (ít nhất 3); dòng không khớp lược nào (dòng 8va, vạch cường độ, chùm
    nối dài) bị bỏ. Cách này chịu được thiếu 1-2 dòng kẻ và nét ngang lạ nằm giữa hai khuông.
    """
    groups: list[list[float]] = [[lines[0]]]
    for y in lines[1:]:
        if y - groups[-1][-1] <= 2.4 * interline:
            groups[-1].append(y)
        else:
            groups.append([y])

    staves: list[Staff] = []
    for group in groups:
        for top, matched in _fit_combs(group, interline):
            staff = _make_staff(top, matched, interline, horizontal)
            if staff is not None:
                staves.append(staff)
    staves.sort(key=lambda s: s.top)
    return staves


def _fit_combs(group: list[float], interline: float) -> list[tuple[float, int]]:
    """Các lược 5 dòng trong một nhóm: ``[(y_dòng_trên_cùng, số_dòng_khớp)]``."""
    tolerance = max(1.5, 0.3 * interline)
    remaining = list(group)
    combs: list[tuple[float, int]] = []
    while len(remaining) >= 3:
        best: Optional[tuple[int, float, list[float]]] = None
        for anchor in remaining:
            for k in range(5):
                top = anchor - k * interline
                matched = [
                    y for y in remaining if any(abs(y - (top + j * interline)) <= tolerance for j in range(5))
                ]
                if best is None or len(matched) > best[0]:
                    best = (len(matched), top, matched)
        if best is None or best[0] < 3:
            break
        _, top, matched = best
        # Chỉnh lại vị trí lược theo trung bình các dòng khớp
        offsets = [y - round((y - top) / interline) * interline for y in matched]
        top = float(np.mean(offsets))
        combs.append((top, len(matched)))
        span_end = top + 4 * interline + tolerance
        remaining = [y for y in remaining if not (top - tolerance <= y <= span_end)]
    return combs


def _make_staff(top: float, matched: int, interline: float, horizontal: np.ndarray) -> Optional[Staff]:
    """Dựng khuông từ vị trí dòng trên cùng; mép trái/phải là đoạn mà ít nhất 3 trong 5 dòng kẻ có nét ngang."""
    height = horizontal.shape[0]
    rows = [int(round(top + j * interline)) for j in range(5)]
    if rows[0] < 0 or rows[-1] >= height:
        return None
    hits = np.zeros(horizontal.shape[1], dtype=np.int32)
    for row in rows:
        band = horizontal[max(0, row - 1) : row + 2]
        hits += (band.max(axis=0) > 0).astype(np.int32)
    columns = np.flatnonzero(hits >= 3)
    if columns.size == 0:
        return None
    return Staff(top=rows[0], bottom=rows[-1], left=int(columns[0]), right=int(columns[-1]), lines=matched)


# ====================================================================== hệ khuông


def _vertical_coverage(ink: np.ndarray, x0: int, x1: int, y0: int, y1: int) -> float:
    """Tỉ lệ hàng trong ``[y0, y1)`` có mực ở một cột nào đó trong ``[x0, x1)`` (dùng cho vạch nối và ngoặc)."""
    height, width = ink.shape
    x0, x1 = max(0, x0), min(width, x1)
    y0, y1 = max(0, y0), min(height, y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    region = ink[y0:y1, x0:x1]
    # Vạch dọc: cùng một cột phủ gần hết các hàng; lấy cột tốt nhất
    return float(region.sum(axis=0).max() / (y1 - y0))


def _band_coverage(ink: np.ndarray, x0: int, x1: int, y0: int, y1: int) -> float:
    """Tỉ lệ hàng có mực ở bất kỳ đâu trong dải ``[x0, x1)`` (ngoặc nhọn cong nên không nằm trên một cột)."""
    height, width = ink.shape
    x0, x1 = max(0, x0), min(width, x1)
    y0, y1 = max(0, y0), min(height, y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    return float((ink[y0:y1, x0:x1].max(axis=1) > 0).mean())


def _connected(upper: Staff, lower: Staff, ink: np.ndarray, interline: float) -> bool:
    """Hai khuông liền nhau có vạch dọc nối ở lề trái (vạch hệ) không.

    Dò trong dải bao cả hai mép trái (mép trái đo được có thể lệch vì khóa nhạc, ngoặc che đầu dòng kẻ). Hai hệ khác
    nhau cách nhau bằng khoảng trắng nên không có cột nào phủ kín khoảng giữa; chữ lời ca nằm giữa giọng hát và piano
    cũng không tạo được một cột liền.
    """
    pad = max(2, int(round(interline / 2)))
    x0 = min(upper.left, lower.left) - pad
    x1 = max(upper.left, lower.left) + pad + 1
    return _vertical_coverage(ink, x0, x1, upper.bottom, lower.top + 1) >= _CONNECT_COVERAGE


def _group_systems(staves: list[Staff], ink: np.ndarray, interline: float) -> list[System]:
    """Gom khuông thành hệ theo vạch nối ở lề trái. Trang không có vạch nối nào thì mỗi khuông là một hệ."""
    links = [_connected(a, b, ink, interline) for a, b in zip(staves, staves[1:])]
    systems: list[System] = [System(staves=[staves[0]])]
    for staff, linked in zip(staves[1:], links):
        if linked:
            systems[-1].staves.append(staff)
            systems[-1].connected = True
        else:
            systems.append(System(staves=[staff]))
    return systems


# ====================================================================== vai trò


def _braced(upper: Staff, lower: Staff, ink: np.ndarray, interline: float) -> bool:
    """Có ngoặc (nhọn hoặc vuông) bên trái nối từ khuông trên xuống khuông dưới không."""
    edge = min(upper.left, lower.left)
    x0 = edge - int(round(3.5 * interline))
    x1 = edge - max(2, int(round(interline / 3)))
    if x1 - x0 < 2:
        return False
    return _band_coverage(ink, x0, x1, upper.top, lower.bottom + 1) >= _CONNECT_COVERAGE


def _assign_roles(system: System, ink: np.ndarray, interline: float) -> None:
    """Gán vai trò cho các khuông của hệ (sửa trực tiếp ``system``)."""
    staves = system.staves
    if len(staves) == 1:
        staves[0].role = ROLE_SINGLE
        return
    if len(staves) == 2:
        staves[0].role = staves[1].role = ROLE_PIANO
        return
    braced = [_braced(a, b, ink, interline) for a, b in zip(staves, staves[1:])]
    # Đoạn liên tiếp các cặp có ngoặc; đoạn đúng 2 khuông là ngoặc nhọn piano, dài hơn là ngoặc vuông (hợp xướng)
    piano_at: Optional[int] = None
    index = 0
    while index < len(braced):
        if not braced[index]:
            index += 1
            continue
        end = index
        while end + 1 < len(braced) and braced[end + 1]:
            end += 1
        if end == index:
            piano_at = index  # giữ đoạn dưới cùng
        index = end + 1
    if piano_at is None:
        piano_at = len(staves) - 2  # quy ước: hai khuông dưới cùng là piano
    for position, staff in enumerate(staves):
        staff.role = ROLE_PIANO if position in (piano_at, piano_at + 1) else ROLE_SINGLE
