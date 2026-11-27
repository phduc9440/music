"""Làm sạch kern từng trang, ghép thành một bản kern và kiểm tra (đặc tả mục 2.3, "Ghép trang" và "Validate").

Toàn bộ là hàm thuần trên chuỗi, không cần model hay thư viện ngoài nên test được đầy đủ.

Quy ước kern dùng ở đây (Humdrum):

* Mỗi dòng là một "lát cắt thời gian", các cột (spine) cách nhau bằng dấu tab. Với piano thường có 2 spine
  ``**kern`` (khuông dưới ở cột trái, khuông trên ở cột phải).
* Dòng bắt đầu bằng ``**`` là dòng khai báo loại spine (header); ``*-`` kết thúc spine; ``*...`` là dòng diễn giải
  (khóa ``*clefG2``, dấu hóa ``*k[f#]``, khóa điệu ``*D:``, nhịp ``*M3/4``, tempo ``*MM120``);
  ``=...`` là vạch nhịp; ``!...`` là chú thích; còn lại là dòng dữ liệu (nốt, dấu lặng, ``.`` cho ô trống).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional

from app.convert import incomplete_measures

TAB = "\t"

# Dòng diễn giải mà khi sang trang mới có thể phải kế thừa từ trang trước (đặc tả: khóa/nhịp/dấu hóa)
KIND_CLEF, KIND_KEYSIG, KIND_KEY, KIND_METER = "clef", "keysig", "key", "meter"
INHERITED_KINDS = (KIND_CLEF, KIND_KEYSIG, KIND_KEY, KIND_METER)

_RE_KEY = re.compile(r"^\*([A-Ga-g])([#\-]*):$")
_RE_METER = re.compile(r"^\*M(\d+)/(\d+)")
_RE_TEMPO = re.compile(r"^\*MM(\d+(?:\.\d+)?)$")
_RE_BARLINE = re.compile(r"^=(?P<dbl>=?)(?P<num>\d*)(?P<rest>.*)$")
_RE_DURATION = re.compile(r"(\d+)(?:%(\d+))?(\.*)")

_SHARP_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "C#"]
_FLAT_KEYS = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]

MAX_WARNINGS_PER_KIND = 10


class MergeSpineMismatch(Exception):
    """Số spine của một trang khác trang đầu và không căn lại được (task FAILED ``MERGE_SPINE_MISMATCH``)."""

    def __init__(self, page_number: int, expected: int, found: int) -> None:
        super().__init__(f"trang {page_number} có {found} spine, trang đầu có {expected}")
        self.page_number = page_number
        self.expected = expected
        self.found = found


@dataclass
class PageKern:
    """Kern của một trang đã làm sạch: ``header`` là dòng ``**kern...``, ``body`` không có header và ``*-``."""

    number: int
    header: str
    body: list[str]

    @property
    def spines(self) -> int:
        return len(self.header.split(TAB))


@dataclass
class MergeResult:
    """Bản kern đã ghép cùng thông tin để kiểm tra và báo về Java."""

    text: str
    spines: int
    warnings: list[str] = field(default_factory=list)
    line_pages: list[int] = field(default_factory=list)
    """Số trang của từng dòng trong phần thân (cùng độ dài với ``lines``), để gắn cảnh báo vào đúng trang."""
    lines: list[str] = field(default_factory=list)
    """Các dòng của bản ghép, không gồm header và ``*-``."""
    header: str = ""


# ====================================================================== làm sạch từng trang


def normalize_text(text: str) -> str:
    """Chuẩn hóa chuỗi model sinh ra: xuống dòng kiểu Windows/Mac, BOM, và tab/xuống dòng viết dạng ký tự thoát."""
    text = text.replace("﻿", "").replace("\r\n", "\n").replace("\r", "\n")
    # Một số bản decode trả "\t"/"\n" dạng hai ký tự; nếu hoàn toàn không có tab/xuống dòng thật thì mở ra
    if TAB not in text and "\n" not in text:
        text = text.replace("\\t", TAB).replace("\\n", "\n")
    return text


def collapse_runaway(lines: list[str], max_repeat: int) -> tuple[list[str], int]:
    """Gộp đoạn dòng giống hệt nhau lặp liên tiếp quá ``max_repeat`` lần (model sinh lặp) về đúng 1 dòng.

    Trả ``(dòng_mới, số_dòng_đã_bỏ)``.
    """
    result: list[str] = []
    removed = 0
    index = 0
    while index < len(lines):
        end = index
        while end + 1 < len(lines) and lines[end + 1] == lines[index]:
            end += 1
        run = end - index + 1
        if run > max_repeat:
            result.append(lines[index])
            removed += run - 1
        else:
            result.extend(lines[index : end + 1])
        index = end + 1
    return result, removed


def is_data_line(line: str) -> bool:
    """Dòng dữ liệu (nốt/dấu lặng/``.``), khác dòng diễn giải, vạch nhịp, chú thích."""
    return bool(line) and line[0] not in "*=!"


_PITCH_LETTER = re.compile(r"[a-gA-G]")


def has_pitched_note(line: str) -> bool:
    """Dòng dữ liệu có ít nhất một nốt có cao độ (không tính dấu lặng ``r``, dấu ``.`` và token rỗng)."""
    if not is_data_line(line):
        return False
    for column in line.split(TAB):
        for token in column.split(" "):
            if token and token != "." and "r" not in token and _PITCH_LETTER.search(token):
                return True
    return False


def is_barline(line: str) -> bool:
    return line.startswith("=")


def clean_page(
    number: int,
    raw: str,
    max_repeat: int = 24,
    truncated: bool = False,
    allow_rests_only: bool = False,
    meter: Optional[str] = None,
) -> tuple[Optional[PageKern], list[str]]:
    """Làm sạch kern thô của một trang. Trả ``(trang, cảnh_báo)``; ``trang`` là None nếu phải bỏ trang.

    Thiếu dòng ``**kern`` thì tự dựng từ dòng diễn giải đầu tiên. Bỏ trang (kèm cảnh báo) khi không có cả hai hoặc không có dòng dữ liệu nào (đặc tả: trang rỗng).
    ``truncated=True`` (model chạm giới hạn token) thì bỏ dòng cuối vì có thể bị cắt giữa chừng. ``meter``: token ``*M..``
    đã biết của bài, dùng khi kết quả không có dòng số chỉ nhịp (ảnh một hệ, trang sau) để sửa vạch nhịp lẻ và liên ba.
    """
    warnings: list[str] = []
    lines = [ln.rstrip() for ln in normalize_text(raw).split("\n")]
    lines = [ln for ln in lines if ln.strip()]

    header_index = next((i for i, ln in enumerate(lines) if ln.startswith("**")), None)
    if header_index is not None:
        header = lines[header_index]
        body = lines[header_index + 1 :]
    else:
        # Transcoda thường bỏ dòng ``**kern`` ở đầu: bắt đầu từ dòng diễn giải đầu tiên (``*clefG2``, ``*k[...]``...)
        # và tự dựng tiêu đề theo số cột của dòng đó. Không có dòng diễn giải nào thì coi như không phải kern.
        start = next((i for i, ln in enumerate(lines) if ln.startswith("*")), None)
        if start is None:
            return None, [f"Trang {number}: kết quả nhận diện không có **kern nên đã bỏ qua trang này"]
        header = TAB.join(["**kern"] * (lines[start].count(TAB) + 1))
        body = lines[start:]

    # Cắt từ dòng kết thúc spine ``*-`` trở đi (nếu có)
    for i, ln in enumerate(body):
        if all(tok == "*-" for tok in ln.split(TAB)):
            body = body[:i]
            break

    # Model đôi khi gộp hai khuông (``*v *v``) khi chưa hề tách (``*^``): các dòng sau đó mất một cột nên kern hỏng (spine
    # đếm theo ``**kern`` ở đầu không còn khớp ``*-`` ở cuối, music21 báo không xác định được kiểu spine). Cắt từ chỗ sai;
    # trang mất ô nhịp thì bị nhận diện lại theo hệ vì số ô lệch số ô trên ảnh.
    invalid = first_invalid_join(body, len(header.split(TAB)))
    if invalid is not None:
        warnings.append(
            f"Trang {number}: model gộp spine sai ở dòng {invalid + 1} của kết quả (gộp hai khuông chưa từng tách), "
            f"đã bỏ {len(body) - invalid} dòng từ chỗ đó trở đi"
        )
        body = body[:invalid]

    known_meter = meter_value(meter)
    body, repaired = repair_partial_barlines(body, known_meter)
    if repaired:
        warnings.append(
            f"Trang {number}: model ghi {repaired} vạch nhịp chỉ ở một số khuông (các khuông khác đang giữa ô), "
            "đã sửa theo trường độ để mọi khuông có cùng số ô"
        )
    body, triplets = repair_triplets(body, known_meter)
    if triplets:
        warnings.append(
            f"Trang {number}: model đọc mất số 3 của {triplets} nhóm liên ba (ô dài quá số chỉ nhịp), "
            "đã đổi lại thành liên ba theo trường độ"
        )

    if truncated and body:
        body = body[:-1]
        warnings.append(f"Trang {number}: kết quả chạm giới hạn độ dài của model, phần cuối trang có thể bị thiếu")

    body, removed = collapse_runaway(body, max_repeat)
    if removed:
        warnings.append(f"Trang {number}: model sinh lặp, đã cắt {removed} dòng lặp")

    if not any(is_data_line(ln) for ln in body):
        return None, warnings + [f"Trang {number}: không nhận diện được nốt nào nên đã bỏ qua trang này"]
    # Model không đọc được ảnh thường sinh một dãy dấu lặng dài: coi như chưa nhận diện được nốt nào. Riêng khi đọc riêng
    # một nhóm khuông (``allow_rests_only``), toàn dấu lặng là kết quả hợp lệ (khuông giọng trong đoạn dạo đầu).
    if not allow_rests_only and not any(has_pitched_note(ln) for ln in body):
        return None, warnings + [
            f"Trang {number}: kết quả chỉ có dấu lặng, không có nốt nào nên đã bỏ qua trang này "
            "(ảnh có thể bị nhiễu, dính viền hoặc quá mờ)"
        ]
    return PageKern(number=number, header=header, body=body), warnings


# ====================================================================== vạch nhịp chỉ có ở một số spine


_SPINE_CHANGES = ("*^", "*v", "*+", "*x", "*-")


def _is_partial_barline(line: str) -> bool:
    fields = line.split(TAB)
    if len(fields) < 2:
        return False
    bars = [f.startswith("=") for f in fields]
    return any(bars) and not all(bars)


def repair_partial_barlines(body: list[str], meter: Optional[Fraction] = None) -> tuple[list[str], int]:
    """Sửa dòng có vạch nhịp ở một số spine còn spine khác là ``.`` hay một nốt (kern không hợp lệ).

    Transcoda thỉnh thoảng ghi vạch nhịp cho một khuông (hay gặp ở khuông giọng hát của bản giọng hát + piano, hoặc tay
    phải piano) trong khi khuông khác chưa tới vạch hoặc bỏ sót vạch. music21 khi đó dựng mỗi part một số ô khác nhau, các
    ô sau lệch nhau và ô thiếu được để trống ở cuối; số ô kern cũng lệch số ô đếm trên ảnh nên trang bị nhận diện lại
    không cần thiết.

    Với mỗi dòng như vậy thử ba cách: vạch đủ mọi spine đặt *trước* các nốt trên dòng, đặt *sau* các nốt, hoặc bỏ vạch
    lẻ; chọn cách làm ít ô (tính riêng từng spine, giữa hai vạch đủ gần nhất) sai tổng trường độ nhất, hòa thì ưu tiên giữ
    vạch (model hiếm khi thấy vạch nhịp ở chỗ không có). Bỏ qua khi chưa biết số chỉ nhịp hoặc đoạn liên quan có tách/gộp
    spine. Trả ``(thân_kern, số_dòng_đã_sửa)``.
    """
    lines = list(body)
    fixed = 0
    index = 0
    while index < len(lines):
        if not _is_partial_barline(lines[index]):
            index += 1
            continue
        replacement = _resolve_partial_barline(lines, index, meter)
        if replacement is None:
            index += 1
            continue
        lines[index : index + 1] = replacement
        fixed += 1
        index += max(1, len(replacement))
    return lines, fixed


def _spine_measure_totals(lines: list[str], width: int) -> list[list[Fraction]]:
    """Tổng trường độ từng ô của từng spine, mỗi spine tự ngắt ô theo vạch nhịp của chính nó (``[spine][ô]``)."""
    totals: list[list[Fraction]] = [[Fraction(0)] for _ in range(width)]
    for line in lines:
        if line.startswith("!") or line.startswith("*"):
            continue
        tokens = line.split(TAB)
        if len(tokens) != width:
            continue
        for column, token in enumerate(tokens):
            if token.startswith("="):
                totals[column].append(Fraction(0))
            else:
                duration = token_duration(token)
                if duration is not None:
                    totals[column][-1] += duration
    return totals


def _page_meter(lines: list[str], index: int, width: int, default: Optional[Fraction] = None) -> Optional[Fraction]:
    """Số chỉ nhịp có hiệu lực ở dòng ``index``. Kern không có ``*M`` (trang sau của bản nhiều trang, ảnh một hệ) thì dùng
    ``default`` (số chỉ nhịp đã biết của bài), không có nữa mới lấy tổng trường độ ô phổ biến nhất nếu đếm được ít nhất
    3 ô và nó chiếm ít nhất một nửa."""
    for line in reversed(lines[:index]):
        if line.startswith("*"):
            meter = next((m for m in map(_meter_fraction, line.split(TAB)) if m is not None), None)
            if meter is not None:
                return meter
    if default is not None:
        return default
    counts: dict[Fraction, int] = {}
    for spine in _spine_measure_totals(lines, width):
        for total in spine[1:-1]:  # bỏ ô đầu/cuối trang (có thể dở dang)
            if total > 0:
                counts[total] = counts.get(total, 0) + 1
    if sum(counts.values()) < 3:
        return None
    best = max(counts, key=lambda k: counts[k])
    return best if counts[best] * 2 >= sum(counts.values()) else None


def meter_value(token: Optional[str]) -> Optional[Fraction]:
    """Giá trị (nốt tròn) của token ``*M3/4``; None nếu không phải."""
    return _meter_fraction(token) if token else None


def _resolve_partial_barline(lines: list[str], index: int, default: Optional[Fraction] = None) -> Optional[list[str]]:
    fields = lines[index].split(TAB)
    width = len(fields)
    meter = _page_meter(lines, index, width, default)
    if meter is None or meter <= 0:
        return None
    start = next((k for k in range(index - 1, -1, -1) if is_barline(lines[k]) and not _is_partial_barline(lines[k])), -1)
    end = next((k for k in range(index + 1, len(lines)) if is_barline(lines[k]) and not _is_partial_barline(lines[k])), len(lines))
    for k in range(start + 1, end):
        if lines[k].startswith("!"):
            continue
        if len(lines[k].split(TAB)) != width:
            return None
        if lines[k].startswith("*") and any(t in _SPINE_CHANGES for t in lines[k].split(TAB)):
            return None

    bar_token = next(f for f in fields if f.startswith("="))
    bar_row = TAB.join([bar_token] * width)
    has_notes = any(not f.startswith("=") and f != "." for f in fields)
    notes_row = TAB.join("." if f.startswith("=") else f for f in fields)
    options: list[list[str]] = [[bar_row, notes_row] if has_notes else [bar_row]]
    if has_notes:
        options.append([notes_row, bar_row])
    options.append([notes_row] if has_notes else [])

    first_of_page, last_of_page = start < 0, end >= len(lines)

    def penalty(option: list[str]) -> Fraction:
        # Tổng độ lệch trường độ (theo số chỉ nhịp) của mọi ô mọi spine, không phải số ô sai: gộp hai ô vốn đã lệch ở
        # piano thành một không được "lợi" (khuông giọng đúng sẽ thành ô dài gấp đôi, lệch nguyên một nhịp).
        segment = lines[start + 1 : index] + option + lines[index + 1 : end]
        bad = Fraction(0)
        totals = _spine_measure_totals(segment, width)
        for spine in totals:
            for position, total in enumerate(spine):
                if total == 0 or total == meter:
                    continue
                # ô đầu trang (lấy đà) / cuối trang (bị cắt) được phép ngắn hơn
                if total < meter and ((position == 0 and first_of_page) or (position == len(spine) - 1 and last_of_page)):
                    continue
                bad += abs(total - meter) / meter
        # mọi spine phải có cùng số ô trong đoạn: lệch số ô nặng hơn một ô sai trường độ
        counts = {len(spine) for spine in totals}
        return bad + 2 * (len(counts) - 1)

    scores = [penalty(option) for option in options]
    return options[scores.index(min(scores))]


# ====================================================================== liên ba bị đọc thành nốt thường


_TRIPLET_KINDS = (("16", "24", Fraction(1, 8)), ("8", "12", Fraction(1, 4)))
"""``(trường độ đọc nhầm, trường độ liên ba, độ dài một nhóm liên ba = ô lưới phách con)``."""

_MAX_TRIPLETS = 6
_MAX_SOLUTIONS = 2


def repair_triplets(body: list[str], default_meter: Optional[Fraction] = None) -> tuple[list[str], int]:
    """Đổi các nhóm liên ba mà model đọc mất số 3 (ba nốt móc kép ``16`` thay vì ``24``, ba nốt móc đơn ``8`` thay vì ``12``).

    Mỗi nhóm ba nốt như vậy làm ô dài thêm đúng 1/16 (móc kép) hoặc 1/8 (móc đơn). Với từng ô, từng spine dài hơn số chỉ
    nhịp đúng ``n`` lần lượng đó, tìm ``n`` nhóm ba nốt liền nhau (cùng trường độ, không chấm dôi, có thể là dấu lặng hay hợp
    âm) sao cho mỗi nhóm, sau khi đổi, bắt đầu đúng ô lưới của phách con (1/8 với móc kép, 1/4 với móc đơn) và ô vừa khít
    số chỉ nhịp. Chỉ sửa khi có ĐÚNG MỘT cách chọn như vậy. Ô đang tách/gộp spine thì bỏ qua. Trả ``(thân_kern, số_nhóm)``.
    """
    lines = list(body)
    fixed = 0
    start = 0
    for end in [i for i, line in enumerate(lines) if is_barline(line)] + [len(lines)]:
        rows = [i for i in range(start, end) if is_data_line(lines[i])]
        widths = {len(lines[i].split(TAB)) for i in rows}
        changes = any(
            lines[i].startswith("*") and any(t in _SPINE_CHANGES for t in lines[i].split(TAB)) for i in range(start, end)
        )
        if rows and len(widths) == 1 and not changes:
            width = widths.pop()
            # Số chỉ nhịp có hiệu lực ở dòng nốt đầu tiên của ô: ô đổi nhịp có dòng *M ngay sau vạch nhịp (Giấc Mơ Trưa
            # ô 16, 21: 2/4 giữa bài 4/4), đọc từ vạch nhịp thì vẫn lấy *M4/4 cũ và bỏ qua nhóm liên ba bị mất số 3
            meter = _page_meter(lines, rows[0], width, default_meter)
            if meter is not None and meter > 0:
                totals = [_spine_total(lines, rows, column) for column in range(width)]
                contents = [_spine_content(lines, rows, column) for column in range(width)]
                for column in range(width):
                    excess = totals[column] - meter
                    # spine KHÁC (không phải bản sao của nó) cũng dài dư đúng chừng ấy: lỗi cấu trúc (ô gộp/đọc thừa)
                    if excess > 0 and any(
                        totals[c] - meter == excess and contents[c] != contents[column] for c in range(width) if c != column
                    ):
                        continue
                    fixed += _repair_triplets_in_spine(lines, rows, column, meter)
        start = end + 1
    return lines, fixed


def _repair_triplets_in_spine(lines: list[str], rows: list[int], column: int, meter: Fraction) -> int:
    tokens: list[tuple[int, str, Fraction]] = []
    for index in rows:
        token = lines[index].split(TAB)[column]
        if token == ".":
            continue
        duration = token_duration(token)
        if duration is None:
            continue  # nốt hoa mỹ, token lạ
        tokens.append((index, token, duration))
    total = sum((d for _, _, d in tokens), Fraction(0))
    excess = total - meter
    if excess <= 0:
        return 0
    for wrong, right, cell in _TRIPLET_KINDS:
        saving = Fraction(1, int(wrong)) * 3 - cell
        groups = excess / saving
        if groups.denominator != 1 or not 1 <= groups <= _MAX_TRIPLETS:
            continue
        eligible = [_plain_duration(token) == wrong for _, token, _ in tokens]
        solutions: list[list[int]] = []

        def search(position: int, onset: Fraction, chosen: list[int]) -> None:
            if len(solutions) >= _MAX_SOLUTIONS:
                return
            if len(chosen) == groups:
                solutions.append(list(chosen))
                return
            if position > len(tokens) - 3:
                return
            if all(eligible[position : position + 3]) and onset % cell == 0:
                chosen.append(position)
                search(position + 3, onset + cell, chosen)
                chosen.pop()
            search(position + 1, onset + tokens[position][2], chosen)

        search(0, Fraction(0), [])
        if len(solutions) != 1 or 3 * len(solutions[0]) * 4 > 3 * len(tokens):
            continue  # nhiều cách chọn, hoặc phải đổi quá 3/4 số nốt của ô: không đủ chắc là liên ba
        for first in solutions[0]:
            for index, token, _ in tokens[first : first + 3]:
                cells = lines[index].split(TAB)
                cells[column] = " ".join(_retime(sub, wrong, right) for sub in token.split(" "))
                lines[index] = TAB.join(cells)
        return len(solutions[0])
    return 0


def _spine_total(lines: list[str], rows: list[int], column: int) -> Fraction:
    total = Fraction(0)
    for index in rows:
        token = lines[index].split(TAB)[column]
        if token != ".":
            total += token_duration(token) or Fraction(0)
    return total


def _spine_content(lines: list[str], rows: list[int], column: int) -> tuple[str, ...]:
    return tuple(_RE_NOT_MUSIC.sub("", lines[i].split(TAB)[column]) for i in rows if lines[i].split(TAB)[column] != ".")


def _plain_duration(token: str) -> Optional[str]:
    """Số trường độ (``16``, ``8``...) của token nếu mọi nốt trong nó cùng một trường độ không chấm dôi; None nếu không."""
    values = set()
    for sub in token.split(" "):
        if not sub:
            continue
        if "q" in sub or "Q" in sub:
            return None
        match = _RE_DURATION.search(sub)
        if match is None or match.group(2) or match.group(3):
            return None
        values.add(match.group(1))
    return values.pop() if len(values) == 1 else None


def _retime(sub: str, wrong: str, right: str) -> str:
    match = _RE_DURATION.search(sub)
    if match is None or match.group(1) != wrong:
        return sub
    return sub[: match.start(1)] + right + sub[match.end(1) :]


# ====================================================================== spine trùng lặp


_RE_NOT_MUSIC = re.compile(r"[LJKk\[\]_(){}/\\;'<>]")
"""Ký hiệu không ảnh hưởng nốt (beam, dấu nối, luyến, hướng thân) bỏ khi so hai spine."""

DUPLICATE_SIMILARITY = 0.75
"""Hai spine giống nhau ở ít nhất tỉ lệ này số dòng dữ liệu (có nốt ở ít nhất một bên) thì coi là bản sao."""


def collapse_duplicate_spines(page: PageKern, target: int) -> Optional[PageKern]:
    """Gộp các spine model sinh lặp lại về đúng ``target`` spine; None nếu không làm được.

    Đọc riêng MỘT khuông (khuông giọng cắt khỏi bản giọng hát + piano) Transcoda hay sinh hai spine gần như giống hệt
    nhau, vì nó chỉ được train trên piano hai khuông. Pipeline cần đúng một spine nên trước đây bỏ cả kết quả (vốn đọc
    tốt) rồi độn khuông trống, đẩy giai điệu sang cột piano. Ở đây các spine liền nhau giống nhau ít nhất
    :data:`DUPLICATE_SIMILARITY` số dòng (bỏ beam/dấu nối/luyến khi so) được gộp, giữ spine có nhiều nốt hơn. Chỉ trả kết
    quả khi số nhóm còn lại đúng bằng ``target`` và không có tách/gộp spine giữa chừng."""
    width = page.spines
    if width <= target:
        return None
    body = list(page.body)
    # dòng tách/gộp spine thừa ở cuối kết quả (sau nốt cuối cùng, model dừng giữa chừng) thì bỏ
    last = max((i for i, line in enumerate(body) if is_data_line(line) or is_barline(line)), default=-1)
    body = body[: last + 1] + [ln for ln in body[last + 1 :] if not any(t in _SPINE_CHANGES for t in ln.split(TAB))]
    for line in body:
        if line.startswith("*") and any(t in _SPINE_CHANGES for t in line.split(TAB)):
            return None
    rows = [line.split(TAB) for line in body if is_data_line(line)]
    if not rows or any(len(r) != width for r in rows):
        return None

    def similar(a: int, b: int) -> float:
        compared = same = 0
        for row in rows:
            x, y = row[a], row[b]
            if x == "." and y == ".":
                continue
            compared += 1
            same += _RE_NOT_MUSIC.sub("", x) == _RE_NOT_MUSIC.sub("", y)
        return same / compared if compared else 0.0

    groups: list[list[int]] = []
    for column in range(width):
        if groups and similar(groups[-1][0], column) >= DUPLICATE_SIMILARITY:
            groups[-1].append(column)
        else:
            groups.append([column])
    if len(groups) != target:
        return None

    def notes(column: int) -> int:
        return sum(1 for row in rows if row[column] != "." and _PITCH_LETTER.search(row[column]))

    keep = [max(group, key=notes) for group in groups]

    def pick(line: str) -> str:
        fields = line.split(TAB)
        return TAB.join(fields[c] for c in keep) if len(fields) == width else line

    return PageKern(number=page.number, header=pick(page.header), body=[pick(line) for line in body])


# ====================================================================== phân loại dòng diễn giải


def classify(token: str) -> Optional[str]:
    """Loại của một token diễn giải cần kế thừa giữa các trang, hoặc None."""
    if token.startswith("*clef"):
        return KIND_CLEF
    if token.startswith("*k["):
        return KIND_KEYSIG
    if _RE_KEY.match(token):
        return KIND_KEY
    if _RE_METER.match(token):
        return KIND_METER
    return None


def _is_interpretation(line: str) -> bool:
    return line.startswith("*") and not line.startswith("**")


class _State:
    """Khóa, dấu hóa, khóa điệu, nhịp đang hiệu lực của từng spine."""

    def __init__(self, spines: int) -> None:
        self.spines = spines
        self.values: dict[str, list[Optional[str]]] = {k: [None] * spines for k in INHERITED_KINDS}

    def update(self, line: str) -> None:
        """Cập nhật từ một dòng diễn giải. Chỉ xét dòng đúng số cột (bỏ qua khi đang tách/gộp spine)."""
        fields = line.split(TAB)
        if len(fields) != self.spines:
            return
        for index, token in enumerate(fields):
            kind = classify(token)
            if kind:
                self.values[kind][index] = token

    def is_redundant(self, line: str) -> bool:
        """Dòng chỉ lặp lại đúng giá trị đang hiệu lực (ví dụ mỗi trang in lại khóa nhạc) thì không cần giữ."""
        fields = line.split(TAB)
        if len(fields) != self.spines:
            return False
        seen = False
        for index, token in enumerate(fields):
            if token == "*":
                continue
            kind = classify(token)
            if kind is None or self.values[kind][index] != token:
                return False
            seen = True
        return seen

    def inherited_lines(self, present: set[str]) -> list[str]:
        """Các dòng diễn giải còn thiếu ở đầu trang mới (loại nào không có trong ``present`` mà trước đó có giá trị)."""
        lines = []
        for kind in INHERITED_KINDS:
            if kind in present:
                continue
            values = self.values[kind]
            if any(v is not None for v in values):
                lines.append(TAB.join(v if v is not None else "*" for v in values))
        return lines


def _prologue_length(body: list[str]) -> int:
    """Số dòng đầu thân trang là dòng diễn giải (tới dòng dữ liệu hoặc vạch nhịp đầu tiên)."""
    for i, ln in enumerate(body):
        if not _is_interpretation(ln):
            return i
    return len(body)


# ====================================================================== căn lại số spine


def _filler(line: str) -> str:
    if line.startswith("**"):
        return "**kern"
    if line.startswith("*"):
        return "*"
    if line.startswith("="):
        return line.split(TAB)[0]
    if line.startswith("!"):
        return "!"
    return "."


def align_spines(page: PageKern, target: int) -> Optional[PageKern]:
    """Căn một trang về ``target`` spine: bỏ bớt cột thừa bên phải, hoặc thêm cột trống bên phải (``.``/``*``).

    Chỉ làm được khi mọi dòng của trang có cùng số cột (không tách/gộp spine); ngược lại trả None.
    """
    width = page.spines
    rows = [page.header] + page.body
    if any(len(r.split(TAB)) != width for r in rows):
        return None

    def fit(row: str) -> str:
        fields = row.split(TAB)
        if width > target:
            return TAB.join(fields[:target])
        return TAB.join(fields + [_filler(row)] * (target - width))

    return PageKern(number=page.number, header=fit(page.header), body=[fit(r) for r in page.body])


# ====================================================================== sửa đoạn tách spine không khớp


def _find_join(lines: list[str], start: int, width: int, column: int) -> Optional[int]:
    """Chỉ số dòng ``*v`` gộp lại đúng hai cột ``column``, ``column + 1`` của đoạn tách bắt đầu ở ``start``; None nếu đoạn
    không đơn giản (có vạch nhịp, đổi số cột, tách tiếp...)."""
    for k in range(start + 1, len(lines)):
        line = lines[k]
        if is_barline(line):
            return None
        fields = line.split(TAB)
        if len(fields) != width + 1:
            return None
        if _is_interpretation(line):
            if fields[column] == "*v" and fields[column + 1] == "*v" and all(
                t == "*" for i, t in enumerate(fields) if i not in (column, column + 1)
            ):
                return k
            if any(t in ("*^", "*v") for t in fields):
                return None
    return None


def repair_split_segments(lines: list[str], line_pages: list[int]) -> list[str]:
    """Sửa đoạn một spine tách đôi (``*^`` ... ``*v``) mà hai giọng dài không bằng nhau (model hay thừa/thiếu một nốt).

    Triệu chứng: dòng ``.`` ở một giọng khi giọng đó đã hết nốt (viewer báo "missing note in field 2"), hoặc hai giọng kết
    thúc ở hai thời điểm khác nhau. Thời điểm từng dòng tính theo trục thời gian Humdrum của cả ô (mọi cột, kể cả nốt của
    khuông khác chen giữa hai nốt dài của đoạn tách).

    Trường hợp hay gặp nhất là model **gộp quá sớm**: viết ``*v`` ngay khi giọng ngắn hết nốt rồi viết tiếp nốt của giọng
    đó sau chỗ gộp, trong khi nốt dài của giọng kia còn đang ngân (cách đọc Humdrum vẫn đúng, nhưng music21 dồn các nốt
    sau chỗ gộp ra sau nốt dài, làm khuông đó lệch nhịp và ô dài quá số chỉ nhịp). Khi các nốt sau chỗ gộp nối tiếp giọng
    ngắn tới đúng lúc nốt dài kết thúc, chỗ gộp được dời xuống đó (giọng dài nhận ``.``): không nốt nào bị đổi.

    Còn lại: độ dài đúng của đoạn lấy theo số chỉ nhịp trừ phần đứng trước đoạn tách trong cùng ô nhịp (nếu biết và khớp
    một trong hai giọng), không thì lấy giọng ngắn hơn. Giọng dài hơn bị cắt các dòng quá thời điểm đó; giọng ngắn hơn được
    thêm dấu lặng nếu độ dài thiếu biểu diễn được là ``1/n``. Sửa trực tiếp ``lines`` và ``line_pages``, trả danh sách
    cảnh báo.
    """
    warnings: list[str] = []
    meter: Optional[Fraction] = None
    measure_number: Optional[int] = None
    measure_start = 0
    seen_barline = False
    split_in_measure = False
    i = 0
    while i < len(lines):
        line = lines[i]
        if is_barline(line):
            match = _RE_BARLINE.match(line.split(TAB)[0])
            measure_number = int(match.group("num")) if match and match.group("num") else None
            measure_start, seen_barline, split_in_measure = i + 1, True, False
        elif _is_interpretation(line):
            fields = line.split(TAB)
            for token in fields:
                value = _meter_fraction(token)
                if value is not None:
                    meter = value
            if fields.count("*^") == 1 and all(t in ("*", "*^") for t in fields):
                column = fields.index("*^")
                end = _find_join(lines, i, len(fields), column)
                if end is not None:
                    budget = None
                    if meter is not None and seen_barline and not split_in_measure:
                        before = [
                            token_duration(row.split(TAB)[column])
                            for row in lines[measure_start:i]
                            if is_data_line(row) and len(row.split(TAB)) == len(fields)
                        ]
                        budget = meter - sum((d for d in before if d is not None), Fraction(0))
                    start = measure_start if seen_barline else 0
                    removed, message = _repair_one_segment(lines, line_pages, i, end, column, budget, start, meter)
                    if message:
                        where = f"ô nhịp {measure_number}" if measure_number is not None else "một ô nhịp"
                        warnings.append(f"Trang {line_pages[i]}, {where}: {message}")
                    i = end - removed
                split_in_measure = True
        i += 1
    return warnings


def _segment_times(
    lines: list[str], start: int, end: int, measure_start: int
) -> tuple[list[int], list[Fraction]]:
    """Các dòng dữ liệu của đoạn tách ``lines[start..end]`` và thời điểm của chúng, tính từ đầu đoạn tách.

    Dùng trục thời gian Humdrum từ đầu ô (``measure_start``) để biết cả nốt của khuông khác bắt đầu trước đoạn tách; không
    chạy được thì tính từ chính dòng ``*^`` (nốt vang từ trước đoạn tách không được biết tới)."""
    rows = [k for k in range(start + 1, end) if is_data_line(lines[k])]
    for first in (measure_start, start):
        width = next((len(lines[k].split(TAB)) for k in range(first, end) if not lines[k].startswith("!")), 0)
        track = timeline(lines[first:end], width) if width else None
        if track is None:
            continue
        times = [track.times[k - first] for k in rows]
        if any(t is None for t in times):
            continue
        origin = times[0] if times else Fraction(0)
        return rows, [t - origin for t in times]  # type: ignore[operator]
    # Không chạy được trục thời gian (dòng lệch cột...): chỉ dựa vào hai giọng như trước
    following = [Fraction(0), Fraction(0)]
    column = lines[start].split(TAB).index("*^")
    times: list[Fraction] = []
    now = Fraction(0)
    for k in rows:
        fields = lines[k].split(TAB)
        times.append(now)
        for voice in (0, 1):
            duration = token_duration(fields[column + voice]) if fields[column + voice] != "." else None
            if duration is not None:
                following[voice] = now + duration
        later = [t for t in following if t > now]
        now = min(later) if later else now
    return rows, times


def _defer_join(
    lines: list[str], line_pages: list[int], end: int, column: int, following: list[Fraction], meter: Optional[Fraction],
    measure_start: int,
) -> bool:
    """Dời dòng ``*v`` (chỉ số ``end``) xuống sau các nốt mà model viết tiếp cho giọng ngắn sau chỗ gộp, tới đúng lúc nốt
    dài của giọng kia kết thúc. Trả True nếu đã dời (sửa trực tiếp ``lines``/``line_pages``)."""
    short = 0 if following[0] < following[1] else 1
    stop_at = max(following)
    now = min(following)
    width = len(lines[end].split(TAB)) - 1  # số cột sau chỗ gộp
    absorbed: list[int] = []
    k = end + 1
    while k < len(lines):
        line = lines[k]
        if is_barline(line) or line.startswith("*"):
            break
        fields = line.split(TAB)
        if line.startswith("!") or len(fields) != width:
            return False
        token = fields[column]
        if token != ".":
            if now >= stop_at:
                break
            duration = token_duration(token)
            if duration is None:
                return False
            now += duration
            if now > stop_at:
                return False  # nốt của giọng ngắn vắt qua lúc nốt dài kết thúc: không có chỗ gộp gọn
        absorbed.append(k)
        k += 1
    if not absorbed or now != stop_at:
        return False

    rows = []
    for index in absorbed:
        fields = lines[index].split(TAB)
        voices = [fields[column], "."] if short == 0 else [".", fields[column]]
        rows.append(TAB.join(fields[:column] + voices + fields[column + 1 :]))
    candidate = lines[:end] + rows + [lines[end]] + lines[absorbed[-1] + 1 :]
    if meter is not None:
        closing = next((j for j in range(end, len(candidate)) if is_barline(candidate[j])), len(candidate))
        segment = candidate[measure_start:closing]
        width_at_start = next((len(row.split(TAB)) for row in segment if not row.startswith("!")), 0)
        if measure_length(segment, width_at_start) != meter:
            return False
    join_page = line_pages[end]
    pages = line_pages[:end] + [line_pages[i] for i in absorbed] + [join_page] + line_pages[absorbed[-1] + 1 :]
    lines[:] = candidate
    line_pages[:] = pages
    return True


def _repair_one_segment(
    lines: list[str],
    line_pages: list[int],
    start: int,
    end: int,
    column: int,
    budget: Optional[Fraction],
    measure_start: int = 0,
    meter: Optional[Fraction] = None,
) -> tuple[int, str]:
    """Sửa một đoạn tách ``lines[start..end]``. Trả ``(số dòng đã xóa, thông báo)``; thông báo rỗng nếu không cần sửa."""
    rows, times = _segment_times(lines, start, end, measure_start)
    following = [Fraction(0), Fraction(0)]  # thời điểm nốt cuối của từng giọng kết thúc (tính từ đầu đoạn tách)
    dangling = False
    for k, now in zip(rows, times):
        fields = lines[k].split(TAB)
        for voice in (0, 1):
            token = fields[column + voice]
            if token == ".":
                if now >= following[voice]:
                    dangling = True
                continue
            duration = token_duration(token)
            if duration is not None:
                following[voice] = now + duration
    if not dangling and following[0] == following[1]:
        return 0, ""
    if not dangling and _defer_join(lines, line_pages, end, column, following, meter, measure_start):
        return 0, "model gộp hai giọng của đoạn tách khi nốt dài còn đang ngân, đã dời chỗ gộp xuống sau nốt đó"

    target = budget if budget is not None and budget in following else min(following)
    drop = [k for k, t in zip(rows, times) if t >= target]
    for k in reversed(drop):
        del lines[k]
        del line_pages[k]
    removed = len(drop)

    padded = 0
    for voice in (0, 1):
        missing = target - following[voice]
        if missing <= 0 or missing.numerator != 1:
            continue
        for k, t in zip(rows, times):
            if t == following[voice] and k not in drop:
                shift = sum(1 for d in drop if d < k)
                fields = lines[k - shift].split(TAB)
                if fields[column + voice] == ".":
                    fields[column + voice] = f"{missing.denominator}r"
                    lines[k - shift] = TAB.join(fields)
                    padded += 1
                break
    parts = []
    if removed:
        parts.append(f"đã cắt {removed} dòng thừa")
    if padded:
        parts.append(f"đã thêm {padded} dấu lặng")
    detail = ", ".join(parts) if parts else "không tự sửa được"
    return removed, f"hai giọng trong đoạn tách có độ dài khác nhau, {detail}"


# ====================================================================== dấu nối (tie) thiếu đầu hoặc cuối


_RE_TIE_PITCH = re.compile(r"([a-gA-G])\1*[#\-n]*")
_TIE_STARTS = ("[", "_")
_TIE_ENDS = ("]", "_")


def _tie_pitch(sub: str) -> Optional[str]:
    """Cao độ của một nốt kern để so dấu nối (chữ cái + dấu hóa, bỏ dấu bình ``n``); None với dấu lặng/nốt hoa mỹ."""
    if not sub or sub == "." or "r" in sub or "q" in sub or "Q" in sub:
        return None
    match = _RE_TIE_PITCH.search(sub)
    return match.group(0).replace("n", "") if match else None


def _with_tie_mark(sub: str, mark: str) -> str:
    """Thêm ``[`` hoặc ``]`` ngay sau cao độ (cách Transcoda viết: ``2a[``, ``8a]L``)."""
    match = _RE_TIE_PITCH.search(sub)
    return sub + mark if match is None else sub[: match.end()] + mark + sub[match.end() :]


def repair_ties(lines: list[str]) -> list[int]:
    """Sửa dấu nối (tie) lẻ, sửa trực tiếp ``lines``; trả chỉ số các dòng đã sửa.

    Dấu nối chỉ nối hai nốt *cùng cao độ* liền nhau trong một spine. Model hay ghi thiếu một đầu: ``2b- 8b-]`` (thiếu
    ``[``), ``2a[ 8a`` (thiếu ``]``); music21 khi đó ghi ``<tie type="stop">`` mồ côi hoặc dấu nối treo, trình phát và
    trình sửa hiểu khác nhau. Với mỗi cặp nốt liền nhau trong cùng cột:

    * nốt sau có ``]`` mà nốt trước cùng cao độ chưa có ``[``: thêm ``[`` cho nốt trước;
    * nốt trước có ``[`` mà nốt sau cùng cao độ chưa có ``]``: thêm ``]`` cho nốt sau;
    * ``[`` và ``]`` nối hai nốt khác cao độ (``4b[ 8.a#]``): đó là dấu luyến bị đọc thành dấu nối, đổi thành ``(``/``)``;
    * còn lại, không có nốt cùng cao độ ở phía bên kia (dấu lặng, hết bài...): bỏ đầu nối lẻ đó.

    Hợp âm xét từng nốt; nốt hoa mỹ bỏ qua. Không phán xét qua chỗ tách/gộp spine (thứ tự cột thay đổi): dấu nối vắt qua
    chỗ đó được giữ nguyên.
    """
    changed: set[int] = set()
    unknown = (-1, -1)  # sau chỗ đổi cấu trúc spine: không biết nốt trước là nốt nào
    previous: list[Optional[tuple[int, int]]] = []  # (dòng, cột) của nốt/dấu lặng gần nhất trong từng cột
    width: Optional[int] = None

    def subs_at(where: tuple[int, int]) -> list[str]:
        return lines[where[0]].split(TAB)[where[1]].split(" ")

    def store(where: tuple[int, int], subs: list[str]) -> None:
        fields = lines[where[0]].split(TAB)
        new = " ".join(subs)
        if fields[where[1]] != new:
            fields[where[1]] = new
            lines[where[0]] = TAB.join(fields)
            changed.add(where[0])

    def drop_open_ends(where: Optional[tuple[int, int]]) -> None:
        """Bỏ đầu nối ``[`` không có nốt nối tới (``_`` thành ``]``)."""
        if where is None or where == unknown:
            return
        subs = subs_at(where)
        fixed = [sub.replace("[", "").replace("_", "]") if _tie_pitch(sub) else sub for sub in subs]
        store(where, fixed)

    for index, line in enumerate(lines):
        if not line or line.startswith("!") or is_barline(line):
            continue
        fields = line.split(TAB)
        if line.startswith("*"):
            if width is not None and (width != len(fields) or any(t in _SPINE_CHANGES for t in fields)):
                previous = [unknown] * len(fields)  # đổi cấu trúc spine: không phán xét qua chỗ này
            elif width is None:
                previous = [None] * len(fields)
            width = len(fields)
            continue
        if width != len(fields):
            previous = [unknown if width is not None else None] * len(fields)
            width = len(fields)
        for column, token in enumerate(fields):
            if token == "." or all("q" in sub or "Q" in sub for sub in token.split(" ")):
                continue
            here = (index, column)
            current = token.split(" ")
            before = previous[column]
            if before == unknown:
                previous[column] = here
                continue
            prior = subs_at(before) if before is not None else []
            prior_pitches = {_tie_pitch(sub): k for k, sub in enumerate(prior) if _tie_pitch(sub)}
            current_pitches = {_tie_pitch(sub): k for k, sub in enumerate(current) if _tie_pitch(sub)}
            if before is not None:
                # Một đầu "[" và một đầu "]" nối hai nốt khác cao độ: model đọc dấu luyến thành dấu nối, đổi lại thành luyến
                loose_start = [k for p, k in prior_pitches.items() if "[" in prior[k] and p not in current_pitches]
                loose_end = [k for p, k in current_pitches.items() if "]" in current[k] and p not in prior_pitches]
                if len(loose_start) == 1 and len(loose_end) == 1:
                    k, other = loose_start[0], loose_end[0]
                    slur = "(" not in " ".join(prior) and ")" not in " ".join(current)
                    prior[k] = prior[k].replace("[", "(" if slur else "")
                    current[other] = current[other].replace("]", ")" if slur else "")
                for pitch, k in prior_pitches.items():
                    if not any(mark in prior[k] for mark in _TIE_STARTS):
                        continue
                    other = current_pitches.get(pitch)
                    if other is None:
                        prior[k] = prior[k].replace("[", "").replace("_", "]")  # nối tới nốt khác cao độ: bỏ
                    elif not any(mark in current[other] for mark in _TIE_ENDS):
                        current[other] = _with_tie_mark(current[other], "]")  # thiếu đầu cuối
            for pitch, k in current_pitches.items():
                if not any(mark in current[k] for mark in _TIE_ENDS):
                    continue
                other = prior_pitches.get(pitch)
                if other is None:
                    current[k] = current[k].replace("]", "").replace("_", "[")  # không có nốt nào để nối từ: bỏ
                elif not any(mark in prior[other] for mark in _TIE_STARTS):
                    prior[other] = _with_tie_mark(prior[other], "[")  # thiếu đầu nối
            if before is not None:
                store(before, prior)
            store(here, current)
            previous[column] = here
    for where in previous:
        drop_open_ends(where)
    return sorted(changed)


# ====================================================================== ghép


def _fit_row(row: str, delta: int) -> str:
    """Thêm ``delta`` cột trống bên phải một dòng (``delta`` < 0: bỏ bớt cột bên phải). Không cần dòng đủ cột."""
    fields = row.split(TAB)
    if delta > 0:
        return TAB.join(fields + [_filler(row)] * delta)
    return TAB.join(fields[:delta]) if len(fields) > -delta else row


def align_pages_leniently(pages: list[PageKern]) -> tuple[list[PageKern], int, list[str]]:
    """Căn mọi trang về số spine phổ biến nhất (hòa thì lấy số lớn hơn) bằng cách thêm/bỏ cột bên phải.

    Dùng cho kết quả của model thật: có khi một trang bị đọc thiếu một khuông (ví dụ chỉ 2 spine trong khi các trang
    khác có 3). Thứ tự spine của kern là từ khuông dưới lên trên, nên khuông bị thiếu thường là khuông trên cùng, tức cột
    bên phải. Khác :func:`align_spines`, không yêu cầu mọi dòng cùng số cột (trang có thể tách/gộp spine giữa chừng).
    Cột thêm vào không để trống hoàn toàn (xem :func:`pad_page`) để music21 vẫn dựng đủ ô nhịp và khóa nhạc cho khuông đó.
    Trả ``(trang_đã_căn, số_spine_chuẩn, cảnh_báo)``.
    """
    counts: dict[int, int] = {}
    for page in pages:
        counts[page.spines] = counts.get(page.spines, 0) + 1
    base = max(counts, key=lambda width: (counts[width], width))
    references = spine_references([p for p in pages if p.spines == base], base)
    warnings: list[str] = []
    result: list[PageKern] = []
    for page in pages:
        delta = base - page.spines
        if delta == 0:
            result.append(page)
            continue
        if delta > 0:
            warnings.append(
                f"Trang {page.number}: chỉ đọc được {page.spines} spine trong khi các trang khác có {base}, "
                f"đã thêm {delta} cột trống bên phải (có thể thiếu một khuông nhạc)"
            )
        else:
            warnings.append(
                f"Trang {page.number}: có {page.spines} spine nhiều hơn các trang khác ({base}), đã bỏ {-delta} cột bên phải"
            )
        result.append(pad_page(page, base, references))
    return result, base, warnings


def spine_references(pages: list[PageKern], spines: int) -> list[dict[str, str]]:
    """Khóa nhạc/dấu hóa/khóa điệu/nhịp đầu tiên của từng spine, lấy từ các trang đủ ``spines`` cột (để điền cho cột độn)."""
    references: list[dict[str, str]] = [{} for _ in range(spines)]
    for page in pages:
        for line in page.body[: _prologue_length(page.body)]:
            fields = line.split(TAB)
            if len(fields) != spines:
                continue
            for index, token in enumerate(fields):
                kind = classify(token)
                if kind and kind not in references[index]:
                    references[index][kind] = token
    return references


_REST_DURATIONS = {Fraction(4): "00", Fraction(2): "0", **{Fraction(1, 2**k): str(2**k) for k in range(0, 7)}}


def rest_token(duration: Fraction) -> Optional[str]:
    """Dấu lặng kern đúng ``duration`` (nốt tròn = 1) nếu biểu diễn được bằng một token (có thể có chấm), ngược lại None."""
    for base, digits in _REST_DURATIONS.items():
        for dots in range(3):
            if base * (2 - Fraction(1, 2**dots)) == duration:
                return f"{digits}{'.' * dots}r"
    return None


def _measure_rest_rows(body: list[str]) -> dict[int, str]:
    """``chỉ số dòng dữ liệu đầu tiên của mỗi ô nhịp -> dấu lặng dài bằng ô đó`` (đo theo spine đầu tiên)."""
    rests: dict[int, str] = {}
    rows: list[int] = []

    def flush() -> None:
        if not rows:
            return
        total = sum((token_duration(body[i].split(TAB)[0]) or Fraction(0) for i in rows), Fraction(0))
        token = rest_token(total) if total > 0 else None
        if token:
            rests[rows[0]] = token

    for index, line in enumerate(body):
        if is_barline(line):
            flush()
            rows = []
        elif is_data_line(line):
            rows.append(index)
    flush()
    return rests


def pad_page(
    page: PageKern, target: int, references: Optional[list[dict[str, str]]] = None, below: bool = False
) -> PageKern:
    """Đưa trang về ``target`` spine: thêm cột bên phải (khuông trên cùng) hoặc bỏ bớt cột bên phải.

    ``below``: thêm cột bên TRÁI (khuông dưới cùng, mặc định khóa Fa) thay vì bên phải, dùng khi hệ một khuông giai điệu
    (phần lời ca) được ghép vào bài có hệ 2 khuông: giai điệu phải nằm ở khuông trên.

    Cột thêm vào không để trống hoàn toàn, vì music21 bỏ ô nhịp không có nốt nào và khuông không có khóa nhạc làm MusicXML
    thiếu ``<attributes>``, khiến khuông đó lệch ô so với các khuông khác:

    * dòng diễn giải đầu trang lấy giá trị cùng loại của spine đó ở trang khác (``references``); không có thì dấu hóa,
      khóa điệu, nhịp (chung cho mọi khuông) lấy theo chính dòng đó, còn khóa nhạc mặc định khóa Sol;
    * mỗi ô nhịp có một dấu lặng dài bằng ô (đo theo spine đầu tiên), không biểu diễn được thì để ``.``.
    """
    delta = target - page.spines
    if delta <= 0:
        return PageKern(
            number=page.number, header=_fit_row(page.header, delta), body=[_fit_row(row, delta) for row in page.body]
        )
    references = references or []
    rests = _measure_rest_rows(page.body)
    prologue = _prologue_length(page.body)
    body: list[str] = []
    for index, row in enumerate(page.body):
        fields = row.split(TAB)
        if is_data_line(row):
            fillers = [rests.get(index, ".")] * delta
        elif index < prologue and _is_interpretation(row):
            kinds = {classify(token) for token in fields} - {None}
            kind = next(iter(kinds)) if len(kinds) == 1 else None
            same_row = next((token for token in fields if kind and classify(token) == kind), None)
            clef = "*clefF4" if below else "*clefG2"
            fallback = clef if kind == KIND_CLEF else (same_row or "*")
            fillers = []
            for k in range(delta):
                spine = k if below else page.spines + k
                known = references[spine] if spine < len(references) else {}
                fillers.append(known.get(kind, fallback) if kind else "*")
        else:
            fillers = [_filler(row)] * delta
        body.append(TAB.join(fillers + fields if below else fields + fillers))
    return PageKern(number=page.number, header=_fit_row(page.header, delta), body=body)


def fit_page_spines(page: PageKern, target: int, references: Optional[list[dict[str, str]]] = None) -> PageKern:
    """Đưa một trang về đúng ``target`` spine (số spine đích lấy từ bố cục trang), cùng cách độn như :func:`pad_page`."""
    if page.spines == target:
        return page
    return pad_page(page, target, references)


def _track_groups(groups: list[int], line: str) -> list[int]:
    """Cập nhật danh sách "spine gốc của từng cột" theo dòng ``*^`` (tách) và ``*v`` (gộp). Dòng không khớp thì giữ nguyên."""
    fields = line.split(TAB)
    if len(fields) != len(groups) or not any(tok in ("*^", "*v") for tok in fields):
        return groups
    updated: list[int] = []
    previous_join: Optional[int] = None
    for gid, token in zip(groups, fields):
        if token == "*^":
            updated += [gid, gid]
            previous_join = None
        elif token == "*v":
            if previous_join != gid:  # hai ``*v`` liền nhau của cùng spine gộp thành một cột
                updated.append(gid)
            previous_join = gid
        else:
            updated.append(gid)
            previous_join = None
    return updated


def first_invalid_join(body: list[str], spines: int) -> Optional[int]:
    """Chỉ số dòng đầu tiên trong ``body`` có ``*v`` gộp các cột không cùng một spine gốc (hoặc một ``*v`` lẻ không có cột
    để gộp), tức là gộp khi chưa hề tách bằng ``*^``; None nếu mọi chỗ gộp đều hợp lệ."""
    groups = list(range(spines))
    for index, line in enumerate(body):
        if not line.startswith("*"):
            continue
        fields = line.split(TAB)
        if len(fields) != len(groups):
            continue
        position = 0
        while position < len(fields):
            if fields[position] != "*v":
                position += 1
                continue
            end = position
            while end < len(fields) and fields[end] == "*v":
                end += 1
            if end - position < 2 or len(set(groups[position:end])) > 1:
                return index
            position = end
        groups = _track_groups(groups, line)
    return None


def _join_lines(groups: list[int]) -> list[str]:
    """Các dòng ``*v`` đưa các spine đang tách về lại một cột mỗi spine gốc (rỗng nếu không còn cột nào tách)."""
    lines: list[str] = []
    while len(set(groups)) != len(groups):
        tokens: list[str] = []
        seen: set[int] = set()
        for index, gid in enumerate(groups):
            tokens.append("*v" if gid in seen or (index + 1 < len(groups) and groups[index + 1] == gid) else "*")
            seen.add(gid)
        # chỉ gộp đúng hai cột đầu của mỗi nhóm trong một dòng; nhóm lớn hơn sẽ được xử lý ở vòng sau
        counted: dict[int, int] = {}
        for index, gid in enumerate(groups):
            counted[gid] = counted.get(gid, 0) + 1
            if tokens[index] == "*v" and counted[gid] > 2:
                tokens[index] = "*"
        line = TAB.join(tokens)
        lines.append(line)
        groups = _track_groups(groups, line)
    return lines


def merge_pages(pages: list[PageKern], lenient: bool = False) -> MergeResult:
    """Ghép các trang (đã làm sạch, theo thứ tự trang) thành một bản kern (đặc tả mục 2.3, "Ghép trang").

    * Giữ header của trang đầu; bỏ header ``**kern`` và ``*-`` của các trang sau; luôn kết thúc bằng ``*-``.
    * Số spine khác trang đầu: thử căn theo trang đầu (:func:`align_spines`), không được thì
      :class:`MergeSpineMismatch`. Với ``lenient=True`` (dùng cho kết quả model thật) thay vào đó mọi trang được căn về số
      spine phổ biến nhất bằng :func:`align_pages_leniently` và không bao giờ ném lỗi này.
    * Trang kết thúc khi còn spine đang tách (``*^`` chưa ``*v``) thì chèn dòng ``*v`` trước trang sau và trước ``*-``.
    * Trang sau thiếu khóa nhạc/dấu hóa/khóa điệu/nhịp ở đầu trang thì kế thừa từ trang trước; dòng diễn giải chỉ lặp lại
      giá trị cũ thì bỏ.
    * Vạch nhịp trùng ở chỗ nối trang bị bỏ bớt một; vạch kết thúc ``==`` giữa bài đổi thành ``=``; số ô nhịp được đánh
      lại liên tục.
    * ``lenient=True`` còn sửa đoạn tách spine lệch nhau (:func:`repair_split_segments`) và dấu nối lẻ
      (:func:`repair_ties`), sau khi đã ghép để sửa được cả chỗ vắt qua hai trang.
    """
    if not pages:
        raise ValueError("Không có trang nào để ghép")
    warnings: list[str] = []
    if lenient:
        pages, base, align_warnings = align_pages_leniently(pages)
        warnings.extend(align_warnings)
    else:
        base = pages[0].spines
    first = pages[0]
    state = _State(base)
    groups = list(range(base))

    lines: list[str] = []
    line_pages: list[int] = []

    def emit(line: str, page_no: int) -> None:
        nonlocal groups
        lines.append(line)
        line_pages.append(page_no)
        if _is_interpretation(line):
            state.update(line)
            groups = _track_groups(groups, line)

    for index, page in enumerate(pages):
        current = page
        if current.spines != base:
            aligned = align_spines(current, base)
            if aligned is None:
                raise MergeSpineMismatch(current.number, base, current.spines)
            warnings.append(
                f"Trang {current.number}: có {current.spines} spine khác trang đầu ({base}), đã căn theo trang đầu"
            )
            current = aligned

        body = list(current.body)
        if index > 0:
            # Trang trước còn spine đang tách: gộp lại trước khi sang trang mới (trang mới bắt đầu ở số cột chuẩn)
            for join in _join_lines(groups):
                emit(join, pages[index - 1].number)
            prologue = body[: _prologue_length(body)]
            present = {kind for ln in prologue for tok in ln.split(TAB) if (kind := classify(tok))}
            for inherited in state.inherited_lines(present):
                emit(inherited, current.number)
            # Chỉ bỏ dòng thừa trong phần đầu trang; dòng đổi nhịp/khóa giữa trang phải giữ
            kept_prologue = [ln for ln in prologue if not state.is_redundant(ln)]
            body = kept_prologue + body[len(prologue) :]
            # Vạch nhịp trùng ở chỗ nối: trang trước kết thúc bằng vạch nhịp và trang này lại mở đầu bằng vạch nhịp
            last_content = next((ln for ln in reversed(lines) if not ln.startswith("*")), None)
            first_content_index = next((i for i, ln in enumerate(body) if not ln.startswith("*")), None)
            if (
                last_content is not None
                and is_barline(last_content)
                and first_content_index is not None
                and is_barline(body[first_content_index])
            ):
                del body[first_content_index]

        for line in body:
            emit(line, current.number)

    for join in _join_lines(groups):
        emit(join, pages[-1].number)
    _finalize_barlines(lines)
    if lenient:
        warnings.extend(repair_split_segments(lines, line_pages))
        tied = repair_ties(lines)
        for page_no in sorted({line_pages[i] for i in tied}):
            count = sum(1 for i in tied if line_pages[i] == page_no)
            warnings.append(f"Trang {page_no}: model ghi dấu nối thiếu đầu hoặc cuối, đã sửa ở {count} dòng")
    header = first.header
    text = "\n".join([header, *lines, TAB.join(["*-"] * base)]) + "\n"
    return MergeResult(text=text, spines=base, warnings=warnings, line_pages=line_pages, lines=lines, header=header)


def _finalize_barlines(lines: list[str]) -> None:
    """Đổi ``==`` giữa bài thành ``=`` rồi đánh số ô nhịp liên tục (sửa trực tiếp ``lines``).

    Số bắt đầu lấy theo vạch nhịp đầu tiên nếu nó có số, không thì 1. Vạch kết thúc bài (``==`` cuối cùng) giữ nguyên.
    """
    barline_indexes = [i for i, ln in enumerate(lines) if is_barline(ln)]
    if not barline_indexes:
        return
    last_barline = barline_indexes[-1]

    first_match = _RE_BARLINE.match(lines[barline_indexes[0]].split(TAB)[0])
    number = int(first_match.group("num")) if first_match and first_match.group("num") else 1

    for i in barline_indexes:
        fields = lines[i].split(TAB)
        head = _RE_BARLINE.match(fields[0])
        if i == last_barline and head is not None and head.group("dbl") == "=" and not head.group("num"):
            continue  # vạch kết thúc bài
        renumbered = []
        for token in fields:
            match = _RE_BARLINE.match(token)
            if match is None:
                renumbered.append(token)
            else:
                renumbered.append(f"={number}{match.group('rest')}")
        lines[i] = TAB.join(renumbered)
        number += 1


def split_merged_measures_at(result: MergeResult) -> tuple[MergeResult, list[int]]:
    """Chèn lại vạch nhịp model bỏ sót, dựa vào trường độ.

    Model hay đọc đúng nốt nhưng quên một vạch nhịp, nên hai ô liền nhau dính thành một. Một đoạn giữa hai vạch nhịp mà
    mọi dòng nhạc đều có tổng trường độ đúng ``k`` lần số chỉ nhịp (``k >= 2``) và có chỗ cắt mà *mọi* dòng nhạc cùng tròn
    ``j`` lần số chỉ nhịp thì gần như chắc chắn là ``k`` ô dính nhau: chèn vạch nhịp vào các chỗ đó. Không đụng tới đoạn
    đang tách/gộp spine, đoạn chưa biết số chỉ nhịp hay đoạn có tổng không chia hết (ô thật sự sai thì để cờ trường độ báo).

    Trả ``(kết quả, danh_sách)``: mỗi phần tử là số thứ tự (từ 1, cách đánh số của :func:`page_measure_ranges` trên bản
    *trước khi* chèn) của một ô đã được tách thêm một lần, lặp lại theo số vạch chèn vào ô đó.
    """
    base = result.spines
    lines = list(result.lines)
    pages = list(result.line_pages)
    meter: Optional[Fraction] = None
    out_lines: list[str] = []
    out_pages: list[int] = []
    inserted = 0
    first_page = 0
    ordinal = 0
    split_ordinals: list[int] = []

    def flush(segment: list[tuple[str, int]], seg_meter: Optional[Fraction]) -> None:
        nonlocal inserted, first_page, ordinal
        if any(is_data_line(line) for line, _ in segment):
            ordinal += 1
        cuts = _missing_barline_cuts(segment, seg_meter, base)
        split_ordinals.extend([ordinal] * len(cuts))
        for position, (line, page_no) in enumerate(segment):
            if position in cuts:
                out_lines.append(TAB.join(["="] * base))
                out_pages.append(page_no)
                inserted += 1
                first_page = first_page or page_no
            out_lines.append(line)
            out_pages.append(page_no)

    segment: list[tuple[str, int]] = []
    segment_meter: Optional[Fraction] = None
    for line, page_no in zip(lines, pages):
        if is_barline(line):
            flush(segment, segment_meter)
            out_lines.append(line)
            out_pages.append(page_no)
            segment = []
            segment_meter = meter
            continue
        if _is_interpretation(line):
            fields = line.split(TAB)
            if len(fields) == base:
                for token in fields:
                    value = _meter_fraction(token)
                    if value is not None:
                        meter = value
                        segment_meter = value
                        break
        segment.append((line, page_no))
    flush(segment, segment_meter)
    if not inserted:
        return result, []
    _finalize_barlines(out_lines)
    warnings = list(result.warnings)
    warnings.append(
        f"Trang {first_page}: model bỏ sót vạch nhịp, đã tự chèn {inserted} vạch nhịp theo trường độ (nên đối chiếu lại với ảnh)"
    )
    text = "\n".join([result.header, *out_lines, TAB.join(["*-"] * base)]) + "\n"
    fixed = MergeResult(
        text=text, spines=base, warnings=warnings, line_pages=out_pages, lines=out_lines, header=result.header
    )
    return fixed, split_ordinals


def _missing_barline_cuts(segment: list[tuple[str, int]], meter: Optional[Fraction], base: int) -> set[int]:
    """Chỉ số (trong ``segment``) của các dòng cần chèn vạch nhịp ngay trước nó; rỗng nếu đoạn không thỏa điều kiện."""
    if meter is None or meter <= 0:
        return set()
    rows: list[tuple[int, list[Fraction]]] = []
    totals = [Fraction(0)] * base
    for position, (line, _) in enumerate(segment):
        if line.startswith("*") or line.startswith("!"):
            if line.startswith("*") and _is_interpretation(line) and len(line.split(TAB)) != base:
                return set()  # đang tách/gộp spine
            continue
        if not is_data_line(line):
            continue
        fields = line.split(TAB)
        if len(fields) != base:
            return set()
        for index, token in enumerate(fields):
            duration = token_duration(token)
            if duration is not None:
                totals[index] += duration
        rows.append((position, list(totals)))
    active = [i for i in range(base) if totals[i] > 0]
    if not active:
        return set()
    count = totals[active[0]] / meter
    if count < 2 or count.denominator != 1 or any(totals[i] != totals[active[0]] for i in active):
        return set()
    cuts: set[int] = set()
    wanted = 1
    for row_index, (position, _) in enumerate(rows):
        if wanted >= count:
            break
        # Cộng dồn tới *trước* dòng này phải tròn ``wanted`` lần số chỉ nhịp ở mọi dòng nhạc
        before = rows[row_index - 1][1] if row_index else [Fraction(0)] * base
        if all(before[i] == wanted * meter for i in active):
            cuts.add(position)
            wanted += 1
    return cuts if wanted == count else set()


# ====================================================================== vai trò khuông


INSTRUMENT_VOICE = "*Ivox"
INSTRUMENT_PIANO = "*Ipiano"


def annotate_roles(result: MergeResult, roles_top_down: list[str], piano_role: str = "PIANO") -> MergeResult:
    """Thêm dòng mã nhạc cụ Humdrum (``*Ivox`` cho khuông đơn, ``*Ipiano`` cho khuông piano) ngay sau dòng ``**kern``.

    ``roles_top_down`` là vai trò từ khuông trên cùng xuống (như :attr:`layout.PageLayout.roles`); spine kern thì đi từ
    khuông dưới lên nên thứ tự bị đảo. music21 đọc hai mã này thành ``partName`` "Voice"/"Piano" (dòng ``*I"Tên`` thì
    không) và bước chuẩn hóa MusicXML dựa vào đó để tách part "Giọng hát".

    Không làm gì (trả nguyên ``result``) khi số vai trò khác số spine, khi chỉ có piano (bản piano giữ đúng đầu ra cũ)
    hoặc khi không có piano (bản một khuông có thể là giai điệu nhạc cụ, không tự gọi là giọng hát).
    """
    if len(roles_top_down) != result.spines or piano_role not in roles_top_down:
        return result
    if all(role == piano_role for role in roles_top_down):
        return result
    codes = [INSTRUMENT_PIANO if role == piano_role else INSTRUMENT_VOICE for role in roles_top_down]
    line = TAB.join(reversed(codes))
    first_page = result.line_pages[0] if result.line_pages else 1
    lines = [line, *result.lines]
    line_pages = [first_page, *result.line_pages]
    text = "\n".join([result.header, *lines, TAB.join(["*-"] * result.spines)]) + "\n"
    return MergeResult(
        text=text,
        spines=result.spines,
        warnings=list(result.warnings),
        line_pages=line_pages,
        lines=lines,
        header=result.header,
    )


# ====================================================================== trường độ & kiểm tra ô nhịp


def with_lines(result: MergeResult, lines: list[str]) -> MergeResult:
    """Bản sao của ``result`` với phần thân mới (cùng số dòng, cùng số spine)."""
    end = "*-" if result.spines == 1 else TAB.join(["*-"] * result.spines)
    text = "\n".join([result.header, *lines, end]) + "\n"
    return MergeResult(
        text=text,
        spines=result.spines,
        warnings=list(result.warnings),
        line_pages=list(result.line_pages),
        lines=list(lines),
        header=result.header,
    )


def token_duration(token: str) -> Optional[Fraction]:
    """Trường độ (tính theo nốt tròn) của một token dữ liệu kern, hoặc None nếu không có/không tính (``.``, nốt trang
    trí). Hợp âm (các nốt cách nhau bằng dấu cách) lấy nốt đầu."""
    token = token.split(" ")[0]
    if not token or token == "." or "q" in token or "Q" in token:
        return None
    match = _RE_DURATION.search(token)
    if match is None:
        return None
    digits = match.group(1)
    base = int(digits)
    if digits == "00":
        value = Fraction(4)  # longa
    elif base == 0:
        value = Fraction(2)  # breve
    elif match.group(2):
        value = Fraction(int(match.group(2)), base)  # dạng 3%2
    else:
        value = Fraction(1, base)
    dots = len(match.group(3))
    return value * (2 - Fraction(1, 2**dots))


def _meter_fraction(token: str) -> Optional[Fraction]:
    match = _RE_METER.match(token)
    if match is None:
        return None
    return Fraction(int(match.group(1)), int(match.group(2)))


@dataclass
class Timeline:
    """Kết quả chạy trục thời gian Humdrum qua một đoạn kern (:func:`timeline`)."""

    times: list[Optional[Fraction]]
    """Thời điểm bắt đầu của từng dòng (None với dòng không phải dữ liệu)."""
    line_groups: list[Optional[list[int]]]
    """Spine gốc của từng cột ở mỗi dòng dữ liệu (None với dòng khác)."""
    groups: list[int]
    """Spine gốc của từng cột sau dòng cuối."""
    ends: list[Fraction]
    """Thời điểm nốt cuối của từng cột kết thúc."""
    used: list[bool]
    """Cột có nốt/dấu lặng nào không."""


def timeline(lines: list[str], width: int) -> Optional[Timeline]:
    """Chạy trục thời gian Humdrum qua ``lines`` (bắt đầu với ``width`` cột): dòng dữ liệu sau bắt đầu khi nốt sớm nhất
    đang vang ở bất kỳ cột nào kết thúc. Theo được ``*^``/``*v``; trả None khi số cột không khớp, gặp ``*+``/``*x``/``*-``
    hoặc ``*v`` gộp hai spine gốc khác nhau."""
    groups = list(range(width))  # spine gốc của từng cột
    ends = [Fraction(0)] * width  # thời điểm nốt đang vang ở từng cột kết thúc
    used = [False] * width
    times: list[Optional[Fraction]] = []
    line_groups: list[Optional[list[int]]] = []
    now = Fraction(0)
    for line in lines:
        if not line or line.startswith("!") or is_barline(line):
            times.append(None)
            line_groups.append(None)
            continue
        fields = line.split(TAB)
        if len(fields) != len(groups):
            return None
        if line.startswith("*"):
            times.append(None)
            line_groups.append(None)
            new_groups: list[int] = []
            new_ends: list[Fraction] = []
            new_used: list[bool] = []
            column = 0
            while column < len(fields):
                token = fields[column]
                if token == "*^":
                    new_groups += [groups[column]] * 2
                    new_ends += [ends[column]] * 2
                    new_used += [used[column]] * 2
                    column += 1
                elif token == "*v":
                    stop = column
                    while stop < len(fields) and fields[stop] == "*v":
                        stop += 1
                    if stop - column < 2 or len(set(groups[column:stop])) != 1:
                        return None
                    new_groups.append(groups[column])
                    new_ends.append(max(ends[column:stop]))
                    new_used.append(any(used[column:stop]))
                    column = stop
                elif token in ("*+", "*x", "*-"):
                    return None
                else:
                    new_groups.append(groups[column])
                    new_ends.append(ends[column])
                    new_used.append(used[column])
                    column += 1
            groups, ends, used = new_groups, new_ends, new_used
            continue
        times.append(now)
        line_groups.append(list(groups))
        for column, token in enumerate(fields):
            if token == ".":
                continue
            duration = token_duration(token)
            if duration is None:
                continue  # nốt hoa mỹ: không chiếm thời gian
            ends[column] = now + duration
            used[column] = True
        later = [end for end in ends if end > now]
        if later:
            now = min(later)
    return Timeline(times=times, line_groups=line_groups, groups=groups, ends=ends, used=used)


def measure_length(lines: list[str], width: int) -> Optional[Fraction]:
    """Độ dài (nốt tròn) của một ô theo trục thời gian Humdrum, tính được cả ô có tách/gộp spine (``*^``/``*v``).

    ``width``: số cột ở đầu ô. Mọi spine gốc (khuông) có nốt phải kết thúc cùng một lúc. Trả None khi không tính được
    (xem :func:`timeline`), khi các khuông dài khác nhau hoặc ô không có nốt nào.
    """
    track = timeline(lines, width)
    if track is None:
        return None
    totals: dict[int, Fraction] = {}
    for column, group in enumerate(track.groups):
        if track.used[column]:
            totals[group] = max(totals.get(group, Fraction(0)), track.ends[column])
    values = set(totals.values())
    return values.pop() if len(values) == 1 else None


def incomplete_roles(result: MergeResult) -> dict[int, str]:
    """Ô nhịp thiếu hợp lệ (:mod:`app.convert.incomplete_measures`) theo số thứ tự ô (từ 1, cùng cách đánh số với
    :func:`page_measure_ranges`): ô lấy đà, ô cuối bù cho ô lấy đà và hai phần của ô bị vạch nhịp chia đôi."""
    ordered = [s for s in _measure_segments(result) if s["any"]]
    roles = _classify_segments(ordered, result.spines)
    return {position + 1: role for position, role in roles.items()}


def check_measures(result: MergeResult) -> list[str]:
    """Cảnh báo ô nhịp có tổng trường độ khác số chỉ nhịp (đặc tả: không làm FAILED).

    Chỉ kiểm tra các ô nhịp không tách/gộp spine. Ô nhịp đầu tiên (nhịp lấy đà) và ô nhịp cuối cùng được phép ngắn
    hơn; hai phần của một ô bị vạch nhịp chia đôi (cộng lại vừa đủ số chỉ nhịp, :func:`incomplete_roles`) cũng không bị
    báo. Mỗi cảnh báo ghi số trang và số ô nhịp; chỉ nêu tối đa :data:`MAX_WARNINGS_PER_KIND` ô.
    """
    _, problems, _ = _measure_report(result)
    if len(problems) > MAX_WARNINGS_PER_KIND:
        extra = len(problems) - MAX_WARNINGS_PER_KIND
        problems = problems[:MAX_WARNINGS_PER_KIND] + [f"Còn {extra} ô nhịp khác có tổng trường độ không khớp số chỉ nhịp"]
    return problems


def measure_stats(result: MergeResult, lenient_first: bool = True, lenient_last: bool = True) -> tuple[int, int]:
    """``(số ô kiểm được, số ô sai trường độ)``, cùng quy tắc với :func:`check_measures`. Dùng để chấm ứng viên.

    Ô nhịp đầu/cuối của đoạn được nới (chỉ sai khi dài hơn số chỉ nhịp) vì có thể là ô lấy đà hay ô cuối bài. Một hệ ở
    giữa trang không có ô nào như vậy nên bên gọi có thể tắt ``lenient_first``/``lenient_last`` để kiểm chặt."""
    checked, problems, _ = _measure_report(result, lenient_first, lenient_last)
    return checked, len(problems)


def bad_measures(result: MergeResult) -> list[int]:
    """Số thứ tự (từ 1, cùng cách đánh số với :func:`page_measure_ranges`) các ô nhịp sai tổng trường độ, cùng quy tắc
    với :func:`check_measures`."""
    _, _, positions = _measure_report(result)
    return positions


def _measure_segments(result: MergeResult) -> list[dict]:
    """Các đoạn giữa hai vạch nhịp của kern đã ghép, theo thứ tự. Mỗi đoạn: số ô (theo vạch nhịp), trang, tổng trường độ
    từng spine, số chỉ nhịp, ``ok`` (không tách/gộp spine), số dòng dữ liệu đủ cột, ``any`` (có dữ liệu: ô này có số thứ
    tự) và ``lines`` (dòng diễn giải và dữ liệu của đoạn)."""
    base = result.spines
    meter: Optional[Fraction] = None

    def open_segment(number: int, page_no: int) -> dict:
        return {
            "number": number,
            "page": page_no,
            "sums": [Fraction(0)] * base,
            "meter": meter,
            "ok": True,
            "data": 0,
            "any": False,
            "lines": [],
        }

    # Dữ liệu nằm trước vạch nhịp đầu tiên (nếu có) là ô nhịp lấy đà, mang số (số đầu - 1)
    first_barline = next((ln for ln in result.lines if is_barline(ln)), None)
    first_match = _RE_BARLINE.match(first_barline.split(TAB)[0]) if first_barline else None
    initial_number = int(first_match.group("num")) - 1 if first_match and first_match.group("num") else 1
    current = open_segment(max(initial_number, 0), result.line_pages[0] if result.line_pages else 1)
    segments: list[dict] = []

    for line, page_no in zip(result.lines, result.line_pages):
        if is_barline(line):
            segments.append(current)
            match = _RE_BARLINE.match(line.split(TAB)[0])
            number = int(match.group("num")) if match and match.group("num") else current["number"] + 1
            current = open_segment(number, page_no)
            continue
        if _is_interpretation(line):
            current["lines"].append(line)
            fields = line.split(TAB)
            if len(fields) == base:
                for token in fields:
                    value = _meter_fraction(token)
                    if value is not None:
                        meter = value
                        current["meter"] = value
                        break
            continue
        if not is_data_line(line):
            continue
        current["lines"].append(line)
        current["any"] = True  # có dữ liệu (kể cả dòng đang tách spine): ô này có số thứ tự
        fields = line.split(TAB)
        if len(fields) != base:
            current["ok"] = False  # đang tách/gộp spine: không tính được
            continue
        current["data"] += 1
        if current["data"] == 1:
            current["page"] = page_no
        for index, token in enumerate(fields):
            duration = token_duration(token)
            if duration is not None:
                current["sums"][index] += duration
    segments.append(current)
    return segments


def _segment_length(segment: dict, width: int) -> Optional[Fraction]:
    """Độ dài chung của mọi khuông có nốt trong một đoạn (None nếu các khuông lệch nhau hoặc không tính được)."""
    if not segment["ok"]:
        return measure_length(segment["lines"], width)
    values = {total for total in segment["sums"] if total > 0}
    return values.pop() if len(values) == 1 else None


def _classify_segments(ordered: list[dict], width: int) -> dict[int, str]:
    """Vai trò ô thiếu hợp lệ của các đoạn có dữ liệu ``ordered`` (theo thứ tự), khóa là vị trí trong ``ordered``."""
    lengths = [_segment_length(segment, width) for segment in ordered]
    meters = [segment["meter"] for segment in ordered]
    return incomplete_measures.classify(lengths, meters)


def _measure_report(
    result: MergeResult, lenient_first: bool = True, lenient_last: bool = True
) -> tuple[int, list[str], list[int]]:
    """Đếm ô nhịp kiểm được, liệt kê mọi ô sai trường độ (không giới hạn số cảnh báo) và số thứ tự (từ 1, trong các ô
    có dữ liệu) của các ô đó. Hai phần của ô bị vạch nhịp chia đôi là ô đúng."""
    problems: list[str] = []
    segments = _measure_segments(result)
    ordered = [s for s in segments if s["any"]]
    ordinals = {id(s): k for k, s in enumerate(ordered, start=1)}
    roles = _classify_segments(ordered, result.spines)
    split = {id(ordered[k]) for k, role in roles.items() if role in incomplete_measures.SPLIT_ROLES}
    with_data = [s for s in segments if s["data"] > 0]
    checked = 0
    positions: list[int] = []
    for position, segment in enumerate(with_data):
        if not segment["ok"] or segment["meter"] is None:
            continue
        checked += 1
        if id(segment) in split:
            continue
        is_edge = (lenient_first and position == 0) or (lenient_last and position == len(with_data) - 1)
        for index, total in enumerate(segment["sums"]):
            if total == 0:
                continue  # spine không có nốt nào trong ô nhịp này (ví dụ chỉ có dòng trống)
            wrong = total > segment["meter"] if is_edge else total != segment["meter"]
            if wrong:
                problems.append(
                    f"Trang {segment['page']}, ô nhịp {segment['number']}: dòng nhạc thứ {index + 1} có tổng trường độ "
                    f"{total} (nốt tròn), khác số chỉ nhịp {segment['meter']}"
                )
                positions.append(ordinals[id(segment)])
                break
    return checked, problems, positions


# ====================================================================== metadata


@dataclass
class KernMetadata:
    """Thông tin rút từ kern để điền ``scores`` (nhánh export MusicXML/MIDI sẽ ghi đè bằng music21)."""

    measure_count: int
    key_signature: Optional[str]
    time_signature: Optional[str]
    tempo_bpm: Optional[int]
    staff_count: int


def extract_metadata(result: MergeResult) -> KernMetadata:
    """Số ô nhịp, khóa/dấu hóa, số chỉ nhịp, tempo và số khuông (số spine ``**kern``) từ bản kern đã ghép."""
    base = result.spines
    time_signature: Optional[str] = None
    tempo: Optional[int] = None
    key_name: Optional[str] = None
    accidentals: Optional[str] = None

    for line in result.lines:
        if not _is_interpretation(line):
            continue
        for token in line.split(TAB):
            meter = _RE_METER.match(token)
            if meter and time_signature is None:
                time_signature = f"{meter.group(1)}/{meter.group(2)}"
            tempo_match = _RE_TEMPO.match(token)
            if tempo_match and tempo is None:
                tempo = int(float(tempo_match.group(1)))
            key_match = _RE_KEY.match(token)
            if key_match and key_name is None:
                letter, acc = key_match.group(1), key_match.group(2).replace("-", "b")
                key_name = f"{letter.upper()}{acc} {'major' if letter.isupper() else 'minor'}"
            if token.startswith("*k[") and accidentals is None:
                accidentals = token[3 : token.find("]")] if "]" in token else ""

    key_signature = key_name
    if key_signature is None and accidentals is not None:
        # Không có khóa điệu: suy ra tên giọng trưởng từ số dấu hóa (có thể là giọng thứ song song)
        count = len(accidentals) // 2
        names = _FLAT_KEYS if "-" in accidentals else _SHARP_KEYS
        key_signature = f"{names[min(count, 7)]} major" if count else "C major"

    kern_spines = [h for h in result.header.split(TAB) if h == "**kern"]
    segments = _count_measures(result)
    return KernMetadata(
        measure_count=segments,
        key_signature=key_signature,
        time_signature=time_signature,
        tempo_bpm=tempo,
        staff_count=len(kern_spines) or base,
    )


def page_measure_ranges(result: MergeResult) -> list[dict]:
    """Ô nhịp đầu và cuối của từng trang trong bản kern đã ghép: ``[{page, firstMeasure, lastMeasure}]``.

    Dùng cùng cách đếm với :func:`_count_measures` (một ô nhịp là đoạn giữa hai vạch nhịp có ít nhất một dòng dữ liệu) và
    đánh số từ 1, nên khớp với số ô nhịp của MusicXML sau khi chuẩn hóa. Ô nhịp nằm vắt qua chỗ nối trang thuộc cả hai
    trang. Trang không có dòng dữ liệu nào thì không xuất hiện. Web dùng để vẽ đúng phần nhạc của từng trang bên cạnh
    ảnh gốc (đặc tả mục 2.3).
    """
    ranges: dict[int, list[int]] = {}
    measure = 1
    has_data = False
    for line, page in zip(result.lines, result.line_pages):
        if is_barline(line):
            if has_data:
                measure += 1
            has_data = False
        elif is_data_line(line):
            has_data = True
            bounds = ranges.setdefault(page, [measure, measure])
            bounds[1] = measure
    return [{"page": page, "firstMeasure": b[0], "lastMeasure": b[1]} for page, b in sorted(ranges.items())]


def _count_measures(result: MergeResult) -> int:
    """Số ô nhịp = số đoạn giữa các vạch nhịp có ít nhất một dòng dữ liệu."""
    return count_measures(result.lines)


def count_measures(lines: list[str]) -> int:
    """Số ô nhịp của một dãy dòng kern (ví dụ ``PageKern.body``), cùng cách đếm với :func:`extract_metadata`."""
    count = 0
    has_data = False
    for line in lines:
        if is_barline(line):
            count += 1 if has_data else 0
            has_data = False
        elif is_data_line(line):
            has_data = True
    return count + (1 if has_data else 0)


# ====================================================================== khối ô nhịp lặp


def split_measures(lines: list[str]) -> list[list[str]]:
    """Tách dãy dòng kern thành từng đoạn kết thúc bằng một vạch nhịp (đoạn cuối có thể không có vạch)."""
    chunks: list[list[str]] = [[]]
    for line in lines:
        chunks[-1].append(line)
        if is_barline(line):
            chunks.append([])
    if not chunks[-1]:
        chunks.pop()
    return chunks


def _chunk_signature(chunk: list[str]) -> tuple[str, ...]:
    """Nội dung so sánh của một ô: chỉ các dòng dữ liệu (số ô nhịp trên vạch nhịp luôn khác nhau)."""
    return tuple(line for line in chunk if is_data_line(line))


def drop_repeated_blocks(page: PageKern, expected: int) -> tuple[PageKern, int]:
    """Bỏ các khối ô nhịp lặp liền nhau giống hệt khi trang có nhiều ô hơn ``expected`` (số ô đếm trên ảnh).

    Chỉ dùng làm bước cuối khi nhận diện lại vẫn thừa ô: model "lạc chỗ" lặp nguyên một khối. Khối là ``L`` ô liên tiếp
    lặp ``k`` lần ngay sau nhau (``L >= 2, k >= 2`` hoặc một ô lặp từ 3 lần). Nhạc thật cũng có thể lặp, nên chỉ bỏ tới
    khi số ô bằng ``expected`` chứ không bỏ hết các bản lặp. Trả ``(trang, số ô đã bỏ)``.
    """
    chunks = split_measures(page.body)
    signatures = [_chunk_signature(c) for c in chunks]
    excess = count_measures(page.body) - expected
    removed = 0
    index = 0
    while excess > 0 and index < len(chunks):
        best: Optional[tuple[int, int]] = None
        for length in range(1, 13):
            block = signatures[index : index + length]
            if len(block) < length or not all(block):
                break
            repeats = 1
            while signatures[index + repeats * length : index + (repeats + 1) * length] == block:
                repeats += 1
            if repeats >= (3 if length == 1 else 2) and (best is None or length * repeats > best[0] * best[1]):
                best = (length, repeats)
        if best is None:
            index += 1
            continue
        length, repeats = best
        copies = min(repeats - 1, excess // length)
        if copies <= 0:
            index += length * repeats
            continue
        start = index + length
        del chunks[start : start + copies * length]
        del signatures[start : start + copies * length]
        excess -= copies * length
        removed += copies * length
        index += length * (repeats - copies)
    if not removed:
        return page, 0
    body = [line for chunk in chunks for line in chunk]
    return PageKern(number=page.number, header=page.header, body=body), removed
