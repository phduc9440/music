"""Dò vị trí ngang các đầu nốt trên một khuông (chỉ OpenCV) để gắn lời ca vào đúng nốt.

Transcoda sinh ``**kern`` mà không có tọa độ ký hiệu, nên không biết nốt thứ mấy nằm ở đâu trên ảnh. Bước này chỉ cần
**tọa độ x của các lần đánh nốt** trong từng ô (hợp âm = một cột), không cần biết cao độ:

1. Cắt vùng khuông (thêm 3 khoảng dòng kẻ trên/dưới cho dòng kẻ phụ), nhị phân Otsu.
2. Bỏ dòng kẻ khuông (nét ngang dài), nối lại đầu nốt bị dòng kẻ cắt ngang; bỏ thân nốt, vạch nhịp (nét dọc dài).
3. Lấp lỗ nhỏ TRƯỚC khi bỏ dòng kẻ (đầu nốt trắng/tròn thành đặc), mở hình thái bằng ellipse cỡ ~0,8 x 0,6 khoảng dòng kẻ: chỉ đầu nốt còn
   lại (dòng kẻ, chữ, dấu chấm, đường nối, dùi đều mảnh hơn).
4. Thành phần còn lại có bề rộng cỡ đầu nốt -> tâm x; gom các tâm gần nhau (hợp âm, quãng hai) thành một cột.

Kết quả là gợi ý vị trí; bước căn (``align.py``) vẫn chịu được khi số cột khác số lần đánh nốt.
"""

from __future__ import annotations

import cv2
import numpy as np


def notehead_columns(
    gray: np.ndarray,
    top: float,
    bottom: float,
    left: float,
    right: float,
    interline: float,
) -> list[float]:
    """Tâm x (cùng hệ tọa độ với ``gray``) của các cột đầu nốt trên khuông ``[top, bottom]`` trong ``[left, right)``."""
    il = float(interline)
    if il <= 2 or right - left < 2 * il:
        return []
    y0 = max(0, int(top - 3.0 * il))
    y1 = min(gray.shape[0], int(bottom + 3.0 * il))
    x0 = max(0, int(left))
    x1 = min(gray.shape[1], int(right))
    crop = gray[y0:y1, x0:x1]
    if crop.size == 0:
        return []
    # Ảnh nhỏ (khoảng dòng kẻ < 14 px): phóng lên để lỗ của nốt trắng không bị lấp mất khi nhị phân
    factor = max(1.0, 14.0 / il)
    if factor > 1.01:
        crop = cv2.resize(crop, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)
    il_s = il * factor
    _, ink = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Lấp lỗ TRƯỚC khi bỏ dòng kẻ: lỗ của nốt trắng nằm giữa hai dòng kẻ chỉ kín khi dòng kẻ còn nguyên
    ink = _fill_small_holes(ink, max_area=1.2 * il_s * il_s)

    # Dòng kẻ: nét ngang dài; bỏ rồi nối lại phần đầu nốt bị cắt
    long_h = max(5, int(round(2.5 * il_s)))
    lines = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (long_h, 1)))
    no_lines = cv2.subtract(ink, lines)
    thickness = max(1, int(round(0.2 * il_s)))
    no_lines = cv2.morphologyEx(
        no_lines, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 2 * thickness + 1))
    )

    # Thân nốt, vạch nhịp: nét dọc dài và mảnh
    long_v = max(5, int(round(2.2 * il_s)))
    stems = cv2.morphologyEx(no_lines, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, long_v)))
    stems = cv2.subtract(stems, cv2.morphologyEx(stems, cv2.MORPH_OPEN, np.ones((1, max(3, int(0.6 * il_s))), np.uint8)))
    heads = cv2.subtract(no_lines, stems)

    kw = max(3, int(round(0.8 * il_s)))
    kh = max(3, int(round(0.6 * il_s)))
    heads = cv2.morphologyEx(heads, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kw, kh)))

    count, _labels, stats, centroids = cv2.connectedComponentsWithStats(heads, connectivity=8)
    centers: list[float] = []
    for i in range(1, count):
        _x, _y, w, h, area = stats[i]
        if w < 0.8 * il_s or w > 3.2 * il_s or h < 0.55 * il_s or h > 6.5 * il_s:
            continue
        if area < 0.45 * il_s * il_s:
            continue
        if h > 2.5 * il_s and w < 1.1 * il_s:
            continue  # vạch nhịp đậm (vạch kết), không phải đầu nốt
        centers.append(float(centroids[i][0]) / factor + x0)
    # Hai đầu nốt quãng hai đặt lệch nhau ~1 khoảng dòng kẻ vẫn là một lần đánh
    return _cluster(sorted(centers), 1.3 * il)


def header_width(interline: float, key_fifths: int, has_time: bool, first_system: bool = False) -> float:
    """Bề rộng ước lượng của khóa nhạc + hóa biểu + số chỉ nhịp ở đầu hệ (vùng không có đầu nốt)."""
    width = 3.6 + 1.0 * abs(key_fifths) + (2.4 if has_time else 0.0)
    return width * interline


def _fill_small_holes(binary: np.ndarray, max_area: float) -> np.ndarray:
    contours, hierarchy = cv2.findContours(binary.copy(), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return binary
    out = binary.copy()
    for index, contour in enumerate(contours):
        parent = hierarchy[0][index][3]
        if parent >= 0 and cv2.contourArea(contour) <= max_area:
            cv2.drawContours(out, [contour], -1, 255, thickness=cv2.FILLED)
    return out


def _cluster(values: list[float], gap: float) -> list[float]:
    groups: list[list[float]] = []
    for v in values:
        if groups and v - groups[-1][-1] <= gap:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [float(np.mean(g)) for g in groups]
