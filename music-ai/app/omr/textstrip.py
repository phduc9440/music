"""Xóa chữ (lời ca, tên hợp âm, nhịp độ, tiêu đề) khỏi ảnh trang trước khi đưa vào Transcoda.

Transcoda chỉ được huấn luyện trên bản render Verovio của nhạc piano (không có lời ca, không có hợp âm). Bản thánh ca /
bài hát có 5 dòng lời ca dưới mỗi hệ và tên hợp âm phía trên là ngoài phân phối train: model "lạc chỗ" (lặp lại hệ trước,
đọc hệ chỉ có nốt thành toàn dấu lặng, đoán sai octave). Bước này chỉ XÓA các thành phần liên thông giống chữ; mọi thứ
chạm vào khuông (nốt, thân, dùi, khóa, dấu hóa, vạch nhịp, dấu lặng, luyến...) được giữ nguyên.

Một thành phần liên thông (sau khi bỏ dòng kẻ khuông) bị coi là chữ khi hội đủ:

* nằm hoàn toàn ngoài dải khuông (mở rộng :data:`_BAND_MARGIN` khoảng dòng kẻ mỗi phía);
* không chứa dòng kẻ phụ (nét ngang dài; đầu nốt đặt trên dòng kẻ phụ dính liền nó thành một thành phần);
* không cao quá :data:`_MAX_GLYPH_H` và không rộng quá :data:`_MAX_GLYPH_W` khoảng dòng kẻ (chữ; hai dòng lời ca dính nhau qua dấu thanh vẫn là một khối; luyến dài hơn thì giữ).

Không đủ tin cậy (không dò được khuông) thì trả ảnh nguyên vẹn. Tắt bằng ``OMR_STRIP_TEXT=0``.
"""

from __future__ import annotations

import cv2
import numpy as np

from app.omr.layout import PageLayout, analyze_layout

_BAND_MARGIN = 0.3
"""Dải khuông rộng thêm bấy nhiêu khoảng dòng kẻ mỗi phía (đầu nốt dưới dòng kẻ cuối chạm dải này; nhỏ hơn thì ngoằn luyến, dấu hóa lệch khỏi khuông bị xóa nhầm. Tên hợp âm sát khuông có thể còn sót, không sao)."""

_MAX_GLYPH_H = 8.0
_MAX_GLYPH_W = 7.0
"""Thành phần cao/rộng hơn (theo khoảng dòng kẻ) là nét dài như luyến, dấu nhấn dài, không phải chữ."""

_LEDGER_MIN_W = 2.0
_LEDGER_REACH = 4.5
"""Dòng kẻ phụ: nét ngang dài từ 2 khoảng dòng kẻ (đầu nốt rộng ~1,3, dòng kẻ phụ dài hơn mỗi bên ~0,4; gạch ngang của chữ
T, H... ngắn hơn), cách dải khuông tối đa 4,5 khoảng. Chỉ cần cho nốt tròn/trắng không có thân; nốt có thân đã dính vào
thân tới khuông nên thuộc thành phần chạm khuông."""

_LEDGER_MAX_H = 1.7
"""Thành phần "đầu nốt + dòng kẻ phụ" thấp hơn bấy nhiêu khoảng; cao hơn là khối chữ chứa nét ngang."""


def strip_text(gray: np.ndarray, layout: PageLayout | None = None) -> tuple[np.ndarray, int]:
    """Trả ``(ảnh đã xóa chữ, số thành phần bị xóa)``. Không đổi ảnh gốc."""
    mask, count = text_mask(gray, layout)
    if count == 0:
        return gray, 0
    out = gray.copy()
    out[mask] = 255
    return out, count


