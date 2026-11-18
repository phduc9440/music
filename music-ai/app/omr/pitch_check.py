"""Kiểm tra cao độ bằng vị trí đầu nốt trên ảnh (OpenCV, không model, không tốn quota AI).

Transcoda chỉ train trên trang tổng hợp nên hay lệch quãng tám (sinh ``*8va`` bừa, nốt cao/thấp hơn 1-3 quãng tám) và
các luật lý thuyết của ``review.py`` không bắt được lệch 1 quãng tám nằm trong tầm giọng. Nhưng *tên nốt* (C, D, E...) model
đọc khá đúng, còn cao độ thật thì đọc được thẳng từ vị trí đầu nốt so với 5 dòng kẻ. Module này:

1. tìm đầu nốt trên ảnh (bỏ dòng kẻ, bỏ gạch ngang beam, lấp lỗ đầu nốt rỗng, mở hình thái bằng elip cỡ đầu nốt);
2. đổi vị trí khuông -> (tên nốt, quãng tám) cho khóa Sol;
3. căn chuỗi đầu nốt trên ảnh với chuỗi nốt kern bằng quy hoạch động (ghép theo *tên nốt*);
4. với cặp ghép đúng tên nốt nhưng khác quãng tám thì sửa quãng tám theo ảnh; cặp khác tên nốt chỉ được đếm (không sửa).

Có hàng rào: bỏ qua khuông không phải khóa Sol, số khuông không khớp số spine, hoặc tỉ lệ khớp tên nốt thấp (ảnh/kern
không cùng một bản nhạc, đọc ảnh hỏng). Mọi thứ chạy trên ảnh trang đã tiền xử lý, cùng hệ tọa độ với ``layout``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from app.omr import merge
from app.omr.layout import PageLayout, Staff
from app.omr.textstrip import strip_text

TAB = "\t"
_LETTERS = "cdefgab"
_RE_RUN = re.compile(r"([a-gA-G])\1*")
_RE_CLEF = re.compile(r"^\*clef([A-Za-z])(\d)")

MIN_LETTER_AGREEMENT = 0.7
"""Tỉ lệ cặp ghép trùng tên nốt tối thiểu để dám sửa quãng tám."""

MAX_COUNT_DIFF = 0.25
"""Số đầu nốt ảnh và số nốt kern lệch quá tỉ lệ này thì không tin ảnh."""

MIN_NOTES = 4
"""Ít hơn số nốt này thì không đủ để tin phép căn."""

MAX_OCTAVE_SHIFT = 3

MIN_MEASURE_AGREEMENT = 0.6
"""Sửa cả tên nốt theo ảnh (bản một khuông) chỉ khi ít nhất tỉ lệ ô này đã khớp hoàn toàn tên nốt giữa ảnh và kern."""

MIN_MEASURES = 4


@dataclass
class Head:
    system: int
    staff: int
    x: float
    step: int
    """Vị trí khuông: 0 = dòng kẻ dưới cùng, +1 mỗi nửa interline đi lên."""


@dataclass
class PitchReport:
    fixed: int = 0
    mismatched: int = 0
    checked_pages: int = 0
    skipped: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "fixed": self.fixed,
            "mismatched": self.mismatched,
            "checkedPages": self.checked_pages,
            "skipped": self.skipped,
        }


# ---------------------------------------------------------------------------------------------- tìm đầu nốt


def _ink(gray: np.ndarray, layout: PageLayout) -> np.ndarray:
    stripped, _ = strip_text(gray, layout)
    background = float(np.percentile(stripped, 90))
    return (stripped < min(200.0, background - 40)).astype(np.uint8)


def _pieces(ink: np.ndarray, layout: PageLayout) -> tuple[np.ndarray, np.ndarray]:
    """Mực đã xóa dòng kẻ khuông (giữ chỗ nét dọc cắt qua) và mặt nạ nét ngang ngắn để kiểm tra dòng kẻ phụ."""
    il = layout.interline
    h, w = ink.shape
    long_h = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w // 40), 1)))
    reach = max(2, int(round(0.3 * il)))
    above = np.roll(ink, reach, 0)
    below = np.roll(ink, -reach, 0)
    rows = np.zeros(h, bool)
    for system in layout.systems:
        for staff in system.staves:
            rows[max(0, int(staff.top - 0.6 * il)) : int(staff.bottom + 0.6 * il) + 1] = True
    pieces = ink.copy()
    pieces[(long_h > 0) & rows[:, None] & ~((above > 0) & (below > 0))] = 0
    ledger = cv2.morphologyEx(
        ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, int(round(1.2 * il))), 1))
    )
    return pieces, ledger


def _header_end(pieces: np.ndarray, staff: Staff, left: float, il: float) -> int:
    """Cột kết thúc phần đầu khuông (khóa, hóa biểu, số chỉ nhịp): chuỗi cột có mực, đứt khi trống quá 1.8 interline."""
    band = pieces[max(0, int(staff.top - 2 * il)) : int(staff.bottom + 2 * il) + 1, :]
    cols = band.sum(0) > 0
    end: Optional[int] = None
    gap = 0
    gap_max = int(1.8 * il)
    for i in range(int(left), len(cols)):
        if cols[i]:
            end, gap = i, 0
        elif end is not None:
            gap += 1
            if gap > gap_max:
                break
    return (end or int(left)) + 1


def _has_ledger(ledger: np.ndarray, staff: Staff, il: float, x: float, step: int) -> bool:
    """Đầu nốt ngoài khuông phải có dòng kẻ phụ gần nó; chữ hợp âm (A7, Dm...) nằm trên khuông thì không có."""
    if 0 <= step <= 8:
        return True
    if step > 8:
        k = (step - 8) // 2
        y = staff.top - k * il if k > 0 else staff.top
    else:
        k = (-step) // 2
        y = staff.bottom + k * il if k > 0 else staff.bottom
    if k == 0:  # step = -1 hoặc 9: nằm sát dòng kẻ ngoài cùng, không cần dòng phụ
        return True
    y0, y1 = max(0, int(y - 0.3 * il)), int(y + 0.3 * il) + 1
    x0, x1 = max(0, int(x - 1.2 * il)), int(x + 1.2 * il) + 1
    return int((ledger[y0:y1, x0:x1].sum(1)).max(initial=0)) >= int(1.0 * il)


def _has_stem(pieces: np.ndarray, cx: float, cy: float, width: float, il: float) -> bool:
    """Có nét dọc dài >= 2.2 interline sát cạnh đầu nốt. Chữ hợp âm (A7, G, F...) chỉ có nét dọc ngắn ~1.3 interline."""
    h, w = pieces.shape
    y0, y1 = max(0, int(cy - 4.0 * il)), min(h, int(cy + 4.0 * il) + 1)
    for edge in (cx - width / 2.0, cx + width / 2.0):
        x0, x1 = max(0, int(round(edge)) - 1), min(w, int(round(edge)) + 2)
        column = pieces[y0:y1, x0:x1].max(axis=1) > 0
        run = best = 0
        for value in column:
            run = run + 1 if value else 0
            best = max(best, run)
        if best >= 2.2 * il:
            return True
    return False


def _fill_holes(mask: np.ndarray, max_area: float, max_w: float, max_h: float) -> np.ndarray:
    """Lấp các vùng trắng nhỏ bị mực bao kín (lòng đầu nốt rỗng)."""
    h, w = mask.shape
    n, labels, stats, _ = cv2.connectedComponentsWithStats((1 - mask).astype(np.uint8), connectivity=4)
    out = mask.copy()
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area <= max_area and bw <= max_w and bh <= max_h and x > 0 and y > 0 and x + bw < w and y + bh < h:
            out[labels == i] = 1
    return out


def _fill_split_heads(ink: np.ndarray, layout: PageLayout) -> np.ndarray:
    """Nốt trắng nằm TRÊN dòng kẻ: dòng kẻ chia lòng nốt thành hai nửa kín, một nửa sát trên và một nửa sát dưới cùng một
    dòng, thẳng hàng nhau. Chỉ lấp các cặp như vậy (khe kín giữa đuôi móc, thân nốt và dòng kẻ thì không có cặp đối
    xứng nên không bị lấp nhầm)."""
    il = layout.interline
    h, w = ink.shape
    n, labels, stats, _ = cv2.connectedComponentsWithStats((1 - ink).astype(np.uint8), connectivity=4)
    small = [
        i
        for i in range(1, n)
        if stats[i][4] <= 0.45 * il * il
        and 0.3 * il <= stats[i][2] <= 1.3 * il
        and stats[i][3] <= 0.7 * il
        and stats[i][0] > 0
        and stats[i][1] > 0
        and stats[i][0] + stats[i][2] < w
        and stats[i][1] + stats[i][3] < h
    ]
    lines = [st.top + k * (st.bottom - st.top) / 4.0 for sy in layout.systems for st in sy.staves for k in range(5)]
    above: dict[int, list[int]] = {}
    below: dict[int, list[int]] = {}
    tol = max(2.0, 0.25 * il)
    for i in small:
        x, y, bw, bh, _a = stats[i]
        for k, ly in enumerate(lines):
            if abs((y + bh) - ly) <= tol:
                above.setdefault(k, []).append(i)
            elif abs(y - ly) <= tol:
                below.setdefault(k, []).append(i)
    out = ink.copy()
    for k, ups in above.items():
        for i in ups:
            cx = stats[i][0] + stats[i][2] / 2.0
            for j in below.get(k, []):
                if abs(stats[j][0] + stats[j][2] / 2.0 - cx) <= 0.3 * il:
                    out[labels == i] = 1
                    out[labels == j] = 1
    return out


def find_heads(gray: np.ndarray, layout: PageLayout) -> list[Head]:
    il = layout.interline
    # Lấp lòng nốt trắng TRƯỚC khi xóa dòng kẻ: dòng kẻ cắt ngang lòng nốt thành hai nửa kín, xóa dòng rồi thì vòng
    # đầu nốt bị hở và không lấp được nữa.
    ink = _fill_split_heads(_ink(gray, layout), layout)
    pieces, ledger = _pieces(ink, layout)
    h, w = pieces.shape
    beam = cv2.morphologyEx(
        pieces, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (int(round(2.3 * il)), max(2, int(round(0.28 * il)))))
    )
    beam = cv2.dilate(beam, np.ones((3, 3), np.uint8))
    no_beam = pieces.copy()
    no_beam[beam > 0] = 0
    filled = _fill_holes(no_beam, 0.8 * il * il, 1.3 * il, 1.1 * il)  # nốt trắng nằm giữa hai dòng kẻ
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(3, int(round(0.75 * il))), max(3, int(round(0.6 * il)))))
    opened = cv2.morphologyEx(filled, cv2.MORPH_OPEN, kernel)
    n, _, stats, _ = cv2.connectedComponentsWithStats(opened, connectivity=8)

    heads: list[Head] = []
    for si, system in enumerate(layout.systems):
        for ti, staff in enumerate(system.staves):
            lo, hi = staff.top - 4.2 * il, staff.bottom + 4.2 * il
            start = _header_end(pieces, staff, system.left, il)
            for i in range(1, n):
                x, y, bw, bh, area = stats[i]
                cy, cx = y + bh / 2.0, x + bw / 2.0
                if not (lo <= cy <= hi) or cx < start:
                    continue
                if area < 0.3 * il * il or bw > 2.4 * il or bh > 4.5 * il or bw < 0.7 * il or bh < 0.55 * il:
                    continue
                if area / float(bw * bh) < 0.6:
                    continue
                if bh > 1.5 * il and bw <= 1.7 * il:  # nốt chồng (hợp âm) dính nhau theo chiều dọc
                    count = int(round((bh - 0.9 * il) / il)) + 1
                    ys = [y + 0.45 * il + j * (bh - 0.9 * il) / max(1, count - 1) for j in range(count)]
                elif bw > 1.7 * il and bh <= 1.8 * il:  # hai nốt cách quãng 2 đặt lệch hai bên thân
                    ys = [y + 0.45 * il, y + bh - 0.45 * il]
                elif bw > 1.6 * il:
                    continue
                else:
                    ys = [cy]
                for yy in ys:
                    step = int(round((staff.bottom - yy) / (il / 2.0)))
                    if step >= 9 and not _has_stem(pieces, cx, yy, bw, il):
                        continue  # vùng trên khuông: chữ hợp âm trông giống đầu nốt, nốt thật có thân
                    if _has_ledger(ledger, staff, il, cx, step):
                        heads.append(Head(system=si, staff=ti, x=float(cx), step=step))
    return heads


# ---------------------------------------------------------------------------------------------- khóa Sol


def _diatonic_from_step(step: int) -> int:
    """Số bậc diatonic tuyệt đối (C0 = 0). Khóa Sol: dòng dưới cùng là Mi4."""
    return 7 * 4 + 2 + step


def _diatonic_of(letter: str, octave: int) -> int:
    return 7 * octave + _LETTERS.index(letter)


def _kern_pitch(sub: str) -> Optional[tuple[str, int]]:
    """``(tên nốt, quãng tám)`` của một nốt kern; None với dấu lặng/token không có cao độ."""
    if not sub or sub == "." or "r" in sub:
        return None
    match = _RE_RUN.search(sub)
    if match is None:
        return None
    run = match.group(0)
    letter = run[0]
    octave = 3 + len(run) if letter.islower() else 4 - len(run)
    return letter.lower(), octave


def _rewrite_octave(sub: str, octave: int) -> str:
    match = _RE_RUN.search(sub)
    if match is None:
        return sub
    letter = match.group(0)[0].lower()
    run = letter * (octave - 3) if octave >= 4 else letter.upper() * (4 - octave)
    return sub[: match.start()] + run + sub[match.end() :]


@dataclass
class _Event:
    letter: str
    octave: int
    line: int
    column: int
    sub: int
    """Chỉ số nốt con trong token (hợp âm tách bằng dấu cách)."""


def _kern_events(lines: list[str], spines: int) -> dict[int, list[_Event]]:
    """Nốt của từng spine theo thứ tự thời gian; chỉ lấy đoạn khóa Sol (spine đổi sang khóa khác thì bỏ nốt đó)."""
    clefs: dict[int, str] = {}
    out: dict[int, list[_Event]] = {c: [] for c in range(spines)}
    unsupported: set[int] = set()
    for index, line in enumerate(lines):
        if not line or line.startswith("!") or line.startswith("="):
            continue
        cells = line.split(TAB)
        if len(cells) != spines:
            continue
        if line.startswith("*"):
            for column, cell in enumerate(cells):
                match = _RE_CLEF.match(cell)
                if match:
                    clefs[column] = match.group(1) + match.group(2)
                    if clefs[column] != "G2":
                        unsupported.add(column)
            continue
        for column, cell in enumerate(cells):
            if column in unsupported or clefs.get(column, "G2") != "G2" or cell == ".":
                continue
            subs = [(k, s) for k, s in enumerate(cell.split(" ")) if _kern_pitch(s)]
            subs.sort(key=lambda ks: _diatonic_of(*_kern_pitch(ks[1])))  # type: ignore[misc]
            for k, s in subs:
                pitch = _kern_pitch(s)
                assert pitch is not None
                out[column].append(_Event(pitch[0], pitch[1], index, column, k))
    for column in unsupported:
        out[column] = []
    return out


# ---------------------------------------------------------------------------------------------- căn chuỗi


def _head_sequence(heads: list[Head], il: float) -> list[int]:
    """Số bậc diatonic của đầu nốt theo thứ tự hệ -> x; cùng x thì xếp từ thấp lên cao (như thứ tự trong hợp âm)."""
    ordered = sorted(heads, key=lambda hd: (hd.system, hd.x))
    out: list[int] = []
    group: list[Head] = []

    def flush() -> None:
        out.extend(sorted(_diatonic_from_step(hd.step) for hd in group))
        group.clear()

    for head in ordered:
        if group and (head.system != group[0].system or abs(head.x - group[-1].x) > 0.6 * il):
            flush()
        group.append(head)
    flush()
    return out


def align(image: list[int], kern: list[_Event]) -> list[tuple[int, int]]:
    """Quy hoạch động (kiểu Needleman-Wunsch) ghép đầu nốt ảnh với nốt kern theo tên nốt. Trả các cặp ``(i, j)``."""
    n, m = len(image), len(kern)
    gap = 1.0
    sub_mismatch = 1.6
    cost = np.zeros((n + 1, m + 1))
    cost[:, 0] = np.arange(n + 1) * gap
    cost[0, :] = np.arange(m + 1) * gap
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            same = (image[i - 1] % 7) == _LETTERS.index(kern[j - 1].letter)
            diag = cost[i - 1, j - 1] + (0.0 if same else sub_mismatch)
            cost[i, j] = min(diag, cost[i - 1, j] + gap, cost[i, j - 1] + gap)
    pairs: list[tuple[int, int]] = []
    i, j = n, m
    while i > 0 and j > 0:
        same = (image[i - 1] % 7) == _LETTERS.index(kern[j - 1].letter)
        if abs(cost[i, j] - (cost[i - 1, j - 1] + (0.0 if same else sub_mismatch))) < 1e-9:
            pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif abs(cost[i, j] - (cost[i - 1, j] + gap)) < 1e-9:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs


@dataclass
class Fix:
    line: int
    column: int
    sub: int
    octave: int


def plan_fixes(image: list[int], kern: list[_Event]) -> tuple[list[Fix], int, Optional[str]]:
    """``(sửa, số cặp khác tên nốt, lý do bỏ qua)``. Lý do bỏ qua khác None nghĩa là không sửa gì."""
    if len(kern) < MIN_NOTES or len(image) < MIN_NOTES:
        return [], 0, "quá ít nốt"
    if abs(len(image) - len(kern)) > MAX_COUNT_DIFF * len(kern):
        return [], 0, f"số đầu nốt trên ảnh ({len(image)}) lệch nhiều so với số nốt kern ({len(kern)})"
    pairs = align(image, kern)
    if not pairs:
        return [], 0, "không căn được"
    same = [(i, j) for i, j in pairs if image[i] % 7 == _LETTERS.index(kern[j].letter)]
    if len(same) / float(len(kern)) < MIN_LETTER_AGREEMENT:
        return [], len(pairs) - len(same), "tên nốt ảnh và kern khớp thấp"
    fixes: list[Fix] = []
    for i, j in same:
        event = kern[j]
        octave = image[i] // 7
        delta = octave - event.octave
        if delta != 0 and abs(delta) <= MAX_OCTAVE_SHIFT:
            fixes.append(Fix(event.line, event.column, event.sub, octave))
    fixes.extend(_context_fixes(kern, {j for _i, j in same}, fixes))
    return fixes, len(pairs) - len(same), None


def _context_fixes(kern: list[_Event], anchored: set[int], fixes: list[Fix]) -> list[Fix]:
    """Nốt kern không ghép được với ảnh (thường là nốt trắng/tròn ảnh chưa thấy) mà nằm ở quãng tám bất thường
    (>= 6 hoặc <= 2) thì kéo về quãng tám gần các nốt đã ghép đứng trước/sau nó nhất."""
    octave_of = {j: kern[j].octave for j in range(len(kern))}
    by_key = {(f.line, f.column, f.sub): f.octave for f in fixes}
    for j, event in enumerate(kern):
        if (event.line, event.column, event.sub) in by_key:
            octave_of[j] = by_key[(event.line, event.column, event.sub)]
    out: list[Fix] = []
    for j, event in enumerate(kern):
        if j in anchored or 3 <= event.octave <= 5:
            continue
        before = next((k for k in range(j - 1, -1, -1) if k in anchored), None)
        after = next((k for k in range(j + 1, len(kern)) if k in anchored), None)
        context = [_diatonic_of(kern[k].letter, octave_of[k]) for k in (before, after) if k is not None]
        if not context:
            continue
        center = sum(context) / len(context)
        best = min(range(3, 6), key=lambda o: abs(_diatonic_of(event.letter, o) - center))
        if best != event.octave and abs(best - event.octave) <= MAX_OCTAVE_SHIFT:
            out.append(Fix(event.line, event.column, event.sub, best))
    return out


def _apply(lines: list[str], fixes: list[Fix]) -> list[str]:
    out = list(lines)
    by_line: dict[int, list[Fix]] = {}
    for fix in fixes:
        by_line.setdefault(fix.line, []).append(fix)
    for index, items in by_line.items():
        cells = out[index].split(TAB)
        for fix in items:
            subs = cells[fix.column].split(" ")
            subs[fix.sub] = _rewrite_octave(subs[fix.sub], fix.octave)
            cells[fix.column] = " ".join(subs)
        out[index] = TAB.join(cells)
    return out


# ---------------------------------------------------------------------------------------------- một trang


def _rewrite_pitch(sub: str, letter: str, octave: int) -> str:
    """Đổi tên nốt + quãng tám; đổi tên nốt thì bỏ dấu hóa ghi kèm (dấu hóa của nốt cũ không còn đúng)."""
    match = _RE_RUN.search(sub)
    if match is None:
        return sub
    old = match.group(0)[0].lower()
    run = letter * (octave - 3) if octave >= 4 else letter.upper() * (4 - octave)
    rest = sub[match.end() :]
    if old != letter:
        rest = rest.lstrip("#-n")
    return sub[: match.start()] + run + rest


def _image_measures(heads: list[Head], layout: PageLayout) -> Optional[list[list[int]]]:
    """Bậc diatonic các đầu nốt theo từng ô trên ảnh (thứ tự hệ -> vạch nhịp). None nếu hệ nào không dò được vạch."""
    out: list[list[int]] = []
    for si, system in enumerate(layout.systems):
        if not system.barlines:
            return None
        own = sorted((hd for hd in heads if hd.system == si), key=lambda hd: hd.x)
        start = -1.0
        for bar in system.barlines:
            out.append([_diatonic_from_step(hd.step) for hd in own if start <= hd.x < bar])
            start = float(bar)
    return out


def _kern_measures(lines: list[str]) -> list[list[tuple[int, str]]]:
    """Nốt (dòng, token) của từng ô, chỉ ô có dòng dữ liệu. Ô có hợp âm thì đánh dấu bằng ``(-1, "")``."""
    out: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []
    has_data = False
    for index, line in enumerate(lines):
        if merge.is_barline(line):
            if has_data:
                out.append(current)
            current, has_data = [], False
            continue
        if not merge.is_data_line(line):
            continue
        has_data = True
        if line == ".":
            continue
        if " " in line:
            current.append((-1, ""))
        elif _kern_pitch(line):
            current.append((index, line))
    if has_data:
        out.append(current)
    return out


def fix_measures(lines: list[str], heads: list[Head], layout: PageLayout) -> tuple[list[str], int, Optional[str]]:
    """Bản MỘT khuông khóa Sol: ô có số đầu nốt trên ảnh bằng số nốt kern thì lấy cao độ (tên nốt + quãng tám) theo ảnh.

    Bắt được lỗi model "đọc lặp" một hệ (chép nốt của hệ sau vào), đọc nhầm tên nốt, mà luật nhạc lý không thấy. Chỉ chạy
    khi số ô ảnh = số ô kern và phần lớn ô đã khớp sẵn (ảnh đáng tin trên trang này). Trả ``(dòng, số nốt sửa, lý do)``.
    """
    if any(_RE_CLEF.match(ln) and not ln.startswith("*clefG2") for ln in lines):
        return lines, 0, "có khóa khác Sol"
    image = _image_measures(heads, layout)
    if image is None:
        return lines, 0, "thiếu vạch nhịp"
    kern = _kern_measures(lines)
    if len(image) != len(kern):
        return lines, 0, f"số ô ảnh ({len(image)}) khác số ô kern ({len(kern)})"
    comparable = [
        (img, notes) for img, notes in zip(image, kern) if notes and len(img) == len(notes) and all(i >= 0 for i, _ in notes)
    ]
    if len(comparable) < MIN_MEASURES:
        return lines, 0, "quá ít ô so được"

    def letters_match(img: list[int], notes: list[tuple[int, str]]) -> bool:
        return all(_LETTERS[d % 7] == _kern_pitch(tok)[0] for d, (_i, tok) in zip(img, notes))  # type: ignore[index]

    agree = sum(1 for img, notes in comparable if letters_match(img, notes))
    if agree / float(len(comparable)) < MIN_MEASURE_AGREEMENT:
        return lines, 0, "tên nốt ảnh và kern khớp thấp"
    out = list(lines)
    changed = 0
    for img, notes in comparable:
        if letters_match(img, notes):
            continue
        for d, (index, token) in zip(img, notes):
            letter, octave = _LETTERS[d % 7], d // 7
            if _kern_pitch(token) != (letter, octave):
                out[index] = _rewrite_pitch(token, letter, octave)
                changed += 1
    return out, changed, None


def check_page(
    lines: list[str], spines: int, gray: np.ndarray, layout: PageLayout
) -> tuple[list[str], int, int, Optional[str]]:
    """Sửa quãng tám cho các dòng kern của MỘT trang. Trả ``(dòng, số nốt sửa, số cặp khác tên nốt, lý do bỏ qua)``."""
    if not layout.systems:
        return lines, 0, 0, "không có bố cục"
    staves_per_system = {len(system.staves) for system in layout.systems}
    if staves_per_system != {spines}:
        return lines, 0, 0, f"số khuông mỗi hệ {sorted(staves_per_system)} khác số spine {spines}"
    heads = find_heads(gray, layout)
    il = layout.interline
    rewritten = 0
    if spines == 1:
        lines, rewritten, _why = fix_measures(lines, heads, layout)
    events = _kern_events(lines, spines)
    fixes: list[Fix] = []
    mismatched = 0
    reasons: list[str] = []
    for column in range(spines):
        if not events[column]:
            reasons.append(f"spine {column + 1}: khóa khác Sol hoặc không có nốt")
            continue
        staff_index = spines - 1 - column  # spine 1 của kern là khuông DƯỚI cùng
        sub = [hd for hd in heads if hd.staff == staff_index]
        plan, miss, reason = plan_fixes(_head_sequence(sub, il), events[column])
        mismatched += miss
        if reason:
            reasons.append(f"spine {column + 1}: {reason}")
        fixes.extend(plan)
    if not fixes:
        return lines, rewritten, mismatched, "; ".join(reasons) or None
    return _apply(lines, fixes), len(fixes) + rewritten, mismatched, "; ".join(reasons) or None


def apply(
    result: merge.MergeResult,
    layouts: dict[int, PageLayout],
    page_images: dict[int, np.ndarray],
) -> tuple[merge.MergeResult, PitchReport]:
    """Chạy :func:`check_page` cho từng trang của bản kern đã ghép, trả bản kern mới."""
    report = PitchReport()
    lines = list(result.lines)
    for page in sorted(set(result.line_pages)):
        indexes = [i for i, p in enumerate(result.line_pages) if p == page]
        layout, image = layouts.get(page), page_images.get(page)
        if layout is None or image is None:
            report.skipped.append(f"trang {page}: thiếu ảnh hoặc bố cục")
            continue
        chunk = [lines[i] for i in indexes]
        fixed, count, miss, reason = check_page(chunk, result.spines, image, layout)
        report.checked_pages += 1
        report.mismatched += miss
        if reason:
            report.skipped.append(f"trang {page}: {reason}")
        if count:
            report.fixed += count
            for i, text in zip(indexes, fixed):
                lines[i] = text
            report.notes.append(f"Trang {page}: sửa quãng tám {count} nốt theo vị trí đầu nốt trên ảnh")
    if report.fixed == 0:
        return result, report
    return merge.with_lines(result, lines), report
