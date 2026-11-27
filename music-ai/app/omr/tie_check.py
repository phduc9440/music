"""Dấu luyến bị đọc thành dấu nối: kiểm nốt cuối của dấu nối bằng vị trí đầu nốt trên ảnh (OpenCV, không model).

Dấu nối (tie) chỉ nối hai nốt cùng cao độ; dấu luyến (slur) nối hai nốt bất kỳ và trông gần như nhau. Transcoda hay
đọc dấu luyến giữa hai nốt khác cao độ thành dấu nối, rồi *chép cao độ của nốt đầu sang nốt sau* cho hợp lệ (``8f[ 8f]``
thay cho ``8f( 8e-)``), có khi còn thêm nốt bịa vào hợp âm (``8F] 8A`` thay cho ``8G)``). Kern khi đó hoàn toàn hợp lệ, luật
nhạc lý không thấy gì; chỉ ảnh mới cho biết nốt sau nằm ở dòng kẻ khác.

Cách kiểm, theo từng ô và từng khuông (spine gốc, gộp cả hai bè nếu spine tách):

1. Ảnh: đầu nốt của ô (:func:`app.omr.pitch_check.find_heads`, ô theo vạch nhịp của bố cục) gom theo hoành độ thành
   các *thời điểm*; mỗi thời điểm là tập vị trí khuông.
2. Kern: các thời điểm có nốt (trục thời gian Humdrum, :func:`app.omr.merge.timeline`), mỗi thời điểm là tập vị trí khuông
   theo khóa (hai bè cùng một nốt chỉ tính một đầu nốt, như ảnh in chung một đầu).
3. Chỉ sửa khi số thời điểm hai bên bằng nhau, **đúng một** thời điểm lệch, thời điểm đó là nốt cuối của một dấu nối và
   nốt đầu của dấu nối khớp ảnh. Khi đó nốt cuối lấy cao độ theo ảnh (dấu hóa theo hóa biểu hoặc dấu hóa đã gặp trong ô),
   nốt hợp âm không có trên ảnh bị bỏ, và dấu nối thành dấu luyến.

Các hàng rào này cố ý chặt: ô có nốt hoa mỹ, ảnh có nhiều đầu nốt hơn kern, nốt đầu dấu nối không khớp ảnh... đều bỏ qua.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional

from app.omr import merge
from app.omr.layout import PageLayout
from app.omr.pitch_check import Head, _clef_bottom

TAB = "\t"
_LETTERS = "cdefgab"
_RE_RUN = re.compile(r"([a-gA-G])\1*([#\-n]*)")
_RE_KEYSIG = re.compile(r"^\*k\[([a-g#\-]*)\]")
_CARRIED = "LJKk(){}"
"""Ký hiệu của cả token (chùm, luyến, câu) phải giữ lại khi bỏ một nốt của hợp âm."""

CLUSTER_GAP = 0.75
"""Hai đầu nốt cách nhau theo x quá bấy nhiêu interline thì thuộc hai thời điểm khác nhau."""


@dataclass
class TieReport:
    slurs: int = 0
    """Số dấu nối đã đổi thành dấu luyến (kèm sửa cao độ)."""
    lines: list[int] = field(default_factory=list)
    """Chỉ số các dòng đã sửa (trong danh sách dòng truyền vào)."""


@dataclass
class _Note:
    line: int
    column: int
    sub: int
    step: int
    """Vị trí khuông: 0 = dòng kẻ dưới cùng, +1 mỗi nửa interline đi lên (như :class:`Head`)."""


@dataclass
class _Onset:
    time: Fraction
    notes: list[_Note]

    @property
    def steps(self) -> set[int]:
        return {n.step for n in self.notes}


def _pitch(sub: str) -> Optional[tuple[int, str]]:
    """``(bậc diatonic tuyệt đối, dấu hóa ghi kèm)`` của một nốt kern; None với dấu lặng, nốt ẩn, token không có cao độ."""
    if not sub or sub == "." or "r" in sub or "yy" in sub:
        return None
    match = _RE_RUN.search(sub)
    if match is None:
        return None
    letters = match.group(0)[: len(match.group(0)) - len(match.group(2))]
    letter = letters[0]
    octave = 3 + len(letters) if letter.islower() else 4 - len(letters)
    return 7 * octave + _LETTERS.index(letter.lower()), match.group(2).replace("n", "")


def _keysig(token: str) -> Optional[dict[str, str]]:
    match = _RE_KEYSIG.match(token)
    if match is None:
        return None
    body = match.group(1)
    return {body[i]: body[i + 1] for i in range(0, len(body) - 1, 2)}


def _kern_measures(lines: list[str], spines: int) -> Optional[list[dict]]:
    """Các ô (chỉ ô có dòng dữ liệu) của một trang, mỗi ô: ``onsets`` theo spine gốc, ``keys``/``clefs`` theo spine gốc
    ở đầu ô, ``grace`` (spine có nốt hoa mỹ). None nếu không chạy được trục thời gian."""
    clefs: list[Optional[int]] = [None] * spines
    keys: list[dict[str, str]] = [{} for _ in range(spines)]
    measures: list[dict] = []
    chunk: list[str] = []
    width = spines
    offset = 0

    def flush(start: int) -> bool:
        nonlocal width
        if not any(merge.is_data_line(line) for line in chunk):
            return True
        track = merge.timeline(chunk, width)
        if track is None:
            return False
        onsets: list[dict[Fraction, list[_Note]]] = [{} for _ in range(spines)]
        grace = [False] * spines
        for k, line in enumerate(chunk):
            groups = track.line_groups[k]
            time = track.times[k]
            if groups is None or time is None:
                continue
            for column, cell in enumerate(line.split(TAB)):
                group = groups[column]
                if cell == "." or group >= spines:
                    continue
                for index, sub in enumerate(cell.split(" ")):
                    if "q" in sub or "Q" in sub:
                        grace[group] = True
                        continue
                    pitch = _pitch(sub)
                    bottom = clefs[group]
                    if pitch is None or bottom is None:
                        continue
                    onsets[group].setdefault(time, []).append(_Note(start + k, column, index, pitch[0] - bottom))
        measures.append(
            {
                "onsets": [[_Onset(t, n) for t, n in sorted(per.items())] for per in onsets],
                "keys": [dict(k) for k in keys],
                "grace": grace,
                "start": start,
            }
        )
        width = len(track.groups)
        return True

    for index, line in enumerate(lines):
        if merge.is_barline(line):
            if not flush(offset):
                return None
            chunk, offset = [], index + 1
            continue
        if line.startswith("*"):
            fields = line.split(TAB)
            if len(fields) == spines:
                for column, token in enumerate(fields):
                    if token.startswith("*clef"):
                        clefs[column] = _clef_bottom(token)
                    found = _keysig(token)
                    if found is not None:
                        keys[column] = found
        chunk.append(line)
    if not flush(offset):
        return None
    return measures


def _image_measures(heads: list[Head], layout: PageLayout, spines: int) -> Optional[list[Optional[list[list[set[int]]]]]]:
    """Thời điểm (tập vị trí khuông) của từng ô trên ảnh, theo spine gốc (khuông dưới cùng là spine 0). Ô của hệ khác số
    khuông là None; None cả trang nếu chưa đếm chắc vạch nhịp."""
    if not layout.bars_confident:
        return None
    gap = CLUSTER_GAP * layout.interline
    out: list[Optional[list[list[set[int]]]]] = []
    for si, system in enumerate(layout.systems):
        edges = [float(system.left)] + [float(b) for b in system.barlines]
        if not system.bars_closed:
            edges.append(float(system.right) + 1.0)
        for a, b in zip(edges, edges[1:]):
            if len(system.staves) != spines:
                out.append(None)
                continue
            per_spine: list[list[set[int]]] = []
            for column in range(spines):
                staff = spines - 1 - column
                ordered = sorted((h for h in heads if h.system == si and h.staff == staff and a <= h.x < b), key=lambda h: h.x)
                clusters: list[list[Head]] = []
                for head in ordered:
                    if clusters and head.x - clusters[-1][0].x <= gap:
                        clusters[-1].append(head)
                    else:
                        clusters.append([head])
                per_spine.append([{h.step for h in cluster} for cluster in clusters])
            out.append(per_spine)
    return out


def _accidental(letter: str, octave: int, keys: dict[str, str], seen: dict[tuple[str, int], str]) -> str:
    """Dấu hóa kern của nốt mới: dấu hóa đã ghi trước đó trong ô cho đúng nốt này, không có thì theo hóa biểu."""
    if (letter, octave) in seen:
        return seen[(letter, octave)]
    return keys.get(letter, "")


def _spelled(degree: int, accidental: str) -> str:
    letter, octave = _LETTERS[degree % 7], degree // 7
    run = letter * (octave - 3) if octave >= 4 else letter.upper() * (4 - octave)
    return run + accidental


def _rewrite(sub: str, degree: int, keys: dict[str, str], seen: dict[tuple[str, int], str]) -> str:
    match = _RE_RUN.search(sub)
    if match is None:
        return sub
    accidental = _accidental(_LETTERS[degree % 7], degree // 7, keys, seen)
    return sub[: match.start()] + _spelled(degree, accidental) + sub[match.end() :]


def _seen_accidentals(lines: list[str], notes: list[_Note], before: _Note) -> dict[tuple[str, int], str]:
    """Dấu hóa đã ghi rõ trên các nốt đứng trước ``before`` trong cùng ô và cùng khuông."""
    seen: dict[tuple[str, int], str] = {}
    for note in notes:
        if note.line >= before.line:
            break
        sub = lines[note.line].split(TAB)[note.column].split(" ")[note.sub]
        pitch = _pitch(sub)
        match = _RE_RUN.search(sub)
        if pitch is None or match is None or not match.group(2):
            continue
        seen[(_LETTERS[pitch[0] % 7], pitch[0] // 7)] = match.group(2).replace("n", "")
    return seen


def _tie_start(lines: list[str], end: _Note, degree: int) -> Optional[tuple[int, int, int]]:
    """Nốt có ``[`` cùng cao độ ``degree`` đứng ngay trước ``end`` trong cùng cột: ``(dòng, cột, chỉ số nốt)``."""
    for index in range(end.line - 1, -1, -1):
        line = lines[index]
        if not merge.is_data_line(line):
            if line.startswith("*") and any(t in ("*^", "*v", "*+", "*x", "*-") for t in line.split(TAB)):
                return None
            continue
        cells = line.split(TAB)
        if end.column >= len(cells) or cells[end.column] == ".":
            continue
        for k, sub in enumerate(cells[end.column].split(" ")):
            pitch = _pitch(sub)
            if pitch is not None and pitch[0] == degree and "[" in sub:
                return index, end.column, k
        return None
    return None


def _set_sub(lines: list[str], line: int, column: int, sub: int, text: Optional[str]) -> None:
    cells = lines[line].split(TAB)
    subs = cells[column].split(" ")
    if text is None:
        del subs[sub]
    else:
        subs[sub] = text
    cells[column] = " ".join(subs)
    lines[line] = TAB.join(cells)


def _fix_onset(lines: list[str], onset: _Onset, image: set[int], bottom: int, keys: dict[str, str], notes: list[_Note]) -> bool:
    """Sửa một thời điểm lệch ảnh có nốt cuối của dấu nối (xem docstring module). Trả True nếu đã sửa."""
    columns = {(n.line, n.column) for n in onset.notes}
    if len(columns) != 1 or not image or len(image) > len(onset.notes):
        return False
    line, column = next(iter(columns))
    subs = lines[line].split(TAB)[column].split(" ")
    ends = [n for n in onset.notes if "]" in subs[n.sub]]
    if len(ends) != 1:
        return False
    end = ends[0]
    start = _tie_start(lines, end, end.step + bottom)
    if start is None or not any((n.line, n.column, n.sub) == start for n in notes):
        return False  # nốt đầu dấu nối phải nằm trong cùng ô (đã khớp ảnh vì chỉ có một thời điểm lệch)

    kept = {n.sub for n in onset.notes if n.step in image}
    left = sorted(image - {n.step for n in onset.notes})
    loose = [n for n in onset.notes if n.sub not in kept]
    loose.sort(key=lambda n: (n is not end, n.step))  # nốt cuối dấu nối nhận cao độ trước
    if len(left) != 1 and len(left) != len(loose):
        return False
    seen = _seen_accidentals(lines, notes, end)
    new_subs: dict[int, Optional[str]] = {}
    if len(left) == 1:
        target = loose[0]
        new_subs[target.sub] = _rewrite(subs[target.sub], left[0] + bottom, keys, seen)
        for other in loose[1:]:
            new_subs[other.sub] = None
    else:
        for note, step in zip(sorted(loose, key=lambda n: n.step), left):
            new_subs[note.sub] = _rewrite(subs[note.sub], step + bottom, keys, seen)

    # Ký hiệu của cả token (chùm, luyến) trên nốt bị bỏ chuyển sang nốt còn lại đầu tiên
    survivor = next(k for k in range(len(subs)) if new_subs.get(k, subs[k]) is not None)
    carried = "".join(ch for k, text in new_subs.items() if text is None for ch in subs[k] if ch in _CARRIED)
    current = new_subs.get(survivor, subs[survivor]) or subs[survivor]
    new_subs[survivor] = current + "".join(ch for ch in carried if ch not in current)

    end_text = new_subs.get(end.sub, subs[end.sub])
    start_line, start_column, start_sub = start
    start_text = lines[start_line].split(TAB)[start_column].split(" ")[start_sub]
    if end_text is not None and _pitch(end_text) is not None and _pitch(end_text)[0] != end.step + bottom:  # type: ignore[index]
        start_token = lines[start_line].split(TAB)[start_column]
        slur = "(" not in start_token and ")" not in lines[line].split(TAB)[column]
        new_subs[end.sub] = end_text.replace("]", ")" if slur else "")
        _set_sub(lines, start_line, start_column, start_sub, start_text.replace("[", "(" if slur else ""))
    for k in sorted(new_subs, reverse=True):
        _set_sub(lines, line, column, k, new_subs[k])
    return True


def fix_page(lines: list[str], spines: int, heads: list[Head], layout: PageLayout) -> tuple[list[str], TieReport]:
    """Sửa dấu luyến bị đọc thành dấu nối trên các dòng kern của MỘT trang (xem docstring module).

    Chỉ chạy khi số ô trên ảnh bằng số ô kern của trang. Trả ``(dòng, báo cáo)``."""
    report = TieReport()
    image = _image_measures(heads, layout, spines)
    kern = _kern_measures(lines, spines)
    if image is None or kern is None or len(image) != len(kern):
        return lines, report
    out = list(lines)
    for img, measure in zip(image, kern):
        if img is None:
            continue
        for column in range(spines):
            onsets = measure["onsets"][column]
            clusters = img[column]
            if measure["grace"][column] or not onsets or len(onsets) != len(clusters):
                continue
            wrong = [k for k, (onset, steps) in enumerate(zip(onsets, clusters)) if onset.steps != steps]
            if len(wrong) != 1:
                continue
            onset = onsets[wrong[0]]
            notes = [n for o in onsets for n in o.notes]
            bottom = _bottom_of(out, onset)
            if bottom is None:
                continue
            before = list(out)
            keys = measure["keys"][column]
            if _fix_onset(out, onset, clusters[wrong[0]], bottom, keys, notes):
                report.slurs += 1
                report.lines.extend(i for i, (a, b) in enumerate(zip(before, out)) if a != b)
    report.lines = sorted(set(report.lines))
    return out, report


def _bottom_of(lines: list[str], onset: _Onset) -> Optional[int]:
    """Bậc diatonic của dòng kẻ dưới cùng cho nốt ở thời điểm ``onset`` (vị trí khuông + bậc của nốt)."""
    note = onset.notes[0]
    sub = lines[note.line].split(TAB)[note.column].split(" ")[note.sub]
    pitch = _pitch(sub)
    return None if pitch is None else pitch[0] - note.step
