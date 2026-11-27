"""Xóa chữ (lời ca, tên hợp âm, nhịp độ, tiêu đề) khỏi ảnh trang trước khi đưa vào Transcoda.

Transcoda chỉ được huấn luyện trên bản render Verovio của nhạc piano (không có lời ca, không có hợp âm). Bản thánh ca /
bài hát có 5 dòng lời ca dưới mỗi hệ và tên hợp âm phía trên là ngoài phân phối train: model "lạc chỗ" (lặp lại hệ trước,
đọc hệ chỉ có nốt thành toàn dấu lặng, đoán sai octave). Bước này chỉ XÓA các thành phần liên thông giống chữ; mọi thứ
chạm vào khuông (nốt, thân, dùi, khóa, dấu hóa, vạch nhịp, dấu lặng, luyến...) được giữ nguyên.

Một thành phần liên thông (sau khi bỏ dòng kẻ khuông) bị coi là chữ khi hội đủ:

* nằm hoàn toàn ngoài dải khuông (mở rộng :data:`_BAND_MARGIN` khoảng dòng kẻ mỗi phía);
* không chứa dòng kẻ phụ (nét ngang dài; đầu nốt đặt trên dòng kẻ phụ dính liền nó thành một thành phần);
* không cao quá :data:`_MAX_GLYPH_H` và không rộng quá :data:`_MAX_GLYPH_W` khoảng dòng kẻ (chữ; hai dòng lời ca dính nhau qua dấu thanh vẫn là một khối; luyến dài hơn thì giữ);
* không phải chấm dôi của nốt nằm ngoài khuông (:func:`_augmentation_dots`): chấm nhỏ, gần khuông, có đầu nốt được giữ
  ngay bên trái. Trước đây chấm dôi của nốt Rê/Si giáng dưới khuông bị xóa như dấu chấm của chữ, nên model đọc nốt chấm
  dôi thành nốt thường ("Đời Con Thuộc Về Chúa" mất 4/4 chấm dôi dưới khuông).

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

_DOT_MAX = 0.7
_DOT_MIN_PX = 2
"""Chấm dôi: cao và rộng không quá bấy nhiêu khoảng dòng kẻ (đầu nốt rộng ~1,3), ít nhất 2 px."""

_DOT_REACH = 2.25
"""Tâm chấm dôi cách mép khuông tối đa bấy nhiêu khoảng: nốt La3 (2 dòng kẻ phụ dưới khóa Sol) có chấm cách ~2 khoảng.
Dấu nặng của lời ca nằm dưới chữ, cách khuông xa hơn."""

_DOT_LOOK_LEFT = 1.6
_DOT_LOOK_HALF_H = 0.6
_DOT_HEAD_INK = 0.25
"""Vùng tìm đầu nốt bên trái chấm: rộng 1,6 khoảng, cao ±0,6 khoảng quanh tâm chấm; cần ít nhất 0,25 khoảng² mực của
thành phần được giữ (đầu nốt ~0,8 khoảng²). Chữ bên trái dấu chấm câu đã bị xóa nên không tính."""


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

    for i in _augmentation_dots(labels, stats, erase, layout):
        erase[i] = False
    for i in _tuplet_numbers(labels, stats, erase, layout):
        erase[i] = False

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


def _augmentation_dots(labels: np.ndarray, stats: np.ndarray, erase: np.ndarray, layout: PageLayout) -> list[int]:
    """Các thành phần đang định xóa nhưng thực ra là chấm dôi của nốt ngoài khuông.

    Chấm dôi: nhỏ, gần tròn, tâm cách mép khuông không quá :data:`_DOT_REACH` khoảng và có mực của thành phần được giữ
    (đầu nốt, thân, dòng kẻ phụ) ngay bên trái, cùng độ cao."""
    il = layout.interline
    staves = [(st.top, st.bottom) for sy in layout.systems for st in sy.staves]
    kept = (labels > 0) & ~erase[labels]
    height, width = labels.shape
    found: list[int] = []
    for i in np.flatnonzero(erase):
        x, y, w, h, area = stats[i]
        if not (_DOT_MIN_PX <= w <= _DOT_MAX * il and _DOT_MIN_PX <= h <= _DOT_MAX * il):
            continue
        if area < 0.45 * w * h or not 0.5 <= w / h <= 2.0:
            continue  # nét mảnh (dấu huyền, dấu sắc) hoặc dẹt (gạch nối)
        cy = y + h / 2.0
        if min(max(top - cy, cy - bottom) for top, bottom in staves) > _DOT_REACH * il:
            continue
        x0 = max(0, int(round(x - _DOT_LOOK_LEFT * il)))
        y0 = max(0, int(round(cy - _DOT_LOOK_HALF_H * il)))
        y1 = min(height, int(round(cy + _DOT_LOOK_HALF_H * il)) + 1)
        if x0 >= x or y0 >= y1:
            continue
        if int(kept[y0:y1, x0:x].sum()) >= _DOT_HEAD_INK * il * il:
            found.append(int(i))
    return found


def _tuplet_numbers(labels: np.ndarray, stats: np.ndarray, erase: np.ndarray, layout: PageLayout) -> list[int]:
    """Các thành phần đang định xóa nhưng thực ra là số liên ba/liên sáu ("3", "6") của nhóm nốt.

    Số liên ba nằm ngoài khuông nên trước đây bị xóa như chữ, và model đọc chùm liên ba thành nốt thường ("model đọc mất
    số 3": Ave Maria Gomez gần như mất hết, Giấc Mơ Trưa ô 16, 21). Một thành phần được giữ khi:

    * có dáng một chữ số: cao 0,8–2 khoảng dòng kẻ, rộng 0,35–1,4 khoảng, cao không kém rộng;
    * đứng riêng: không có chữ nào sát bên cùng hàng (khác một từ, hay chữ kèm dấu phẩy) và không nằm trên một dòng lời ca
      (dòng có từ 3 chữ cái thuộc các từ cùng chân chữ);
    * nằm giữa ngoặc liên ba (nét ngang được giữ ở cả hai bên, cùng độ cao) hoặc ngay trên/dưới một dầm nốt chạy qua
      cả hai bên nó.
    """
    il = layout.interline
    staves = [(st.top, st.bottom) for sy in layout.systems for st in sy.staves]
    kept = (labels > 0) & ~erase[labels]
    height, width = labels.shape
    candidates = np.flatnonzero(erase)
    if candidates.size == 0:
        return []
    box = stats[candidates, :4].astype(float)
    x0, y0 = box[:, 0], box[:, 1]
    x1, y1 = x0 + box[:, 2], y0 + box[:, 3]
    # Chữ có chữ khác sát bên cùng hàng (cách < 0,6 khoảng; dấu phẩy bắt đầu ngay chân chữ vẫn tính là cùng hàng)
    gap = np.maximum(x0[None, :] - x1[:, None], x0[:, None] - x1[None, :])
    overlap = np.minimum(y1[:, None], y1[None, :]) - np.maximum(y0[:, None], y0[None, :])
    near = (gap < 0.6 * il) & (overlap > -0.2 * il)
    np.fill_diagonal(near, False)
    wordy = near.any(axis=1)
    found: list[int] = []
    for k, i in enumerate(candidates):
        x, y, w, h = (int(v) for v in box[k])
        if not (0.8 * il <= h <= 2.0 * il and 0.35 * il <= w <= 1.4 * il and h >= w):
            continue
        cy = y + h / 2.0
        if min(max(top - cy, cy - bottom) for top, bottom in staves) > 4.5 * il:
            continue
        if wordy[k]:
            continue
        if int((wordy & (np.abs(y1 - y1[k]) <= 0.3 * il)).sum()) >= 3:
            continue  # cùng chân chữ với dòng lời ca: chữ một âm tiết như "a", "y"
        if _between_bracket(kept, x, y, w, h, il) or _over_beam(kept, x, y, w, h, il, height, width):
            found.append(int(i))
    return found


def _between_bracket(kept: np.ndarray, x: int, y: int, w: int, h: int, il: float) -> bool:
    """Nét được giữ (ngoặc liên ba) ở cả bên trái lẫn bên phải chữ số, cùng độ cao với nó."""
    y0, y1 = max(0, int(y - 0.3 * il)), int(y + h + 0.3 * il)
    reach = int(round(2.5 * il))
    left = kept[y0:y1, max(0, x - reach) : x]
    right = kept[y0:y1, x + w : x + w + reach]
    return _longest_run(left) >= 0.8 * il and _longest_run(right) >= 0.8 * il


def _longest_run(window: np.ndarray) -> int:
    """Đoạn ngang liền dài nhất (số px) trong cửa sổ: nét ngoặc liên ba là nét ngang, chữ cái bên cạnh thì không."""
    best = 0
    for row in window:
        run = 0
        for value in row:
            run = run + 1 if value else 0
            best = max(best, run)
    return best


def _over_beam(kept: np.ndarray, x: int, y: int, w: int, h: int, il: float, height: int, width: int) -> bool:
    """Dầm nốt (nét được giữ) chạy ngang qua ngay dưới hoặc ngay trên chữ số, thò ra cả hai bên nó."""
    side = int(round(il))
    x0, x1 = max(0, x - side), min(width, x + w + side)
    for top, bottom in ((y + h, y + h + 1.8 * il), (y - 1.8 * il, y)):
        band = kept[max(0, int(top)) : min(height, int(bottom)), x0:x1]
        if band.size == 0:
            continue
        columns = band.any(axis=0)
        if columns.all():
            return True
    return False


def _distance_to_bands(y0: float, y1: float, bands: list[tuple[float, float]]) -> float:
    """Khoảng cách dọc từ đoạn ``[y0, y1]`` tới dải khuông gần nhất (<= 0 là chạm/chồng)."""
    best = float("inf")
    for top, bottom in bands:
        gap = max(top - y1, y0 - bottom)
        best = min(best, gap)
    return best