def text_mask(gray: np.ndarray, layout: PageLayout | None = None) -> tuple[np.ndarray, int]:
    """Mặt nạ (bool, cùng kích thước ảnh) các pixel chữ ngoài khuông và số thành phần chữ.

    :func:`strip_text` xóa đúng các pixel này khỏi ảnh trước khi đưa vào Transcoda.
    """
    empty = np.zeros(gray.shape, dtype=bool)
    layout = layout or analyze_layout(gray)
    if not layout.systems or layout.interline <= 0:
        return empty, 0
    il = layout.interline

    background = float(np.percentile(gray, 90))
    ink = (gray < min(200.0, background - 40)).astype(np.uint8)
    pieces = ink.copy()

    # Bỏ dòng kẻ khuông để chữ dính dòng kẻ phụ/gạch nối vẫn tách được; chỉ bỏ pixel dòng kẻ không có mực cả hai phía
    width = ink.shape[1]
    horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, width // 40), 1)))
    reach = max(2, int(round(0.4 * il)))
    above = np.roll(ink, reach, axis=0)
    below = np.roll(ink, -reach, axis=0)
    bands = [(st.top - _BAND_MARGIN * il, st.bottom + _BAND_MARGIN * il) for sy in layout.systems for st in sy.staves]
    in_band = np.zeros(ink.shape[0], dtype=bool)  # chỉ bỏ dòng kẻ của khuông; dòng kẻ phụ phải còn dính đầu nốt
    for top, bottom in bands:
        in_band[max(0, int(top)) : int(bottom) + 1] = True
    pieces[(horizontal > 0) & in_band[:, None] & ~((above > 0) & (below > 0))] = 0

    count, labels, stats, _ = cv2.connectedComponentsWithStats(pieces, connectivity=8)

    # Dòng kẻ phụ: nét ngang dài >= _LEDGER_MIN_W khoảng dòng kẻ. Đầu nốt đặt trên dòng kẻ phụ dính liền với nó thành MỘT
    # thành phần, nên cả thành phần được giữ (không so vị trí với chữ ở gần: lời ca ngay dưới nốt thấp vẫn bị xóa).
    long_run = cv2.morphologyEx(
        pieces, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, int(round(_LEDGER_MIN_W * il))), 1))
    )
    has_ledger = np.zeros(count, dtype=bool)
    has_ledger[np.unique(labels[long_run > 0])] = True

    erase = np.zeros(count, dtype=bool)
    for i in range(1, count):
        x, y, w, h, _area = stats[i]
        if _distance_to_bands(y, y + h, bands) <= 0:
            continue  # chạm dải khuông: nốt, thân, khóa, vạch nhịp...
        if h > _MAX_GLYPH_H * il or w > _MAX_GLYPH_W * il:
            continue
        if has_ledger[i] and h <= _LEDGER_MAX_H * il and _distance_to_bands(y, y + h, bands) <= _LEDGER_REACH * il:
            continue
        erase[i] = True

    if not erase.any():
        return empty, 0
    mask = erase[labels]
    # Nới 1 px để xóa cả viền xám khử răng cưa quanh chữ
    mask = cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    # Không đụng pixel nằm trong dải khuông (dòng kẻ, nốt)
    for top, bottom in bands:
        mask[max(0, int(top)) : int(bottom) + 1, :] = False
    return mask, int(erase.sum())


_ABOVE_NEAR = 0.6
_ABOVE_FAR = 5.0
"""Dải tìm chữ phía trên khuông đầu mỗi hệ, tính theo khoảng dòng kẻ: tên hợp âm, chỉ số nhịp độ nằm cách khuông 1-4
khoảng; tiêu đề bài ở xa hơn nên không tính."""

_ABOVE_MIN_H = 0.9
"""Chữ cao ít nhất bấy nhiêu khoảng dòng kẻ (dấu chấm, dấu nhấn nhỏ hơn thì bỏ qua)."""

_ABOVE_MIN_PIECES = 2
"""Trang có từ bấy nhiêu khối chữ phía trên khuông thì tính là "có chữ trên khuông" (một chữ lẻ có thể là vết bẩn)."""


def text_above_staves(gray: np.ndarray, layout: PageLayout | None = None) -> int:
    """Số khối chữ ngay phía trên khuông đầu mỗi hệ (tên hợp âm, chỉ số nhịp độ, số ngón...) theo cùng tiêu chí "giống
    chữ" của :func:`text_mask`. Tên hợp âm dính vào thân nốt thì không đếm được, nên chỉ cần vài khối là đủ biết bản gốc có
    chữ trên khuông mà OMR không đọc (OMR-13). Không dò được khuông thì trả 0."""
    layout = layout or analyze_layout(gray)
    if not layout.systems or layout.interline <= 0:
        return 0
    mask, count = text_mask(gray, layout)
    if count == 0:
        return 0
    il = layout.interline
    n, _labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    pieces = 0
    for system in layout.systems:
        top = system.staves[0].top
        y_min, y_max = top - _ABOVE_FAR * il, top - _ABOVE_NEAR * il
        for i in range(1, n):
            x, y, w, h, _area = stats[i]
            if h < _ABOVE_MIN_H * il or y < y_min or y + h > y_max:
                continue
            if x + w < system.left or x > system.right:
                continue
            pieces += 1
    return pieces


def has_text_above_staves(gray: np.ndarray, layout: PageLayout | None = None) -> bool:
    return text_above_staves(gray, layout) >= _ABOVE_MIN_PIECES


def _distance_to_bands(y0: float, y1: float, bands: list[tuple[float, float]]) -> float:
    """Khoảng cách dọc từ đoạn ``[y0, y1]`` tới dải khuông gần nhất (<= 0 là chạm/chồng)."""
    best = float("inf")
    for top, bottom in bands:
        gap = max(top - y1, y0 - bottom)
        best = min(best, gap)
    return best
