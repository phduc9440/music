"""Kiểm tra số khuông theo bố cục và nhận diện lại theo hệ ("trang ảo") khi Transcoda đọc sai cấu trúc trang.

Vấn đề: Transcoda đôi khi bỏ hẳn một khuông (ví dụ khuông giọng hát) ở cả trang, hoặc tách/gộp spine sai rồi trôi tới cuối
trang (bài báo Transcoda, Mục 5). Khi đó kern trang có số spine khác số khuông thật trên ảnh.

Cách sửa ở đây chỉ dùng chính Transcoda:

1. Bố cục (``app/omr/layout.py``) cho biết mỗi hệ có ``n`` khuông và tọa độ từng hệ.
2. Trang nào có số spine khác ``n`` (hoặc bị bỏ vì không đọc được nốt) thì được nhận diện lại: mỗi hệ cắt ra, đặt lên
   một trang trắng 1050x1485 **giữ nguyên tỉ lệ** (trang 1 hệ vẫn đúng phân phối lúc train: 1-6 hệ, căn trên).
3. Hệ "sai" = sai số spine, hoặc (với hệ có cả giọng lẫn piano) có ô nhịp lệch trường độ. Hệ sai thì đọc RIÊNG từng
   nhóm khuông (khuông giọng một ảnh, grand staff piano một ảnh; cả hai là loại đầu vào model làm tốt, mỗi lần đọc greedy
   và ngắn) rồi ghép theo ô nhịp và thời điểm bằng :mod:`app.omr.combine`.
3b. Vẫn sai thì mới thử beam search (mặc định 3, như bài báo; chậm gấp ~3 lần một lần greedy nên để sau cùng).
   Hệ chỉ có một loại khuông thì không có bước đọc riêng, thử beam khi sai số spine như trước.
4. Ghép kern các hệ thành kern trang bằng chính :func:`merge.merge_pages` (kế thừa khóa/nhịp, gộp spine tách, bỏ vạch
   nhịp trùng), rồi chọn giữa kết quả cả trang và kết quả theo hệ bằng điểm cấu trúc.

Mọi hàm ở đây không phụ thuộc model (model được truyền vào qua hàm ``recognize``) nên test được bằng bản giả.
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np

from app.omr import combine, merge
from app.omr.layout import ROLE_PIANO, PageLayout
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

_MAX_PAD_INTERLINES = 6.0
"""Lấy thêm phía trên/dưới hệ tối đa bấy nhiêu khoảng dòng kẻ (dòng kẻ phụ, dấu, lời ca), không quá nửa khoảng trống
tới hệ bên cạnh."""


@dataclass
class Score:
    """Điểm cấu trúc của một ứng viên kern trang; so sánh như tuple, lớn hơn là tốt hơn."""

    spines_ok: float
    """Tỉ lệ phần trang đọc đúng số khuông: 1.0/0.0 cho kết quả cả trang, tỉ lệ hệ đúng cho kết quả theo hệ (tính
    TRƯỚC khi độn cột, nên hệ phải độn không được tính là đúng)."""

    measure_ratio: float
    """Tỉ lệ ô nhịp có tổng trường độ khớp số chỉ nhịp (1.0 nếu không kiểm được ô nào)."""

    measures: int
    """Chỉ để báo cáo; không dùng để so sánh vì đầu ra dài hơn (kể cả do sinh thừa) không có nghĩa là tốt hơn."""

    def key(self) -> tuple:
        return (round(self.spines_ok, 3), round(self.measure_ratio, 3))


@dataclass
class PageRouting:
    """Kết quả định tuyến một trang, ghi vào ``result_data.routing.pages`` để gỡ lỗi và trình bày."""

    page: int
    expected: int
    primary_spines: Optional[int]
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
    """Số spine trang phải có theo bố cục, hoặc None nếu bố cục không đủ tin cậy để đòi hỏi."""
    if layout is None or not layout.confident:
        return None
    return layout.staff_count


def needs_fallback(
    mode: str, layout: Optional[PageLayout], page: Optional[merge.PageKern], check_measures: bool = False
) -> bool:
    """Trang có cần nhận diện lại theo hệ không.

    ``check_measures``: trang đúng số spine nhưng có ô nhịp lệch trường độ cũng được nhận diện lại (tốn thêm thời gian
    vì phải đọc lại mọi hệ của trang, nên mặc định tắt)."""
    expected = expected_staves(layout)
    if mode == MODE_OFF or expected is None:
        return False
    if mode == MODE_ALWAYS:
        return True
    if page is None or page.spines != expected:
        return True
    return check_measures and score_page(page, expected).measure_ratio < 1.0


def score_page(
    page: Optional[merge.PageKern],
    expected: int,
    spines_ok: Optional[float] = None,
    lenient_first: bool = True,
    lenient_last: bool = True,
) -> Score:
    """Chấm một ứng viên: đúng số spine trước, rồi tỉ lệ ô nhịp đúng trường độ.

    ``spines_ok`` None thì tính từ số spine của ``page``; kết quả theo hệ truyền tỉ lệ hệ đúng của riêng nó.
    ``lenient_first``/``lenient_last``: nới ô nhịp đầu/cuối (lấy đà, cuối bài); hệ ở giữa trang kiểm chặt cả hai đầu.
    """
    if page is None:
        return Score(spines_ok=0.0, measure_ratio=0.0, measures=0)
    if spines_ok is None:
        spines_ok = 1.0 if page.spines == expected else 0.0
    try:
        single = merge.merge_pages([page])
        checked, bad = merge.measure_stats(single, lenient_first, lenient_last)
        measures = merge.extract_metadata(single).measure_count
    except Exception:  # noqa: BLE001 - kern hỏng tới mức không ghép được thì coi như điểm thấp nhất
        return Score(spines_ok=spines_ok, measure_ratio=0.0, measures=0)
    ratio = (checked - bad) / checked if checked else 1.0
    return Score(spines_ok=spines_ok, measure_ratio=ratio, measures=measures)


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
) -> tuple[Optional[merge.PageKern], list[SystemResult], list[str]]:
    """Nhận diện lại trang ``number`` theo từng hệ. Trả ``(kern_trang, kết_quả_từng_hệ, cảnh_báo)``.

    ``kern_trang`` là None nếu không hệ nào đọc được. ``can_retry()`` False thì không thử lại bằng beam search (hết thời
    gian). ``meter``: token ``*M4/4`` đã biết của bài (hệ ở giữa bài không tự có dòng này). Hủy job hoặc hết hạn từ ``recognize`` được để nguyên cho bên gọi xử lý.
    """
    warnings: list[str] = []
    results: list[SystemResult] = []
    for index, (system, band) in enumerate(zip(layout.systems, system_bands(layout))):
        judge = _judge(number, index, layout, meter)
        result = _recognize_one(number, index, gray, layout, band, recognize, retry_beams, can_retry, max_repeat, judge)
        results.append(result)
        meter = page_meter(result.page) or meter  # hệ sau được chấm theo số chỉ nhịp đã thấy

    fixed: list[merge.PageKern] = []
    for index, (system, result) in enumerate(zip(layout.systems, results), start=1):
        warnings.extend(result.warnings)
        if result.page is None:
            warnings.append(f"Trang {number}, hệ {index}: không đọc được nốt nào khi nhận diện lại theo hệ")
            continue
        page, notes = fit_spines(result.page, len(system.staves), f"Trang {number}, hệ {index}")
        warnings.extend(notes)
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


def _judge(number: int, index: int, layout: PageLayout, meter: Optional[str]) -> Judge:
    """Chỉ nới ô nhịp đầu bài (hệ đầu trang 1, có thể là ô lấy đà) và ô cuối trang (hệ cuối, có thể là ô cuối bài). Mọi
    ô khác phải đủ trường độ."""
    return Judge(number == 1 and index == 0, index == len(layout.systems) - 1, meter)


def _with_meter(page: Optional[merge.PageKern], meter: Optional[str]) -> Optional[merge.PageKern]:
    """Bản dùng để chấm điểm: thêm dòng số chỉ nhịp nếu kern chưa có (không dùng cho kết quả xuất)."""
    if page is None or meter is None or page_meter(page) is not None:
        return page
    row = merge.TAB.join([meter] * page.spines)
    return merge.PageKern(number=page.number, header=page.header, body=[row] + list(page.body))


def _score(page: Optional[merge.PageKern], target: int, judge: Judge) -> Score:
    return score_page(
        _with_meter(page, judge.meter), target, lenient_first=judge.lenient_first, lenient_last=judge.lenient_last
    )


def _is_good(page: Optional[merge.PageKern], target: int, judge: Judge) -> bool:
    """Đúng số spine và mọi ô nhịp kiểm được đều đủ trường độ."""
    return page is not None and page.spines == target and _score(page, target, judge).measure_ratio >= 1.0


def _rank(page: Optional[merge.PageKern], target: int, judge: Judge, lossy: bool = False) -> tuple:
    """Khoá so sánh ứng viên: (đúng spine, tỉ lệ ô nhịp đúng, không phải thay ô nhịp bằng dấu lặng)."""
    return _score(page, target, judge).key() + (0 if lossy else 1,)


def _read(
    number: int,
    index: int,
    image: np.ndarray,
    recognize: Recognize,
    beams: Optional[int],
    max_repeat: int,
    tag: Optional[str] = None,
) -> Optional[merge.PageKern]:
    """Một lần đọc model rồi làm sạch kern; None nếu không đọc được nốt nào."""
    text, truncated = recognize(image, index, beams) if tag is None else recognize(image, index, beams, tag)
    page, _ = merge.clean_page(number, text, max_repeat=max_repeat, truncated=truncated)
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
) -> SystemResult:
    """Nhận diện một hệ theo thứ tự rẻ trước: đọc cả hệ (greedy) -> đọc riêng giọng/piano (2 lần greedy ngắn) -> beam."""
    system = layout.systems[index]
    target = len(system.staves)
    image = virtual_page(gray, band)
    if len(role_groups(system)) <= 1:
        return _recognize_system(number, index, image, target, recognize, retry_beams, can_retry, max_repeat)

    best = _recognize_system(number, index, image, target, recognize, 0, can_retry, max_repeat)
    attempts = best.attempts
    warnings: list[str] = []
    lossy = False
    """Kết quả đang giữ có ô nhịp bị thay bằng dấu lặng (mất nốt) nên chưa được coi là tốt."""

    if not _is_good(best.page, target, judge) and can_retry():
        roles = _recognize_by_roles(number, index, gray, layout, recognize, retry_beams, can_retry, max_repeat)
        attempts += roles.attempts
        warnings.extend(roles.warnings)
        roles_lossy = any(combine.REPLACED_MARK in w for w in roles.warnings)
        if roles.page is not None and _accept_roles(best.page, roles.page, roles_lossy, target, judge):
            best = SystemResult(roles.page, attempts, "roles", warnings)
            lossy = roles_lossy
    if (lossy or not _is_good(best.page, target, judge)) and retry_beams > 1 and can_retry():
        beam = _read(number, index, image, recognize, retry_beams, max_repeat)
        attempts += 1
        if beam is not None and _rank(beam, target, judge) > _rank(best.page, target, judge, lossy):
            best = SystemResult(beam, attempts, "system", warnings)
    best.attempts = attempts
    best.warnings = warnings
    return best


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
) -> SystemResult:
    """Nhận diện một hệ; sai số spine thì thử lại bằng beam search (nếu bật và còn thời gian). Giữ lần thử điểm cao nhất."""
    attempts: list[tuple[Optional[int], Optional[merge.PageKern]]] = []
    beam_plan: list[Optional[int]] = [None]
    if retry_beams > 1:
        beam_plan.append(retry_beams)
    for beams in beam_plan:
        if attempts and not can_retry():
            break
        page = _read(number, index, image, recognize, beams, max_repeat, tag)
        attempts.append((beams, page))
        if page is not None and page.spines == target:
            break
    best = max(attempts, key=lambda item: score_page(item[1], target).key())
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
) -> SystemResult:
    """Đọc riêng từng nhóm khuông của hệ ``index`` rồi ghép. ``page`` None kèm cảnh báo lý do nếu không được."""
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
        sub = _recognize_system(number, index, virtual_page(gray, band), width, recognize, retry_beams, can_retry, max_repeat, tag)
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
) -> tuple[str, Optional[merge.PageKern], tuple, tuple]:
    """Chọn giữa kết quả cả trang và kết quả theo hệ (``systems_ok`` = tỉ lệ hệ đọc đúng số khuông).

    Kết quả theo hệ không có hệ nào đúng thì chỉ dùng khi lượt chính không đọc được gì. Hòa điểm thì giữ kết quả cả
    trang (đường cũ, đã được kiểm chứng nhiều hơn).
    """
    primary_score = score_page(primary, expected).key()
    systems_score = score_page(systems, expected, spines_ok=systems_ok).key()
    usable = systems is not None and (systems_ok > 0 or primary is None)
    if usable and systems_score > primary_score:
        return SOURCE_SYSTEMS, systems, primary_score, systems_score
    return SOURCE_PAGE, primary, primary_score, systems_score
