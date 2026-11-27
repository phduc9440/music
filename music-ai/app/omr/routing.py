"""Kiểm tra số khuông theo bố cục và nhận diện lại theo hệ ("trang ảo") khi Transcoda đọc sai cấu trúc trang.

Vấn đề: Transcoda đôi khi bỏ hẳn một khuông (ví dụ khuông giọng hát) ở cả trang, hoặc tách/gộp spine sai rồi trôi tới cuối
trang (bài báo Transcoda, Mục 5). Khi đó kern trang có số spine khác số khuông thật trên ảnh. Model cũng hay "lạc chỗ" khi
đọc cả trang: đọc lại hệ đã đọc hoặc lặp nguyên một khối ô nhịp, nên kern có nhiều ô hơn ảnh dù đúng số spine. Số ô trên
ảnh đếm bằng vạch nhịp (``app/omr/barlines.py``).

Cách sửa ở đây chỉ dùng chính Transcoda:

1. Bố cục (``app/omr/layout.py``) cho biết mỗi hệ có ``n`` khuông, ``m`` ô nhịp và tọa độ từng hệ.
2. Trang nào có số spine khác ``n``, số ô lệch nhiều so với ảnh (:func:`measures_off`) hoặc bị bỏ vì không đọc được nốt
   thì được nhận diện lại: mỗi hệ cắt ra, đặt lên
   một trang trắng 1050x1485 **giữ nguyên tỉ lệ** (trang 1 hệ vẫn đúng phân phối lúc train: 1-6 hệ, căn trên).
3. Hệ "sai" = sai số spine, khác số ô trên ảnh, hoặc (với hệ có cả giọng lẫn piano) có ô nhịp lệch trường độ. Hệ sai thì đọc RIÊNG từng
   nhóm khuông (khuông giọng một ảnh, grand staff piano một ảnh; cả hai là loại đầu vào model làm tốt, mỗi lần đọc greedy
   và ngắn) rồi ghép theo ô nhịp và thời điểm bằng :mod:`app.omr.combine`.
3b. Vẫn sai thì mới thử beam search (mặc định 3, như bài báo; chậm gấp ~3 lần một lần greedy nên để sau cùng).
   Hệ chỉ có một loại khuông thì không có bước đọc riêng, thử beam khi sai số spine hoặc sai số ô.
4. Ghép kern các hệ thành kern trang bằng chính :func:`merge.merge_pages` (kế thừa khóa/nhịp, gộp spine tách, bỏ vạch
   nhịp trùng), rồi chọn giữa kết quả cả trang và kết quả theo hệ bằng điểm cấu trúc.

Mọi hàm ở đây không phụ thuộc model (model được truyền vào qua hàm ``recognize``) nên test được bằng bản giả.
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Callable, Optional

import numpy as np

from app.omr import combine, measure_map, merge, pitch_check
from app.omr.layout import ROLE_PIANO, ROLE_SINGLE, PageLayout
from app.omr.preprocess import TARGET_H, TARGET_W

log = logging.getLogger(__name__)

MODE_OFF = "off"
MODE_FALLBACK = "fallback"
MODE_ALWAYS = "always"
MODES = (MODE_OFF, MODE_FALLBACK, MODE_ALWAYS)

SOURCE_PAGE = "page"
SOURCE_SYSTEMS = "systems"

_TOP_MARGIN_PX = 24
"""Lề trên của trang ảo (bản render lúc train có lề 1,5-5% bề rộng trang, tức ~16-52 px)."""

MEASURE_TOLERANCE = 1
"""Bộ dò vạch nhịp có thể sót/thừa một vạch (vạch sát cờ móc đơn, dấu nối), nên khi XẾP HẠNG ứng viên, lệch 0 hay 1 ô so
với ảnh được coi như nhau; lặp do model "lạc chỗ" thường thừa từ 2 ô trở lên."""

_MAX_PAD_INTERLINES = 6.0
"""Lấy thêm phía trên/dưới hệ tối đa bấy nhiêu khoảng dòng kẻ (dòng kẻ phụ, dấu, lời ca), không quá nửa khoảng trống
tới hệ bên cạnh."""


VOICE_CHORD_MEASURES = 2
"""Trang giọng hát + piano có từ bấy nhiêu ô mà khuông giọng chứa hợp âm thì được nhận diện lại theo hệ (một ô lẻ có thể là
nốt chia bè/ossia hợp lệ)."""


@dataclass
class Score:
    """Điểm cấu trúc của một ứng viên kern trang; so sánh như tuple, lớn hơn là tốt hơn."""

    spines_ok: float
    """Tỉ lệ phần trang đọc đúng số khuông: 1.0/0.0 cho kết quả cả trang, tỉ lệ hệ đúng cho kết quả theo hệ (tính
    TRƯỚC khi độn cột, nên hệ phải độn không được tính là đúng)."""

    measure_ratio: float
    """Tỉ lệ ô nhịp có tổng trường độ khớp số chỉ nhịp (1.0 nếu không kiểm được ô nào)."""

    measures: int
    """Số ô nhịp của ứng viên. Không so trực tiếp (dài hơn không có nghĩa là tốt hơn), chỉ so độ lệch với ảnh."""

    measure_gap: int = 0
    """``|số ô - số ô trên ảnh|``; 0 khi không biết số ô trên ảnh."""

    voice_ok: float = 1.0
    """Tỉ lệ ô mà khuông giọng (bản giọng hát + piano) là một giai điệu, không chứa hợp âm. Model hay chép hợp âm tay phải
    piano sang spine giọng hoặc gộp giọng với tay phải; khi đó số spine và số ô vẫn có thể đúng nên cần tiêu chí riêng."""

    def key(self) -> tuple:
        """Đúng số spine trước, rồi khuông giọng là giai điệu, rồi gần số ô trên ảnh (lệch <= :data:`MEASURE_TOLERANCE`
        coi như đúng), rồi tỉ lệ ô nhịp đúng trường độ."""
        gap = max(0, self.measure_gap - MEASURE_TOLERANCE)
        return (round(self.spines_ok, 3), round(self.voice_ok, 3), -gap, round(self.measure_ratio, 3))


@dataclass
class PageRouting:
    """Kết quả định tuyến một trang, ghi vào ``result_data.routing.pages`` để gỡ lỗi và trình bày."""

    page: int
    expected: int
    primary_spines: Optional[int]
    expected_measures: Optional[int] = None
    """Số ô trên ảnh (None nếu vạch nhịp không đủ tin)."""

    primary_measures: Optional[int] = None
    """Số ô của kết quả cả trang."""

    chosen_measures: Optional[int] = None
    """Số ô của kết quả được chọn."""

    chosen: str = SOURCE_PAGE
    systems: int = 0
    systems_ok: int = 0
    retries: int = 0
    role_split: int = 0
    """Số hệ phải đọc riêng từng nhóm khuông (giọng/piano) rồi ghép."""

    skipped: Optional[str] = None
    """Lý do không nhận diện lại (hết thời gian...), None nếu đã chạy."""

    primary_score: Optional[tuple] = None
    systems_score: Optional[tuple] = None
    kern_path: Optional[str] = None
    millis: int = 0

    def to_dict(self) -> dict:
        data = {
            "page": self.page,
            "expectedStaves": self.expected,
            "primarySpines": self.primary_spines,
            "expectedMeasures": self.expected_measures,
            "primaryMeasures": self.primary_measures,
            "chosenMeasures": self.chosen_measures,
            "chosen": self.chosen,
            "systems": self.systems,
            "systemsOk": self.systems_ok,
            "retries": self.retries,
            "roleSplit": self.role_split,
            "millis": self.millis,
        }
        if self.skipped:
            data["skipped"] = self.skipped
        if self.kern_path:
            data["kernPath"] = self.kern_path
        return data


@dataclass
class SystemResult:
    """Kern (đã làm sạch) của một hệ cùng số lần đã thử."""

    page: Optional[merge.PageKern]
    attempts: int
    method: str = "system"
    """``system``: đọc cả hệ; ``roles``: đọc riêng từng nhóm khuông rồi ghép."""

    warnings: list[str] = field(default_factory=list)


# ====================================================================== kiểm tra


def expected_staves(layout: Optional[PageLayout]) -> Optional[int]:
    """Số spine trang phải có theo bố cục, hoặc None nếu bố cục không đủ tin cậy để đòi hỏi. Trang hỗn hợp
    (:attr:`PageLayout.mixed`): số khuông của hệ nhiều khuông nhất, vì hệ ít khuông được độn khuông dấu lặng."""
    if layout is None or not layout.confident:
        return None
    return layout.max_staves if layout.mixed else layout.staff_count


def expected_measures(layout: Optional[PageLayout]) -> Optional[int]:
    """Số ô nhịp của trang đếm trên ảnh, hoặc None nếu bố cục/vạch nhịp không đủ tin cậy để đòi hỏi."""
    if layout is None or not layout.confident:
        return None
    return layout.measure_count


def page_measures(page: Optional[merge.PageKern]) -> Optional[int]:
    """Số ô nhịp của một kết quả (trang hoặc hệ), cùng cách đếm với bản ghép."""
    return merge.count_measures(page.body) if page is not None else None


def measures_off(found: Optional[int], expected: Optional[int]) -> bool:
    """Số ô của cả trang lệch ảnh đủ nhiều để chắc là model đọc sai (sinh lặp, đọc lại hệ trước, bỏ hệ), không phải do
    bộ dò vạch nhịp sót một vạch. Thừa ô: lệch từ 2 ô và từ 10% trở lên. Thiếu ô: từ 1 ô, vì bộ dò hầu như không đếm
    thừa (đã loại thân nốt, đầu nốt) nên kern ít ô hơn ảnh thường là model bỏ sót ô (vd. ô cuối trang)."""
    if found is None or expected is None:
        return False
    if found < expected:
        return True
    return found - expected >= max(2, math.ceil(0.1 * expected))


def page_measure_limit(expected: Optional[int]) -> Optional[int]:
    """Số vạch nhịp tối đa cho phép model sinh khi đọc cả trang có ``expected`` ô trên ảnh (None = không giới hạn).

    Dư hẳn ngưỡng :func:`measures_off` để trang bị dừng sớm chắc chắn được nhận diện lại theo hệ, còn trang
    bình thường (lệch một-hai ô do bộ dò) không bao giờ bị cắt."""
    if not expected:
        return None
    return expected + max(4, math.ceil(0.2 * expected))


def system_measure_limit(layout: PageLayout, index: int) -> Optional[int]:
    """Như :func:`page_measure_limit` cho trang ảo một hệ: số ô của hệ + 3, chỉ khi hệ có số ô tin được."""
    if not layout.confident or index >= len(layout.systems):
        return None
    system = layout.systems[index]
    if not system.bars_closed or not system.measures:
        return None
    return system.measures + 3


def trim_loops(
    page: Optional[merge.PageKern], expected: Optional[int], where: str
) -> tuple[Optional[merge.PageKern], list[str]]:
    """Bước cuối khi mọi lần đọc vẫn thừa ô: bỏ khối ô nhịp lặp liền nhau giống hệt (:func:`merge.drop_repeated_blocks`)
    cho tới khi bằng số ô trên ảnh. Không thừa quá :data:`MEASURE_TOLERANCE` hoặc không có khối lặp thì giữ nguyên."""
    found = page_measures(page)
    if page is None or found is None or expected is None or found - expected <= MEASURE_TOLERANCE:
        return page, []
    fixed, removed = merge.drop_repeated_blocks(page, expected)
    if not removed:
        return page, []
    return fixed, [f"{where}: model đọc lặp, đã bỏ {removed} ô nhịp lặp lại giống hệt (ảnh có {expected} ô)"]


def needs_fallback(
    mode: str,
    layout: Optional[PageLayout],
    page: Optional[merge.PageKern],
    check_measures: bool = False,
    check_bars: bool = True,
) -> bool:
    """Trang có cần nhận diện lại theo hệ không.

    ``check_measures``: trang đúng số spine nhưng có ô nhịp lệch trường độ cũng được nhận diện lại (tốn thêm thời gian
    vì phải đọc lại mọi hệ của trang, nên mặc định tắt). ``check_bars``: trang có số ô lệch số ô đếm trên ảnh
    (:func:`measures_off`) cũng được nhận diện lại."""
    expected = expected_staves(layout)
    if mode == MODE_OFF or expected is None:
        return False
    if mode == MODE_ALWAYS or (layout is not None and layout.mixed):
        return True  # trang hỗn hợp: đọc cả trang không thể ra hệ 1 khuông xen hệ 2 khuông, luôn đọc theo hệ
    if page is None or page.spines != expected:
        return True
    if check_bars and measures_off(page_measures(page), expected_measures(layout)):
        return True
    voice = page_voice_columns(layout)
    if voice and voice_chord_measures(page.body, page.spines, voice)[1] >= VOICE_CHORD_MEASURES:
        return True  # model chép hợp âm piano sang khuông giọng: đọc lại theo hệ (và đọc riêng giọng/piano)
    return check_measures and score_page(page, expected).measure_ratio < 1.0


def score_page(
    page: Optional[merge.PageKern],
    expected: int,
    spines_ok: Optional[float] = None,
    lenient_first: bool = True,
    lenient_last: bool = True,
    measures_expected: Optional[int] = None,
    voice: tuple[int, ...] = (),
) -> Score:
    """Chấm một ứng viên: đúng số spine trước, rồi gần số ô trên ảnh, rồi tỉ lệ ô nhịp đúng trường độ.

    ``voice``: chỉ số cột kern của khuông giọng (:func:`voice_columns`); chỉ chấm khi ứng viên đúng số spine.

    ``spines_ok`` None thì tính từ số spine của ``page``; kết quả theo hệ truyền tỉ lệ hệ đúng của riêng nó.
    ``lenient_first``/``lenient_last``: nới ô nhịp đầu/cuối (lấy đà, cuối bài); hệ ở giữa trang kiểm chặt cả hai đầu.
    ``measures_expected``: số ô trên ảnh (None = không biết, không chấm theo số ô).
    """
    if page is None:
        gap = measures_expected or 0
        return Score(spines_ok=0.0, measure_ratio=0.0, measures=0, measure_gap=gap)
    if spines_ok is None:
        spines_ok = 1.0 if page.spines == expected else 0.0
    count = merge.count_measures(page.body)
    gap = abs(count - measures_expected) if measures_expected is not None else 0
    voice_ok = 1.0
    if voice and page.spines == expected:
        checked_voice, chorded = voice_chord_measures(page.body, page.spines, voice)
        voice_ok = 1.0 - chorded / checked_voice if checked_voice else 1.0
    try:
        single = merge.merge_pages([page])
        checked, bad = merge.measure_stats(single, lenient_first, lenient_last)
        measures = merge.extract_metadata(single).measure_count
    except Exception:  # noqa: BLE001 - kern hỏng tới mức không ghép được thì coi như điểm thấp nhất
        return Score(spines_ok=spines_ok, measure_ratio=0.0, measures=count, measure_gap=gap, voice_ok=voice_ok)
    ratio = (checked - bad) / checked if checked else 1.0
    return Score(spines_ok=spines_ok, measure_ratio=ratio, measures=measures, measure_gap=gap, voice_ok=voice_ok)


def voice_columns(staves) -> tuple[int, ...]:
    """Chỉ số cột kern (cột 0 là khuông dưới cùng) của khuông giọng trong một hệ có cả giọng và piano; rỗng nếu hệ không
    có piano (bản một khuông có thể có hợp âm hai nốt hợp lệ nên không kiểm)."""
    roles = [staff.role for staff in staves]
    if ROLE_PIANO not in roles:
        return ()
    count = len(staves)
    return tuple(count - 1 - index for index, role in enumerate(roles) if role == ROLE_SINGLE)


def page_voice_columns(layout: Optional[PageLayout]) -> tuple[int, ...]:
    """:func:`voice_columns` của trang khi mọi hệ cùng cấu trúc (bố cục tin cậy); rỗng nếu không."""
    if layout is None or not layout.confident or not layout.systems:
        return ()
    first = [staff.role for staff in layout.systems[0].staves]
    if any([staff.role for staff in system.staves] != first for system in layout.systems):
        return ()
    return voice_columns(layout.systems[0].staves)


def voice_chord_measures(body: list[str], spines: int, columns: tuple[int, ...]) -> tuple[int, int]:
    """``(số ô có nốt ở khuông giọng, số ô trong đó khuông giọng có hợp âm)``. Bỏ qua dòng đang tách/gộp spine."""
    checked = chorded = 0
    has_notes = has_chord = False
    for line in body + ["="]:
        if merge.is_barline(line):
            checked += has_notes
            chorded += has_chord
            has_notes = has_chord = False
            continue
        if not merge.is_data_line(line):
            continue
        fields = line.split(merge.TAB)
        if len(fields) != spines:
            continue
        for column in columns:
            if column >= spines:
                continue
            pitched = [t for t in fields[column].split(" ") if t and t != "." and "r" not in t and "q" not in t]
            if pitched:
                has_notes = True
            if len(pitched) >= 2:
                has_chord = True
    return checked, chorded


# ====================================================================== trang ảo


def system_bands(layout: PageLayout) -> list[tuple[int, int]]:
    """Khoảng ``[y0, y1)`` cần cắt cho từng hệ: rộng hơn hệ để không mất dòng kẻ phụ, dấu, lời ca, nhưng không lấn quá
    nửa khoảng trống tới hệ bên cạnh."""
    bands: list[tuple[int, int]] = []
    pad_max = _MAX_PAD_INTERLINES * layout.interline
    systems = layout.systems
    for index, system in enumerate(systems):
        above = system.top - (systems[index - 1].bottom if index > 0 else 0)
        below = (systems[index + 1].top if index + 1 < len(systems) else layout.height) - system.bottom
        pad_top = min(pad_max, above / 2 if index > 0 else above)
        pad_bottom = min(pad_max, below / 2 if index + 1 < len(systems) else below)
        y0 = max(0, math.ceil(system.top - pad_top))
        y1 = min(layout.height, math.floor(system.bottom + pad_bottom) + 1)
        bands.append((y0, y1))
    return bands


def role_groups(system) -> list[tuple[int, int, str]]:
    """Nhóm khuông của một hệ từ trên xuống: ``(khuông_đầu, khuông_cuối, vai_trò)``. Hai khuông piano liền nhau là một
    nhóm (grand staff); mỗi khuông đơn là một nhóm."""
    staves = system.staves
    groups: list[tuple[int, int, str]] = []
    index = 0
    while index < len(staves):
        role = staves[index].role
        if role == ROLE_PIANO and index + 1 < len(staves) and staves[index + 1].role == ROLE_PIANO:
            groups.append((index, index + 1, role))
            index += 2
        else:
            groups.append((index, index, role))
            index += 1
    return groups


def role_bands(layout: PageLayout, system_index: int) -> list[tuple[int, tuple[int, int], str]]:
    """Dải ảnh của từng nhóm khuông trong một hệ, từ trên xuống: ``(số_khuông, (y0, y1), vai_trò)``.

    Mép ngoài lấy theo dải của cả hệ; mép giữa hai nhóm lấy tối đa nửa khoảng trống (lời ca nằm dưới khuông giọng nên
    dải giọng được chừa phía dưới, nhưng không lấn sang khuông piano).
    """
    system = layout.systems[system_index]
    outer = system_bands(layout)[system_index]
    pad_max = _MAX_PAD_INTERLINES * layout.interline
    staves = system.staves
    bands: list[tuple[int, tuple[int, int], str]] = []
    for first, last, role in role_groups(system):
        top, bottom = staves[first].top, staves[last].bottom
        y0 = outer[0] if first == 0 else top - min(pad_max, (top - staves[first - 1].bottom) / 2)
        y1 = outer[1] if last == len(staves) - 1 else bottom + min(pad_max, (staves[last + 1].top - bottom) / 2)
        bands.append((last - first + 1, (max(0, math.ceil(y0)), min(layout.height, math.floor(y1) + 1)), role))
    return bands


def virtual_page(gray: np.ndarray, band: tuple[int, int]) -> np.ndarray:
    """Đặt dải ảnh của một hệ lên trang trắng 1050x1485, căn trên, giữ nguyên tỉ lệ và vị trí ngang.

    Không phóng to: khoảng cách dòng kẻ trên ảnh trang (~8 px) đã ở mức lớn nhất của dữ liệu train, phóng to sẽ ra ngoài
    phân phối. Ảnh trang đã đúng 1050 px chiều rộng nên chỉ cần dán.
    """
    y0, y1 = band
    strip = gray[y0:y1, :TARGET_W]
    canvas = np.full((TARGET_H, TARGET_W), 255, dtype=np.uint8)
    top = _TOP_MARGIN_PX if strip.shape[0] + _TOP_MARGIN_PX <= TARGET_H else 0
    height = min(strip.shape[0], TARGET_H - top)
    canvas[top : top + height, : strip.shape[1]] = strip[:height]
    return canvas


_CONTEXT_GAP_INTERLINES = 4.0
"""Khoảng trắng giữa hệ đầu và hệ cần đọc trên trang ngữ cảnh (gần khoảng cách hệ của bản render lúc train)."""


def context_index(layout: PageLayout, index: int) -> Optional[int]:
    """Hệ dùng làm ngữ cảnh cho hệ ``index``: hệ đầu trang, hoặc với trang hỗn hợp là hệ đầu tiên cùng số khuông (ghép
    hệ 2 khuông trên hệ 1 khuông thì model đọc ra số spine lẫn lộn). None nếu không có hệ nào phù hợp đứng trước."""
    if index <= 0 or index >= len(layout.systems):
        return None
    if not layout.mixed:
        return 0
    count = len(layout.systems[index].staves)
    return next((k for k in range(index) if len(layout.systems[k].staves) == count), None)


def context_page(gray: np.ndarray, layout: PageLayout, index: int) -> Optional[np.ndarray]:
    """Trang ảo gồm hệ đầu trang (có khóa nhạc, điệu, SỐ CHỈ NHỊP) đặt trên hệ ``index``.

    Hệ ở giữa bài không có số chỉ nhịp nên cắt riêng ra thì model thường đọc thành toàn dấu lặng (``1r``), vì ở dữ liệu
    train mọi trang đều bắt đầu bằng số chỉ nhịp. Kèm hệ đầu cho nó đủ ngữ cảnh; kết quả của hệ đầu bị bỏ sau khi đọc
    (:func:`read_with_context`). None nếu hai hệ không vừa một trang. Trang hỗn hợp dùng :func:`context_index`.
    """
    context = context_index(layout, index)
    if context is None:
        return None
    bands = system_bands(layout)
    first = gray[bands[context][0] : bands[context][1], :TARGET_W]
    target = gray[bands[index][0] : bands[index][1], :TARGET_W]
    gap = int(round(_CONTEXT_GAP_INTERLINES * layout.interline))
    if _TOP_MARGIN_PX + first.shape[0] + gap + target.shape[0] > TARGET_H:
        return None
    canvas = np.full((TARGET_H, TARGET_W), 255, dtype=np.uint8)
    y = _TOP_MARGIN_PX
    canvas[y : y + first.shape[0], : first.shape[1]] = first
    y += first.shape[0] + gap
    canvas[y : y + target.shape[0], : target.shape[1]] = target
    return canvas


def _is_empty(page: Optional[merge.PageKern]) -> bool:
    """Không có nốt nào có cao độ (chỉ dấu lặng): dấu hiệu model không đọc được hệ."""
    return page is None or not any(merge.has_pitched_note(line) for line in page.body)


def read_with_context(
    number: int,
    index: int,
    gray: np.ndarray,
    layout: PageLayout,
    recognize: "Recognize",
    beams: Optional[int],
    max_repeat: int,
) -> Optional[merge.PageKern]:
    """Đọc hệ ``index`` kèm hệ đầu phía trên rồi bỏ phần của hệ đầu (số ô đếm trên ảnh). None nếu không làm được
    (bố cục không tin cậy, hệ đầu không kết thúc bằng vạch nhịp, hoặc kết quả có ít ô hơn hệ đầu)."""
    context = context_index(layout, index)
    if context is None:
        return None
    first = layout.systems[context]
    if not (layout.confident and first.bars_closed and first.measures):
        return None
    image = context_page(gray, layout, index)
    if image is None:
        return None
    page = _read(number, index, image, recognize, beams, max_repeat)
    if page is None:
        return None
    chunks = merge.split_measures(page.body)
    if len(chunks) <= first.measures:
        return None
    # Dòng diễn giải (khóa, dấu hóa, số chỉ nhịp) nằm ở ô đầu: giữ lại như các lần đọc hệ riêng
    interpretations = [line for line in chunks[0] if line.startswith("*")]
    body = interpretations + [line for chunk in chunks[first.measures :] for line in chunk]
    return merge.PageKern(number=page.number, header=page.header, body=body)


# ====================================================================== ghép kern các hệ


def fit_spines(page: merge.PageKern, target: int, where: str) -> tuple[merge.PageKern, list[str]]:
    """Đưa kern một hệ về đúng ``target`` spine (thêm/bỏ cột bên phải, tức khuông trên cùng) kèm cảnh báo.

    Chỉ dùng khi mọi lần thử đều sai số spine: chỗ bị độn khu trú trong đúng một hệ và được ghi rõ.
    """
    if page.spines == target:
        return page, []
    if page.spines < target:
        message = (
            f"{where}: chỉ đọc được {page.spines}/{target} khuông kể cả khi nhận diện lại riêng hệ này, "
            f"đã thêm {target - page.spines} khuông trống ở trên cùng"
        )
    else:
        message = f"{where}: đọc ra {page.spines} khuông, nhiều hơn {target} trên ảnh, đã bỏ bớt khuông trên cùng"
    return merge.fit_page_spines(page, target), [message]


def pad_to_page(page: merge.PageKern, target: int) -> merge.PageKern:
    """Độn hệ ít khuông của trang hỗn hợp về ``target`` spine bằng khuông dấu lặng: hệ khóa Fa (bè trầm) thêm khuông ở
    trên, còn lại (giai điệu phần lời ca) thêm khuông ở dưới để giai điệu vẫn nằm ở khuông trên như hệ 2 khuông."""
    if page.spines >= target:
        return page
    clefs = [token for line in page.body if line.startswith("*clef") for token in line.split(merge.TAB)]
    bass = bool(clefs) and all(token.startswith("*clefF") for token in clefs)
    return merge.pad_page(page, target, below=not bass)


def stitch_systems(number: int, pages: list[merge.PageKern]) -> merge.PageKern:
    """Ghép kern các hệ (đã cùng số spine, theo thứ tự) thành kern một trang."""
    chunks = [merge.PageKern(number=number, header=p.header, body=list(p.body)) for p in pages]
    result = merge.merge_pages(chunks)
    return merge.PageKern(number=number, header=result.header, body=list(result.lines))


# ====================================================================== nhận diện lại một trang


Recognize = Callable[..., tuple[str, bool]]
"""``recognize(ảnh_trang_ảo, chỉ_số_hệ, num_beams)`` -> ``(kern_thô, truncated)``; ``num_beams`` None = mặc định. Ảnh cắt
riêng một nhóm khuông được gọi thêm đối số thứ tư ``tag`` (ví dụ ``r1-single``) để bên gọi đặt tên file gỡ lỗi."""


def recognize_by_systems(
    number: int,
    gray: np.ndarray,
    layout: PageLayout,
    recognize: Recognize,
    retry_beams: int,
    can_retry: Callable[[], bool],
    max_repeat: int = 24,
    meter: Optional[str] = None,
    use_bars: bool = True,
    whole: Optional[merge.PageKern] = None,
    roles_first: bool = False,
) -> tuple[Optional[merge.PageKern], list[SystemResult], list[str]]:
    """Nhận diện lại trang ``number`` theo từng hệ. Trả ``(kern_trang, kết_quả_từng_hệ, cảnh_báo)``.

    ``kern_trang`` là None nếu không hệ nào đọc được. ``can_retry()`` False thì không thử lại bằng beam search (hết thời
    gian). ``meter``: token ``*M4/4`` đã biết của bài (hệ ở giữa bài không tự có dòng này). ``use_bars``: dùng số ô
    từng hệ đếm trên ảnh để chấm và thử lại. ``whole``: kết quả đọc cả trang trước đó (nếu có), dùng để lấy lại các hệ
    cuối mà nó đọc đúng hơn (:func:`graft_whole_tail`). ``roles_first``: hệ giọng hát + piano đọc riêng từng nhóm khuông
    trước (xem ``Settings.routing_roles_first``). Hủy job hoặc hết hạn từ ``recognize`` được để nguyên cho bên gọi xử lý.
    """
    warnings: list[str] = []
    results: list[SystemResult] = []
    judges: list[Judge] = []
    heads = image_heads(gray, layout) if use_bars else None
    for index, (system, band) in enumerate(zip(layout.systems, system_bands(layout))):
        judge = _judge(number, index, layout, meter, use_bars, heads)
        judges.append(judge)
        result = _recognize_one(
            number, index, gray, layout, band, recognize, retry_beams, can_retry, max_repeat, judge, roles_first
        )
        results.append(result)
        meter = page_meter(result.page) or meter  # hệ sau được chấm theo số chỉ nhịp đã thấy
    graft_whole_tail(results, layout, judges, whole)

    fixed: list[merge.PageKern] = []
    for index, (system, result) in enumerate(zip(layout.systems, results), start=1):
        warnings.extend(result.warnings)
        if result.page is None:
            warnings.append(f"Trang {number}, hệ {index}: không đọc được nốt nào khi nhận diện lại theo hệ")
            continue
        got = page_measures(result.page)
        wanted = _judge(number, index - 1, layout, None, use_bars).measures
        if got is not None and wanted is not None and abs(got - wanted) > MEASURE_TOLERANCE:
            warnings.append(
                f"Trang {number}, hệ {index}: đọc ra {got} ô nhịp trong khi ảnh có {wanted} ô, cần kiểm tra lại hệ này"
            )
        page, notes = fit_spines(result.page, len(system.staves), f"Trang {number}, hệ {index}")
        warnings.extend(notes)
        if layout.mixed:
            page = pad_to_page(page, layout.max_staves or page.spines)
        fixed.append(page)
    if not fixed:
        return None, results, warnings
    try:
        return stitch_systems(number, fixed), results, warnings
    except merge.MergeSpineMismatch:
        warnings.append(f"Trang {number}: không ghép được kern các hệ")
        return None, results, warnings


@dataclass(frozen=True)
class Judge:
    """Cách chấm ô nhịp của một hệ: nới ô đầu/cuối hay không, và số chỉ nhịp đã biết."""

    lenient_first: bool
    lenient_last: bool
    meter: Optional[str] = None
    """Token ``*M4/4`` lấy từ trang/các hệ trước. Trang ảo một hệ thường không có dòng số chỉ nhịp (nó nằm ở đầu bài) nên
    nếu không bổ sung thì ô nhịp của hệ không kiểm được (bị bỏ qua), lỗi trường độ lọt qua."""

    measures: Optional[int] = None
    """Số ô của hệ đếm trên ảnh; None nếu không biết (bố cục không tin cậy, hệ không kết thúc bằng vạch nhịp)."""

    voice: tuple[int, ...] = ()
    """Cột kern của khuông giọng (:func:`voice_columns`), để chấm khuông giọng có phải giai điệu không."""

    edge_heads: tuple[Optional[int], Optional[int]] = (None, None)
    """Số đầu nốt trên ảnh của ô đầu và ô cuối hệ (None nếu không đếm được). Ô đầu/cuối hệ ngắn hơn số chỉ nhịp mà đọc
    đủ đúng số đầu nốt đó thường là một nửa của ô bị vạch nhịp chia đôi ở chỗ xuống dòng (cuối phiên khúc, đầu điệp
    khúc), không phải ô đọc thiếu nốt: được nới như ô lấy đà, khỏi tốn lượt đọc lại (đọc lại còn có thể "lấp" ô đó cho đủ
    nhịp bằng nốt bịa). Khi ghép cả bài, :func:`merge.incomplete_roles` mới xác nhận hai nửa có bù nhau không."""


def page_meter(page: Optional[merge.PageKern]) -> Optional[str]:
    """Token ``*M n/d`` đầu tiên của kern, hoặc None."""
    if page is None:
        return None
    for line in page.body:
        if line.startswith("*"):
            for token in line.split(merge.TAB):
                if re.match(r"^\*M\d+/\d+", token):
                    return token
    return None


def _judge(
    number: int,
    index: int,
    layout: PageLayout,
    meter: Optional[str],
    use_bars: bool = True,
    heads: Optional[list[tuple[int, int]]] = None,
) -> Judge:
    """Chỉ nới ô nhịp đầu bài (hệ đầu trang 1, có thể là ô lấy đà) và ô cuối trang (hệ cuối, có thể là ô cuối bài). Mọi
    ô khác phải đủ trường độ, trừ ô đầu/cuối hệ đọc đủ số đầu nốt trên ảnh (:attr:`Judge.edge_heads`). Số ô trên ảnh chỉ
    dùng khi hệ kết thúc bằng vạch nhịp. ``heads``: ``(chỉ số hệ, số đầu nốt)`` từng ô trên ảnh
    (:func:`measure_map.image_measure_heads`)."""
    system = layout.systems[index]
    trusted = use_bars and layout.confident and system.bars_closed and system.measures
    measures = system.measures if trusted else None
    edge: tuple[Optional[int], Optional[int]] = (None, None)
    own = [count for at, count in heads or [] if at == index]
    if trusted and own and len(own) == measures:
        edge = (own[0], own[-1])
    return Judge(
        number == 1 and index == 0,
        index == len(layout.systems) - 1,
        meter,
        measures,
        voice_columns(system.staves),
        edge,
    )


def _note_count(chunk: list[str]) -> int:
    """Số nốt có cao độ (tính từng nốt trong hợp âm, không tính dấu lặng) của một ô, như :func:`measure_map.kern_note_counts`."""
    return sum(
        1
        for line in chunk
        if merge.is_data_line(line)
        for cell in line.split(merge.TAB)
        for token in cell.split(" ")
        if token and token != "." and "r" not in token and any(c in "abcdefgABCDEFG" for c in token)
    )


def _edges_lenient(page: Optional[merge.PageKern], judge: Judge) -> tuple[bool, bool]:
    """``(nới ô đầu, nới ô cuối)`` của ``page`` theo :class:`Judge`, thêm bằng chứng đầu nốt trên ảnh ở hai đầu hệ."""
    first, last = judge.lenient_first, judge.lenient_last
    if page is None or judge.edge_heads == (None, None):
        return first, last
    chunks = [chunk for chunk in merge.split_measures(page.body) if any(merge.is_data_line(ln) for ln in chunk)]
    if not chunks or len(chunks) != judge.measures:
        return first, last  # số ô lệch ảnh: không biết ô đầu/cuối kern ứng với ô nào trên ảnh
    head_first, head_last = judge.edge_heads
    first = first or (head_first is not None and head_first > 0 and _note_count(chunks[0]) == head_first)
    last = last or (head_last is not None and head_last > 0 and _note_count(chunks[-1]) == head_last)
    return first, last


def image_heads(gray: np.ndarray, layout: PageLayout) -> Optional[list[tuple[int, int]]]:
    """``(chỉ số hệ, số đầu nốt)`` từng ô trên ảnh của trang; None nếu bố cục chưa đếm chắc vạch nhịp hoặc dò lỗi."""
    if not layout.bars_confident:
        return None
    try:
        heads = pitch_check.find_heads(gray, layout)
        return measure_map.image_measure_heads(layout, [(h.system, h.x) for h in heads])
    except Exception:  # noqa: BLE001 - chỉ là bằng chứng thêm để chấm, không được làm hỏng việc nhận diện
        log.exception("Không đếm được đầu nốt từng ô để chấm ô đầu/cuối hệ")
        return None


def _with_meter(page: Optional[merge.PageKern], meter: Optional[str]) -> Optional[merge.PageKern]:
    """Bản dùng để chấm điểm: thêm dòng số chỉ nhịp nếu kern chưa có (không dùng cho kết quả xuất)."""
    if page is None or meter is None or page_meter(page) is not None:
        return page
    row = merge.TAB.join([meter] * page.spines)
    return merge.PageKern(number=page.number, header=page.header, body=[row] + list(page.body))


def _score(page: Optional[merge.PageKern], target: int, judge: Judge) -> Score:
    lenient_first, lenient_last = _edges_lenient(page, judge)
    return score_page(
        _with_meter(page, judge.meter),
        target,
        lenient_first=lenient_first,
        lenient_last=lenient_last,
        measures_expected=judge.measures,
        voice=judge.voice if page is not None and page.spines == target else (),
    )


def _is_good(page: Optional[merge.PageKern], target: int, judge: Judge) -> bool:
    """Đúng số spine, đúng số ô trên ảnh (nếu biết) và mọi ô nhịp kiểm được đều đủ trường độ."""
    if page is None or page.spines != target:
        return False
    score = _score(page, target, judge)
    return score.measure_gap == 0 and score.measure_ratio >= 1.0 and score.voice_ok >= 1.0


def _rank(page: Optional[merge.PageKern], target: int, judge: Judge, lossy: bool = False) -> tuple:
    """Khoá so sánh ứng viên: (đúng spine, gần số ô trên ảnh, tỉ lệ ô nhịp đúng, không phải thay ô nhịp bằng dấu
    lặng)."""
    return _score(page, target, judge).key() + (0 if lossy else 1,)


def _read(
    number: int,
    index: int,
    image: np.ndarray,
    recognize: Recognize,
    beams: Optional[int],
    max_repeat: int,
    tag: Optional[str] = None,
    meter: Optional[str] = None,
) -> Optional[merge.PageKern]:
    """Một lần đọc model rồi làm sạch kern; None nếu không đọc được nốt nào. ``meter``: số chỉ nhịp đã biết của bài. Ảnh riêng một nhóm khuông (``tag`` của
    :func:`_recognize_by_roles`, ``r<k>-<vai trò>``) được phép toàn dấu lặng (khuông giọng im trong đoạn dạo đầu)."""
    text, truncated = recognize(image, index, beams) if tag is None else recognize(image, index, beams, tag)
    rests_ok = bool(tag) and re.match(r"^r\d+-", tag or "") is not None
    page, _ = merge.clean_page(
        number, text, max_repeat=max_repeat, truncated=truncated, allow_rests_only=rests_ok, meter=meter
    )
    return page


def _recognize_one(
    number: int,
    index: int,
    gray: np.ndarray,
    layout: PageLayout,
    band: tuple[int, int],
    recognize: Recognize,
    retry_beams: int,
    can_retry: Callable[[], bool],
    max_repeat: int,
    judge: Judge,
    roles_first: bool = False,
) -> SystemResult:
    """Nhận diện một hệ theo thứ tự rẻ trước: đọc cả hệ (greedy) -> đọc riêng giọng/piano (2 lần greedy ngắn) -> beam.

    ``roles_first`` và hệ có cả giọng lẫn piano: đọc riêng giọng/piano trước; ghép đúng số spine, không mất nốt và đúng số ô
    trên ảnh (nếu biết) thì dừng luôn, không đọc cả hệ 3 khuông (thường sai số spine) và không beam search."""
    system = layout.systems[index]
    target = len(system.staves)
    image = virtual_page(gray, band)
    measures = judge.measures
    where = f"Trang {number}, hệ {index + 1}"
    if len(role_groups(system)) <= 1:
        result = _recognize_system(
            number, index, image, target, recognize, retry_beams, can_retry, max_repeat, measures=measures,
            voice=judge.voice, meter=judge.meter,
        )
        result.page, notes = trim_loops(result.page, measures, where)
        result.warnings.extend(notes)
        if index > 0 and (_is_empty(result.page) or not _is_good(result.page, target, judge)) and can_retry():
            with_context = read_with_context(number, index, gray, layout, recognize, None, max_repeat)
            result.attempts += 1
            if with_context is not None and not _is_empty(with_context):
                with_context, notes = trim_loops(with_context, measures, where)
                if _is_empty(result.page) or _rank(with_context, target, judge) > _rank(result.page, target, judge):
                    result.page = with_context
                    result.warnings.append(
                        f"{where}: hệ không có số chỉ nhịp nên đã đọc kèm hệ đầu trang để model có đủ ngữ cảnh"
                    )
                    result.warnings.extend(notes)
        if can_retry():
            fixed, reads = reread_by_measures(
                number, index, gray, layout, band, result.page, recognize, can_retry, max_repeat, judge
            )
            result.attempts += reads
            if fixed is not result.page:
                result.warnings.append(
                    f"{where}: đã đọc lại riêng từng ô nhịp sai bằng cách cắt ảnh tới từng vạch nhịp (nên đối chiếu lại với ảnh)"
                )
            result.page = fixed
        return result

    early: Optional[SystemResult] = None
    if roles_first and judge.voice:
        early = _recognize_by_roles(
            number, index, gray, layout, recognize, retry_beams, can_retry, max_repeat, measures=measures,
            meter=judge.meter,
        )
        early_lossy = any(combine.REPLACED_MARK in w for w in early.warnings)
        if _roles_enough(early.page, early_lossy, target, judge):
            early.method = "roles"
            early.page, notes = trim_loops(early.page, measures, where)
            early.warnings.extend(notes)
            return early

    best = _recognize_system(
        number, index, image, target, recognize, 0, can_retry, max_repeat, measures=measures, voice=judge.voice,
        meter=judge.meter,
    )
    attempts = best.attempts
    warnings: list[str] = []
    lossy = False
    """Kết quả đang giữ có ô nhịp bị thay bằng dấu lặng (mất nốt) nên chưa được coi là tốt."""

    if early is not None:  # đã đọc riêng nhưng chưa đạt: vẫn là một ứng viên, khỏi đọc riêng lần nữa
        attempts += early.attempts
        warnings.extend(early.warnings)
        early_lossy = any(combine.REPLACED_MARK in w for w in early.warnings)
        if early.page is not None and _accept_roles(best.page, early.page, early_lossy, target, judge):
            best = SystemResult(early.page, attempts, "roles", warnings)
            lossy = early_lossy
    elif not _is_good(best.page, target, judge) and can_retry():
        roles = _recognize_by_roles(
            number, index, gray, layout, recognize, retry_beams, can_retry, max_repeat, measures=measures,
            meter=judge.meter,
        )
        attempts += roles.attempts
        warnings.extend(roles.warnings)
        roles_lossy = any(combine.REPLACED_MARK in w for w in roles.warnings)
        if roles.page is not None and _accept_roles(best.page, roles.page, roles_lossy, target, judge):
            best = SystemResult(roles.page, attempts, "roles", warnings)
            lossy = roles_lossy
    if (lossy or not _is_good(best.page, target, judge)) and retry_beams > 1 and can_retry():
        beam = _read(number, index, image, recognize, retry_beams, max_repeat, meter=judge.meter)
        attempts += 1
        if beam is not None and _rank(beam, target, judge) > _rank(best.page, target, judge, lossy):
            best = SystemResult(beam, attempts, "system", warnings)
    best.page, notes = trim_loops(best.page, measures, where)
    warnings.extend(notes)
    best.attempts = attempts
    best.warnings = warnings
    return best


def _roles_enough(page: Optional[merge.PageKern], lossy: bool, target: int, judge: Judge) -> bool:
    """Kết quả đọc riêng giọng/piano đủ tốt để không cần đọc cả hệ: đúng số spine, không ô nào bị thay bằng dấu lặng,
    khuông giọng không có hợp âm và đúng số ô trên ảnh (nếu biết). Ô lệch trường độ vẫn được nhận (sẽ bị gắn cờ): đọc cả
    hệ 3 khuông hiếm khi tốt hơn."""
    if page is None or page.spines != target or lossy:
        return False
    score = _score(page, target, judge)
    return score.measure_gap == 0 and score.voice_ok >= 1.0


_MAX_MEASURE_READS = 12
"""Hệ có nhiều ô hơn mức này thì không đọc lại từng ô (tốn quá nhiều lượt chạy model)."""

_BAR_PAD_PX = 3
"""Lấy thêm bấy nhiêu px sau tọa độ vạch nhịp để ảnh cắt còn nguyên nét vạch."""


def _chunk_total(chunk: list[str]) -> Fraction:
    """Tổng trường độ (nốt tròn) của một ô nhịp một khuông."""
    total = Fraction(0)
    for line in chunk:
        if merge.is_data_line(line):
            duration = merge.token_duration(line.split(merge.TAB)[0])
            if duration is not None:
                total += duration
    return total


def _chunk_ok(chunk: list[str], meter: Fraction, lenient: bool) -> bool:
    """Ô nhịp đủ trường độ; ``lenient`` (ô lấy đà/ô cuối bài) chỉ cần không dài hơn số chỉ nhịp."""
    total = _chunk_total(chunk)
    if total <= 0:
        return False
    return total <= meter if lenient else total == meter


def _prefix_image(gray: np.ndarray, band: tuple[int, int], right_x: int) -> np.ndarray:
    """Trang ảo chỉ chứa hệ từ đầu hệ (khóa nhạc, dấu hóa, số chỉ nhịp) tới hết vạch nhịp ``right_x``."""
    y0, y1 = band
    width = min(TARGET_W, gray.shape[1], int(right_x) + _BAR_PAD_PX)
    strip = np.full((y1 - y0, TARGET_W), 255, dtype=np.uint8)
    strip[:, :width] = gray[y0:y1, :width]
    return virtual_page(strip, (0, y1 - y0))


def reread_by_measures(
    number: int,
    index: int,
    gray: np.ndarray,
    layout: PageLayout,
    band: tuple[int, int],
    page: Optional[merge.PageKern],
    recognize: Recognize,
    can_retry: Callable[[], bool],
    max_repeat: int,
    judge: Judge,
) -> tuple[Optional[merge.PageKern], int]:
    """Đọc lại riêng từng ô nhịp sai của một hệ một khuông. Trả ``(kern, số lần gọi model)``; không đổi gì thì trả lại
    đúng ``page``.

    Model hay làm rơi nốt (nhất là nốt lặp lại ngay sau vạch nhịp) hoặc bỏ vạch nhịp khi đọc cả hệ. Biết tọa độ từng
    vạch nhịp trên ảnh nên với ô thứ ``k`` ta cắt ảnh từ đầu hệ tới vạch nhịp thứ ``k`` rồi cho model đọc: kết quả phải
    có đúng ``k`` ô, và ô cuối của nó thay cho ô ``k`` của bản cũ nếu đủ trường độ. Ô nào bản cũ đã đủ trường độ (và
    còn thẳng hàng với ảnh) thì giữ nguyên, nên chỉ tốn lượt chạy cho ô sai. Kết quả chỉ được nhận khi điểm xếp hạng cao
    hơn bản cũ.
    """
    system = layout.systems[index]
    count = system.measures
    if (
        page is None
        or page.spines != 1
        or not count
        or not judge.measures
        or not system.bars_closed
        or len(system.barlines) != count
        or count > _MAX_MEASURE_READS
        or _is_good(page, 1, judge)
    ):
        return page, 0
    meter_token = page_meter(page) or judge.meter
    meter = merge._meter_fraction(meter_token) if meter_token else None
    if meter is None:
        return page, 0

    original = merge.split_measures(page.body)
    aligned = len(original) == count and page_measures(page) == count

    first_ok, last_ok = _edges_lenient(page, judge) if aligned else (judge.lenient_first, judge.lenient_last)

    def lenient(position: int) -> bool:
        return (first_ok and position == 1) or (last_ok and position == count)

    first_bad = next(
        (k for k in range(1, min(len(original), count) + 1) if not _chunk_ok(original[k - 1], meter, lenient(k))),
        1 if not aligned else count + 1,
    )
    chunks: list[list[str]] = [list(original[k - 1]) for k in range(1, first_bad) if k <= len(original)]
    reads = 0
    for k in range(first_bad, count + 1):
        keep = original[k - 1] if aligned and k <= len(original) else None
        if keep is not None and _chunk_ok(keep, meter, lenient(k)):
            chunks.append(list(keep))
            continue
        if not can_retry():
            return page, reads
        prefix = _read(number, index, _prefix_image(gray, band, system.barlines[k - 1]), recognize, None, max_repeat, f"m{k}")
        reads += 1
        pieces = merge.split_measures(prefix.body) if prefix is not None and page_measures(prefix) == k else None
        if pieces is not None and len(pieces) >= k:
            chunks.append(list(pieces[k - 1]))
        elif keep is not None:
            chunks.append(list(keep))
        else:
            return page, reads  # không biết lấy ô nào thay cho ô k: bỏ cả lượt sửa
    body = [line for chunk in chunks for line in chunk]
    candidate = merge.PageKern(number=page.number, header=page.header, body=body)
    new, old = _score(candidate, 1, judge), _score(page, 1, judge)
    # So độ lệch ô THẲNG (không nới MEASURE_TOLERANCE như xếp hạng): đọc lại từng ô chính là để tìm đúng số ô trên ảnh
    if (new.measure_gap, -new.measure_ratio) < (old.measure_gap, -old.measure_ratio):
        return candidate, reads
    return page, reads


def graft_whole_tail(
    results: list[SystemResult], layout: PageLayout, judges: list[Judge], whole: Optional[merge.PageKern]
) -> None:
    """Lấy lại từ kết quả đọc cả trang những hệ cuối mà nó đọc đúng còn đọc theo hệ thì sai (sửa ``results`` tại chỗ).

    Model đọc cả trang đôi khi "lạc" ở đầu trang (lặp lại hệ đầu) nhưng các hệ cuối lại đúng, trong khi đọc riêng từng hệ
    lại làm rơi nốt hoặc ô nhịp. Biết số ô từng hệ trên ảnh nên chia từ CUỐI trang lên: ``c`` ô cuối là hệ cuối,
    ``c'`` ô trước đó là hệ kế... Mỗi đoạn chỉ được dùng khi nó tự đủ ``c`` ô, đúng trường độ và tốt hơn kết quả theo hệ
    (đoạn nào không đạt thì dừng, vì từ đó trở lên không còn chắc thẳng hàng).
    """
    if whole is None or len(results) != len(layout.systems) or not results:
        return
    counts = [j.measures for j in judges]
    if any(c is None for c in counts):
        return
    if any(len(sy.staves) != whole.spines for sy in layout.systems):
        return
    if any(line.startswith("*") and len(line.split(merge.TAB)) != whole.spines for line in whole.body):
        return  # có tách/gộp spine: không chia theo ô nhịp được
    chunks = merge.split_measures(whole.body)
    if len(chunks) != merge.count_measures(whole.body):
        return
    # Kết quả cả trang chứa các ô lặp giống hệt nhau liền kề là model chạy "lạc" (runaway): phần cuối của nó cũng không
    # đáng tin, chỉ lấy khi lỗi của nó khu trú ở đầu trang (lặp lại hệ đầu bằng bản đọc hơi khác, không giống hệt)
    if merge.drop_repeated_blocks(whole, sum(int(c) for c in counts))[1]:  # type: ignore[arg-type]
        return
    end = len(chunks)
    for index in range(len(results) - 1, -1, -1):
        count = int(counts[index])  # type: ignore[arg-type]
        if count <= 0 or end - count < 0:
            return
        body = [line for chunk in chunks[end - count : end] for line in chunk]
        piece = merge.PageKern(number=whole.number, header=whole.header, body=body)
        target = len(layout.systems[index].staves)
        judge = judges[index]
        if not _is_good(piece, target, judge):
            return
        current = results[index].page
        better = current is None
        if not better:
            new, old = _score(piece, target, judge), _score(current, target, judge)
            # So độ lệch ô thẳng (không nới MEASURE_TOLERANCE): đoạn này đã đúng số ô trên ảnh
            better = _rank(piece, target, judge) > _rank(current, target, judge) or (
                new.measure_gap,
                -new.measure_ratio,
            ) < (old.measure_gap, -old.measure_ratio)
        if better:
            results[index] = SystemResult(
                piece,
                results[index].attempts,
                "whole",
                results[index].warnings
                + [f"Trang {whole.number}, hệ {index + 1}: dùng phần kết quả đọc cả trang vì đúng số ô và trường độ hơn"],
            )
        end -= count


def _accept_roles(
    whole: Optional[merge.PageKern], roles: merge.PageKern, lossy: bool, target: int, judge: Judge
) -> bool:
    """Kết quả đọc riêng có tốt hơn kết quả đọc cả hệ không. Khi cả hệ đã đúng số spine (chỉ lệch ô nhịp) thì không nhận
    kết quả phải thay ô nhịp bằng dấu lặng, vì mất nốt còn tệ hơn lệch trường độ."""
    if lossy and whole is not None and whole.spines == target:
        return False
    return _rank(roles, target, judge, lossy) > _rank(whole, target, judge)


def _recognize_system(
    number: int,
    index: int,
    image: np.ndarray,
    target: int,
    recognize: Recognize,
    retry_beams: int,
    can_retry: Callable[[], bool],
    max_repeat: int,
    tag: Optional[str] = None,
    measures: Optional[int] = None,
    voice: tuple[int, ...] = (),
    meter: Optional[str] = None,
) -> SystemResult:
    """Nhận diện một hệ; sai số spine hoặc khác số ô trên ảnh (``measures``, None = không biết) thì thử lại bằng beam
    search (nếu bật và còn thời gian). Giữ lần thử điểm cao nhất. ``voice``: cột khuông giọng (:func:`voice_columns`)."""
    attempts: list[tuple[Optional[int], Optional[merge.PageKern]]] = []
    beam_plan: list[Optional[int]] = [None]
    if retry_beams > 1:
        beam_plan.append(retry_beams)
    for beams in beam_plan:
        if attempts and not can_retry():
            break
        page = _read(number, index, image, recognize, beams, max_repeat, tag, meter)
        if page is not None and page.spines > target:
            page = merge.collapse_duplicate_spines(page, target) or page
        attempts.append((beams, page))
        if (
            page is not None
            and page.spines == target
            and (measures is None or page_measures(page) == measures)
            and (not voice or voice_chord_measures(page.body, page.spines, voice)[1] == 0)
        ):
            break
    best = max(attempts, key=lambda item: score_page(item[1], target, measures_expected=measures, voice=voice).key())
    return SystemResult(page=best[1], attempts=len(attempts))


def _recognize_by_roles(
    number: int,
    index: int,
    gray: np.ndarray,
    layout: PageLayout,
    recognize: Recognize,
    retry_beams: int,
    can_retry: Callable[[], bool],
    max_repeat: int,
    measures: Optional[int] = None,
    meter: Optional[str] = None,
) -> SystemResult:
    """Đọc riêng từng nhóm khuông của hệ ``index`` rồi ghép. ``page`` None kèm cảnh báo lý do nếu không được.
    ``measures``: số ô của hệ trên ảnh (mỗi nhóm khuông cũng phải có chừng ấy ô)."""
    where = f"Trang {number}, hệ {index + 1}"
    groups = role_bands(layout, index)
    streams: list[merge.PageKern] = []
    attempts = 0
    # Thứ tự cột kern là khuông dưới lên trên: đọc nhóm dưới cùng (piano) trước
    for position in range(len(groups) - 1, -1, -1):
        width, band, role = groups[position]
        if streams and not can_retry():
            return SystemResult(None, attempts, "roles", [f"{where}: hết thời gian khi đọc riêng từng khuông"])
        tag = f"r{position + 1}-{role.lower()}"
        sub = _recognize_system(
            number,
            index,
            virtual_page(gray, band),
            width,
            recognize,
            retry_beams,
            can_retry,
            max_repeat,
            tag,
            measures=measures,
            meter=meter,
        )
        attempts += sub.attempts
        if sub.page is None or sub.page.spines != width:
            got = sub.page.spines if sub.page is not None else 0
            return SystemResult(
                None, attempts, "roles", [f"{where}: đọc riêng nhóm khuông {role} ra {got} spine, cần {width}"]
            )
        streams.append(sub.page)
    try:
        page, notes = combine.combine_streams(streams, number)
    except combine.CombineError as exc:
        return SystemResult(None, attempts, "roles", [f"{where}: không ghép được khuông đọc riêng ({exc})"])
    notes = [f"{where}: đã đọc riêng từng nhóm khuông (giọng/piano) rồi ghép"] + [f"{where}: {n}" for n in notes]
    return SystemResult(page, attempts, "roles", notes)


def choose(
    primary: Optional[merge.PageKern],
    systems: Optional[merge.PageKern],
    expected: int,
    systems_ok: float,
    measures: Optional[int] = None,
    voice: tuple[int, ...] = (),
) -> tuple[str, Optional[merge.PageKern], tuple, tuple]:
    """Chọn giữa kết quả cả trang và kết quả theo hệ (``systems_ok`` = tỉ lệ hệ đọc đúng số khuông, ``measures`` = số ô
    của trang trên ảnh hoặc None).

    Kết quả theo hệ không có hệ nào đúng thì chỉ dùng khi lượt chính không đọc được gì. Hòa điểm thì giữ kết quả cả
    trang (đường cũ, đã được kiểm chứng nhiều hơn).
    """
    primary_score = score_page(primary, expected, measures_expected=measures, voice=voice).key()
    systems_score = score_page(systems, expected, spines_ok=systems_ok, measures_expected=measures, voice=voice).key()
    usable = systems is not None and (systems_ok > 0 or primary is None)
    if usable and systems_score > primary_score:
        return SOURCE_SYSTEMS, systems, primary_score, systems_score
    return SOURCE_PAGE, primary, primary_score, systems_score
