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
    number: int, raw: str, max_repeat: int = 24, truncated: bool = False
) -> tuple[Optional[PageKern], list[str]]:
    """Làm sạch kern thô của một trang. Trả ``(trang, cảnh_báo)``; ``trang`` là None nếu phải bỏ trang.

    Thiếu dòng ``**kern`` thì tự dựng từ dòng diễn giải đầu tiên. Bỏ trang (kèm cảnh báo) khi không có cả hai hoặc không có dòng dữ liệu nào (đặc tả: trang rỗng).
    ``truncated=True`` (model chạm giới hạn token) thì bỏ dòng cuối vì có thể bị cắt giữa chừng.
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

    if truncated and body:
        body = body[:-1]
        warnings.append(f"Trang {number}: kết quả chạm giới hạn độ dài của model, phần cuối trang có thể bị thiếu")

    body, removed = collapse_runaway(body, max_repeat)
    if removed:
        warnings.append(f"Trang {number}: model sinh lặp, đã cắt {removed} dòng lặp")

    if not any(is_data_line(ln) for ln in body):
        return None, warnings + [f"Trang {number}: không nhận diện được nốt nào nên đã bỏ qua trang này"]
    # Model không đọc được ảnh thường sinh một dãy dấu lặng dài: coi như chưa nhận diện được nốt nào
    if not any(has_pitched_note(ln) for ln in body):
        return None, warnings + [
            f"Trang {number}: kết quả chỉ có dấu lặng, không có nốt nào nên đã bỏ qua trang này "
            "(ảnh có thể bị nhiễu, dính viền hoặc quá mờ)"
        ]
    return PageKern(number=number, header=header, body=body), warnings


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
    thúc ở hai thời điểm khác nhau. Độ dài đúng của đoạn lấy theo số chỉ nhịp trừ phần đứng trước đoạn tách trong cùng ô
    nhịp (nếu biết và khớp một trong hai giọng), không thì lấy giọng ngắn hơn. Giọng dài hơn bị cắt các dòng quá thời điểm
    đó; giọng ngắn hơn được thêm dấu lặng nếu độ dài thiếu biểu diễn được là ``1/n``. Sửa trực tiếp ``lines`` và
    ``line_pages``, trả danh sách cảnh báo.
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
                    removed, message = _repair_one_segment(lines, line_pages, i, end, column, budget)
                    if message:
                        where = f"ô nhịp {measure_number}" if measure_number is not None else "một ô nhịp"
                        warnings.append(f"Trang {line_pages[i]}, {where}: {message}")
                    i = end - removed
                split_in_measure = True
        i += 1
    return warnings


def _repair_one_segment(
    lines: list[str], line_pages: list[int], start: int, end: int, column: int, budget: Optional[Fraction]
) -> tuple[int, str]:
    """Sửa một đoạn tách ``lines[start..end]``. Trả ``(số dòng đã xóa, thông báo)``; thông báo rỗng nếu không cần sửa."""
    rows = [k for k in range(start + 1, end) if is_data_line(lines[k])]
    following = [Fraction(0), Fraction(0)]  # thời điểm nốt kế tiếp của từng giọng (tính từ đầu đoạn tách)
    times: list[Fraction] = []
    dangling = False
    now = Fraction(0)
    for k in rows:
        fields = lines[k].split(TAB)
        times.append(now)
        for voice in (0, 1):
            token = fields[column + voice]
            if token == ".":
                if now >= following[voice]:
                    dangling = True
                continue
            duration = token_duration(token)
            if duration is not None:
                following[voice] = now + duration
        later = [t for t in following if t > now]
        now = min(later) if later else now
    if not dangling and following[0] == following[1]:
        return 0, ""

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


def pad_page(page: PageKern, target: int, references: Optional[list[dict[str, str]]] = None) -> PageKern:
    """Đưa trang về ``target`` spine: thêm cột bên phải (khuông trên cùng) hoặc bỏ bớt cột bên phải.

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
            fallback = "*clefG2" if kind == KIND_CLEF else (same_row or "*")
            fillers = []
            for k in range(delta):
                spine = page.spines + k
                known = references[spine] if spine < len(references) else {}
                fillers.append(known.get(kind, fallback) if kind else "*")
        else:
            fillers = [_filler(row)] * delta
        body.append(TAB.join(fields + fillers))
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


def check_measures(result: MergeResult) -> list[str]:
    """Cảnh báo ô nhịp có tổng trường độ khác số chỉ nhịp (đặc tả: không làm FAILED).

    Chỉ kiểm tra các ô nhịp không tách/gộp spine. Ô nhịp đầu tiên (nhịp lấy đà) và ô nhịp cuối cùng được phép ngắn
    hơn. Mỗi cảnh báo ghi số trang và số ô nhịp; chỉ nêu tối đa :data:`MAX_WARNINGS_PER_KIND` ô.
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


def _measure_report(
    result: MergeResult, lenient_first: bool = True, lenient_last: bool = True
) -> tuple[int, list[str], list[int]]:
    """Đếm ô nhịp kiểm được, liệt kê mọi ô sai trường độ (không giới hạn số cảnh báo) và số thứ tự (từ 1, trong các ô
    có dữ liệu) của các ô đó."""
    base = result.spines
    problems: list[str] = []
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

    with_data = [s for s in segments if s["data"] > 0]
    ordinals = {id(s): k for k, s in enumerate((s for s in segments if s["any"]), start=1)}
    checked = 0
    positions: list[int] = []
    for position, segment in enumerate(with_data):
        if not segment["ok"] or segment["meter"] is None:
            continue
        checked += 1
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
