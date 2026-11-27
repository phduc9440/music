"""Chấm độ tin cậy từng ô nhịp của bản nhận diện và ghi lý do cần kiểm tra (``result_data.measureMap``).

Transcoda không cho biết nó chắc chắn tới đâu, nên ở đây dùng luật nhạc lý để tìm những chỗ *nhiều khả năng* đọc sai.
Mọi kiểm tra là hàm thuần trên kern đã ghép (không cần model), chạy sau :func:`app.omr.measure_map.build`:

* ``DURATION`` / ``COUNT_MISMATCH``: đã có từ :mod:`app.omr.measure_map` (tổng trường độ, số ô so với ảnh).
* ``RANGE``: nốt của khuông giọng hát/khuông đơn nằm ngoài tầm viết thường gặp của khóa nhạc đó (thường là đọc sai
  quãng tám, ví dụ chữ/dấu thanh của lời ca bị đọc thành dòng kẻ phụ).
* ``LEAP``: giai điệu nhảy quá một quãng tám, hoặc một nốt "vọt" lên/xuống ≥ 10 nửa cung so với CẢ hai nốt bên cạnh rồi
  quay lại (dấu hiệu điển hình của một nốt bị lệch quãng tám hay lệch vài dòng kẻ).
* ``ACCIDENTAL``: dấu hóa ngoài hóa biểu chỉ xuất hiện đúng một lần trong cả bè (dễ là vết bẩn/chữ đọc thành dấu hóa).
* ``UNSTABLE``: các lần đọc lại hệ với ảnh dịch vài pixel cho kết quả khác nhau (:mod:`app.omr.stability`).
* ``AI_DOUBT``: lớp AI xác minh cho rằng ô này đọc sai (:mod:`app.omr.llm_check`, mặc định tắt).
* ``PDF_MISMATCH``: PDF vector: số đầu nốt, số chấm dôi hoặc cao độ của ô khác ký hiệu nhạc trong chính file PDF
  (:mod:`app.omr.glyphs`). Ô khớp hoàn toàn với PDF thì bỏ cờ RANGE/LEAP (cao độ đã được PDF xác nhận).

Mỗi ô có ``confidence`` trong [0, 1] (1 trừ tổng trọng số các cờ) và ``reasons`` (câu tiếng Việt cho người dùng).
Khuông piano chỉ được kiểm trường độ (tầm âm và bước nhảy của piano quá rộng để đặt luật chung).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional

from app.convert import incomplete_measures
from app.omr import merge
from app.omr.layout import ROLE_PIANO, ROLE_SINGLE
from app.omr.merge import TAB

FLAG_DURATION = "DURATION"
FLAG_COUNT = "COUNT_MISMATCH"
FLAG_RANGE = "RANGE"
FLAG_LEAP = "LEAP"
FLAG_ACCIDENTAL = "ACCIDENTAL"
FLAG_UNSTABLE = "UNSTABLE"
FLAG_AI_DOUBT = "AI_DOUBT"
FLAG_LAYOUT = "LAYOUT_UNCHECKED"
FLAG_ENGINE = "ENGINE_DISAGREE"
FLAG_PDF = "PDF_MISMATCH"

FLAG_WEIGHTS: dict[str, float] = {
    FLAG_PDF: 0.45,
    FLAG_LAYOUT: 0.25,
    FLAG_ENGINE: 0.25,
    FLAG_DURATION: 0.45,
    FLAG_COUNT: 0.25,
    FLAG_RANGE: 0.35,
    FLAG_LEAP: 0.3,
    FLAG_ACCIDENTAL: 0.15,
    FLAG_UNSTABLE: 0.35,
    FLAG_AI_DOUBT: 0.4,
}
"""Mức trừ vào độ tin cậy của từng cờ. Ô có nhiều cờ cùng lúc thì gần như chắc chắn sai."""

STABLE_BONUS = 0.1
"""Các lần đọc lại đều khớp bản gốc: cộng thêm (không vượt 1)."""

AI_CONFIRMED_BONUS = 0.3
"""AI xác nhận bản gốc đúng: cộng thêm (không vượt 1)."""

REVIEW_THRESHOLD = 0.8
"""Ô có độ tin cậy dưới ngưỡng này được coi là "cần kiểm tra" (đọc lại hệ, gửi AI nếu bật)."""

# Tầm viết (MIDI) coi là bình thường cho khuông giọng hát/khuông đơn theo khóa nhạc. Rộng hơn tầm hát thật một chút:
# chỉ những nốt lệch hẳn (thường là đúng một quãng tám) mới bị đánh dấu.
_RANGE_TREBLE = (55, 84)  # G3 .. C6
_RANGE_BASS = (40, 67)  # E2 .. G4
_RANGE_ALTO = (48, 76)  # C3 .. E5

_SPIKE_SEMITONES = 10
_MAX_LEAP = 12
_ACCIDENTAL_MIN_NOTES = 24
"""Chỉ xét dấu hóa hiếm khi bè có đủ nhiều nốt (bài ngắn thì một dấu hóa xuất hiện một lần là bình thường)."""

_BASE = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}
_RE_PITCH = re.compile(r"([a-gA-G])\1*([#\-n]*)")
_RE_KEYSIG = re.compile(r"^\*k\[([a-g#\-]*)\]")
_RE_METER = re.compile(r"^\*M(\d+)/(\d+)")


# ====================================================================== nốt


@dataclass
class Note:
    midi: int
    letter: str
    alter: int
    explicit: bool
    """Token ghi dấu hóa (``#``, ``-``, ``n``) thay vì lấy từ hóa biểu."""


def parse_note(sub: str, keysig: dict[str, int]) -> Optional[Note]:
    """Một nốt kern (không phải hợp âm). None với dấu lặng, ``.`` hoặc token không có cao độ."""
    if not sub or sub == "." or "r" in sub:
        return None
    match = _RE_PITCH.search(sub)
    if match is None:
        return None
    letters = match.group(0)[: len(match.group(0)) - len(match.group(2))]
    letter = letters[0]
    count = len(letters)
    octave = 3 + count if letter.islower() else 4 - count
    accidentals = match.group(2)
    if accidentals:
        alter = accidentals.count("#") - accidentals.count("-")
        explicit = True
    else:
        alter = keysig.get(letter.lower(), 0)
        explicit = False
    midi = 12 * (octave + 1) + _BASE[letter.lower()] + alter
    return Note(midi=midi, letter=letter.lower(), alter=alter, explicit=explicit)


def parse_keysig(token: str) -> Optional[dict[str, int]]:
    match = _RE_KEYSIG.match(token)
    if match is None:
        return None
    body = match.group(1)
    result: dict[str, int] = {}
    for i in range(0, len(body) - 1, 2):
        letter, sign = body[i], body[i + 1]
        result[letter] = 1 if sign == "#" else -1
    return result


def normalize_token(token: str) -> str:
    """Phần so sánh được của một token: trường độ + cao độ + dấu hóa (bỏ hướng thân, dùi, luyến, dấu nhấn...)."""
    if token == ".":
        return "."
    parts = []
    for sub in token.split(" "):
        duration = re.search(r"\d+%?\d*\.*", sub)
        dur = duration.group(0) if duration else ""
        if "r" in sub:
            parts.append(f"{dur}r")
            continue
        pitch = _RE_PITCH.search(sub)
        parts.append(f"{dur}{pitch.group(0) if pitch else '?'}")
    return " ".join(sorted(parts))


def normalize_lines(lines: list[str]) -> tuple[str, ...]:
    """Dạng so sánh của các dòng dữ liệu một ô (bỏ dòng diễn giải, chú thích, vạch nhịp và dòng toàn ``.``)."""
    result = []
    for line in lines:
        if not merge.is_data_line(line):
            continue
        fields = [normalize_token(t) for t in line.split(TAB)]
        if all(f == "." for f in fields):
            continue
        result.append(TAB.join(fields))
    return tuple(result)


def describe_lines(lines: list[str], spines: int, roles_bottom_up: Optional[list[str]] = None) -> str:
    """Mô tả dễ đọc một ô (dùng cho AI và gỡ lỗi), ví dụ ``khuông 1 (giọng hát): G4 (đen), A4 (móc đơn)``."""
    names = {1: "tròn", 2: "trắng", 4: "đen", 8: "móc đơn", 16: "móc kép", 32: "móc ba"}
    per_spine: list[list[str]] = [[] for _ in range(spines)]
    keysig: dict[str, int] = {}
    for line in lines:
        if not merge.is_data_line(line):
            continue
        fields = line.split(TAB)
        if len(fields) != spines:
            continue
        for index, token in enumerate(fields):
            if token == ".":
                continue
            items = []
            for sub in token.split(" "):
                digits = re.search(r"(\d+)(\.*)", sub)
                label = ""
                if digits:
                    base = int(digits.group(1))
                    label = names.get(base, f"1/{base}") + (" chấm dôi" * len(digits.group(2)))
                if "r" in sub:
                    items.append(f"lặng ({label})" if label else "lặng")
                    continue
                note = parse_note(sub, keysig)
                if note is None:
                    continue
                name = midi_name(note.midi, note.alter)
                items.append(f"{name} ({label})" if label else name)
            if items:
                per_spine[index].append(" + ".join(items))
    parts = []
    for index in range(spines - 1, -1, -1):  # khuông trên cùng trước
        role = roles_bottom_up[index] if roles_bottom_up and index < len(roles_bottom_up) else None
        label = {ROLE_SINGLE: "giọng hát/khuông đơn", ROLE_PIANO: "piano"}.get(role or "", "")
        head = f"khuông {spines - index}" + (f" ({label})" if label else "")
        parts.append(f"{head}: {', '.join(per_spine[index]) or '(trống)'}")
    return "; ".join(parts)


def midi_name(midi: int, alter: int = 0) -> str:
    """Tên nốt kiểu khoa học (C4 = đô giữa), giữ cách viết thăng/giáng theo ``alter``."""
    letters = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"]
    natural = midi - alter
    octave = natural // 12 - 1
    name = letters[natural % 12]
    sign = "#" * alter if alter > 0 else "b" * (-alter)
    return f"{name}{sign}{octave}"


# ====================================================================== tách ô nhịp


@dataclass
class MeasureSlice:
    """Một ô nhịp của kern đã ghép, đánh số giống :func:`merge.page_measure_ranges` (từ 1, chỉ đếm ô có dữ liệu)."""

    ordinal: int
    start: int
    """Chỉ số dòng đầu tiên của ô trong ``MergeResult.lines`` (sau vạch nhịp trước đó)."""

    end: int
    """Chỉ số dòng cuối (vạch nhịp kết thúc ô, hoặc dòng cuối bài)."""

    meter: Optional[Fraction]
    keysigs: list[dict[str, int]]
    clefs: list[Optional[str]]
    regular: bool = True
    """Mọi dòng dữ liệu đúng số spine, không tách/gộp spine: so sánh và thay thế được."""

    data_lines: list[int] = field(default_factory=list)

    role: Optional[str] = None
    """Vai trò nếu là ô thiếu hợp lệ (:mod:`app.convert.incomplete_measures`): ô lấy đà, ô cuối, phần của ô chia đôi."""

    target: Optional[Fraction] = None
    """Tổng trường độ mỗi khuông phải có: số chỉ nhịp, riêng mỗi phần của ô bị vạch nhịp chia đôi là độ dài của chính
    phần đó (cách đọc khác làm phần này dài/ngắn đi thì hai phần không còn ghép đủ một ô)."""

    def lines(self, result: merge.MergeResult) -> list[str]:
        return result.lines[self.start : self.end + 1]


def slice_measures(result: merge.MergeResult) -> list[MeasureSlice]:
    spines = result.spines
    keysigs: list[dict[str, int]] = [{} for _ in range(spines)]
    clefs: list[Optional[str]] = [None] * spines
    meter: Optional[Fraction] = None
    slices: list[MeasureSlice] = []
    ordinal = 1
    current = MeasureSlice(ordinal, 0, -1, meter, [dict(k) for k in keysigs], list(clefs))
    for index, line in enumerate(result.lines):
        if merge.is_barline(line):
            current.end = index
            if current.data_lines:
                slices.append(current)
                ordinal += 1
            current = MeasureSlice(ordinal, index + 1, index, meter, [dict(k) for k in keysigs], list(clefs))
            continue
        if line.startswith("*"):
            fields = line.split(TAB)
            if len(fields) != spines:
                current.regular = False
                continue
            for column, token in enumerate(fields):
                if token in ("*^", "*v", "*+", "*-"):
                    current.regular = False
                parsed = parse_keysig(token)
                if parsed is not None:
                    keysigs[column] = parsed
                    current.keysigs[column] = dict(parsed)
                if token.startswith("*clef"):
                    clefs[column] = token
                    current.clefs[column] = token
                found = _RE_METER.match(token)
                if found:
                    meter = Fraction(int(found.group(1)), int(found.group(2)))
                    current.meter = meter
            continue
        if not merge.is_data_line(line):
            continue
        if len(line.split(TAB)) != spines:
            current.regular = False
        current.data_lines.append(index)
    current.end = len(result.lines) - 1
    if current.data_lines:
        slices.append(current)
    roles = merge.incomplete_roles(result)
    for piece in slices:
        piece.role = roles.get(piece.ordinal)
        piece.target = piece.meter
        if piece.role in incomplete_measures.SPLIT_ROLES:
            piece.target = merge.measure_length(piece.lines(result), spines)
    return slices


def chunk_duration_ok(lines: list[str], spines: int, meter: Optional[Fraction], lenient: bool = False) -> Optional[bool]:
    """Tổng trường độ từng spine của một ô có bằng số chỉ nhịp không (None nếu không kiểm được).
    ``meter``: tổng cần có, thường là :attr:`MeasureSlice.target` (số chỉ nhịp, hoặc độ dài phần ô bị vạch nhịp chia
    đôi). ``lenient``: ô đầu/cuối bài được phép ngắn hơn."""
    if meter is None:
        return None
    sums = [Fraction(0)] * spines
    for line in lines:
        if not merge.is_data_line(line):
            continue
        fields = line.split(TAB)
        if len(fields) != spines:
            return None
        for index, token in enumerate(fields):
            duration = merge.token_duration(token)
            if duration is not None:
                sums[index] += duration
    for total in sums:
        if total == 0:
            continue
        if (total > meter) if lenient else (total != meter):
            return False
    return True


# ====================================================================== kiểm tra


def _vocal_range(clef: Optional[str]) -> tuple[int, int]:
    if clef and clef.startswith("*clefF"):
        return _RANGE_BASS
    if clef and clef.startswith("*clefC"):
        return _RANGE_ALTO
    return _RANGE_TREBLE


def melodic_spines(spines: int, roles_top_down: Optional[list[str]]) -> list[int]:
    """Spine (đếm từ dưới lên như kern) được kiểm tầm âm/bước nhảy: khuông giọng hát/khuông đơn.

    Không biết vai trò: bản một spine coi là giai điệu; bản nhiều spine thì không kiểm (có thể là piano)."""
    if roles_top_down and len(roles_top_down) == spines:
        bottom_up = list(reversed(roles_top_down))
        return [i for i, role in enumerate(bottom_up) if role == ROLE_SINGLE]
    return [0] if spines == 1 else []


@dataclass
class Finding:
    flag: str
    reason: str


def analyze(
    result: merge.MergeResult, roles_top_down: Optional[list[str]] = None
) -> dict[int, list[Finding]]:
    """Các phát hiện RANGE/LEAP/ACCIDENTAL theo số thứ tự ô."""
    spines = result.spines
    slices = slice_measures(result)
    findings: dict[int, list[Finding]] = {}

    def add(ordinal: int, flag: str, reason: str) -> None:
        bucket = findings.setdefault(ordinal, [])
        if not any(f.flag == flag for f in bucket):
            bucket.append(Finding(flag, reason))

    for spine in melodic_spines(spines, roles_top_down):
        label = "giọng hát" if roles_top_down and len(roles_top_down) > 1 else "giai điệu"
        sequence: list[tuple[int, Note]] = []  # (ô, nốt) theo thứ tự, chỉ nốt đơn (bỏ hợp âm)
        rare: dict[tuple[str, int], list[int]] = {}
        for piece in slices:
            low, high = _vocal_range(piece.clefs[spine])
            keysig = piece.keysigs[spine]
            for index in piece.data_lines:
                fields = result.lines[index].split(TAB)
                if len(fields) != spines:
                    continue
                token = fields[spine]
                if token == "." or "q" in token or "Q" in token:
                    continue
                subs = token.split(" ")
                notes = [n for n in (parse_note(s, keysig) for s in subs) if n is not None]
                for note in notes:
                    if note.midi < low or note.midi > high:
                        add(
                            piece.ordinal,
                            FLAG_RANGE,
                            f"Nốt {midi_name(note.midi, note.alter)} của {label} nằm ngoài tầm thường gặp "
                            f"({midi_name(low)}–{midi_name(high)}), có thể đọc lệch quãng tám",
                        )
                    if note.explicit and note.alter != keysig.get(note.letter, 0):
                        rare.setdefault((note.letter, note.alter), []).append(piece.ordinal)
                if len(notes) == 1 and len(subs) == 1:
                    sequence.append((piece.ordinal, notes[0]))

        # Nốt "vọt": lệch >= _SPIKE_SEMITONES so với CẢ hai nốt bên cạnh, cùng một phía
        spikes: set[int] = set()
        for position in range(1, len(sequence) - 1):
            before = sequence[position][1].midi - sequence[position - 1][1].midi
            after = sequence[position][1].midi - sequence[position + 1][1].midi
            if abs(before) >= _SPIKE_SEMITONES and abs(after) >= _SPIKE_SEMITONES and (before > 0) == (after > 0):
                spikes.add(position)
                ordinal, note = sequence[position]
                add(
                    ordinal,
                    FLAG_LEAP,
                    f"Nốt {midi_name(note.midi, note.alter)} vọt {'lên' if before > 0 else 'xuống'} rồi quay lại "
                    "ngay, có thể đọc lệch quãng tám hoặc lệch dòng kẻ",
                )
        # Bước nhảy quá một quãng tám không dính tới nốt vọt (nốt vọt đã được đánh dấu ở ô của nó)
        for position in range(1, len(sequence)):
            if position in spikes or position - 1 in spikes:
                continue
            ordinal, note = sequence[position]
            previous = sequence[position - 1][1]
            jump = note.midi - previous.midi
            if abs(jump) > _MAX_LEAP:
                add(
                    ordinal,
                    FLAG_LEAP,
                    f"Giai điệu nhảy {abs(jump)} nửa cung ({midi_name(previous.midi, previous.alter)} → "
                    f"{midi_name(note.midi, note.alter)}), quá một quãng tám",
                )

        if len(sequence) >= _ACCIDENTAL_MIN_NOTES:
            for (letter, alter), where in rare.items():
                if len(where) == 1:
                    sign = {1: "thăng", -1: "giáng", 0: "bình"}.get(alter, "hóa")
                    add(
                        where[0],
                        FLAG_ACCIDENTAL,
                        f"Dấu {sign} trên nốt {letter.upper()} chỉ xuất hiện một lần trong {label} và nằm ngoài "
                        "hóa biểu, kiểm tra xem có phải vết bẩn/chữ bị đọc thành dấu hóa",
                    )
    return findings


_BASE_REASONS = {
    FLAG_DURATION: "Tổng trường độ không khớp số chỉ nhịp",
    FLAG_COUNT: "Số ô của hệ này khác số ô đếm trên ảnh, có thể thừa hoặc thiếu ô",
    FLAG_LAYOUT: "Bố cục trang này không rõ (các hệ khác số khuông), chưa kiểm được số ô và số khuông: đối chiếu cả trang",
    FLAG_ENGINE: "Một engine nhận diện khác đọc ô này khác, cả hai cách đều đúng trường độ",
}
"""Lý do của các cờ do bước khác gắn sẵn (PDF_MISMATCH có lý do riêng từng ô nên tính lại trong :func:`annotate`)."""


def confidence_of(flags: list[str], stable: bool = False, ai_confirmed: bool = False) -> float:
    value = 1.0 - sum(FLAG_WEIGHTS.get(f, 0.2) for f in set(flags))
    if stable:
        value += STABLE_BONUS
    if ai_confirmed:
        value += AI_CONFIRMED_BONUS
    return round(min(1.0, max(0.0, value)), 2)


def annotate(
    entries: list[dict], result: merge.MergeResult, roles_top_down: Optional[list[str]] = None
) -> list[dict]:
    """Thêm cờ RANGE/LEAP/ACCIDENTAL/PDF_MISMATCH, ``confidence`` và ``reasons`` vào các ô của ``measureMap`` (sửa tại chỗ).

    Gọi lại được nhiều lần (sau khi đọc lại hoặc AI sửa ô): mỗi lần tính lại từ cờ hiện có, giữ thông tin đọc lại/AI
    trong các khóa riêng ``_stable``/``_ai``/``_notes``/``_glyph`` (bỏ đi trước khi gửi về Java bằng :func:`public_entries`).
    """
    findings = analyze(result, roles_top_down)
    slices = {piece.ordinal: piece for piece in slice_measures(result)} if any("_glyph" in e for e in entries) else {}
    ottava = ottava_spines(result) if slices else set()
    for entry in entries:
        flags = [f for f in entry.get("flags", []) if f not in (FLAG_RANGE, FLAG_LEAP, FLAG_ACCIDENTAL, FLAG_PDF)]
        reasons = [_BASE_REASONS[f] for f in flags if f in _BASE_REASONS]
        confirmed = False
        evidence, piece = entry.get("_glyph"), slices.get(entry["measure"])
        if evidence is not None and piece is not None:
            pdf_findings, confirmed = compare_glyphs(evidence, piece, result, ottava)
            for found in pdf_findings:
                flags.append(found.flag)
                reasons.append(found.reason)
        for found in findings.get(entry["measure"], []):
            if confirmed and found.flag in (FLAG_RANGE, FLAG_LEAP):
                continue  # cao độ đã khớp từng nốt với PDF gốc: cờ đoán theo nhạc lý là báo nhầm
            flags.append(found.flag)
            reasons.append(found.reason)
        reasons.extend(entry.get("_notes", []))
        entry["flags"] = flags
        entry["reasons"] = reasons
        ai = entry.get("_ai") or {}
        # đọc lại ổn định / engine khác đọc giống hệt / khớp từng nốt với ký hiệu của PDF gốc
        stable = bool(entry.get("_stable")) or bool(entry.get("_agree")) or confirmed
        entry["confidence"] = confidence_of(flags, stable, ai.get("verdict") == "confirmed")
    return entries


# ====================================================================== đối chiếu với ký hiệu của PDF vector

_RE_CLEF_TOKEN = re.compile(r"^\*clef([GFC])([v^]*)(\d)$")
_CLEF_REFERENCE = {"G": 7 * 4 + 4, "F": 7 * 3 + 3, "C": 7 * 4}
"""Bậc diatonic tuyệt đối (C0 = 0) của nốt mà khóa chỉ: Sol4, Fa3, Đô4."""

_RE_OTTAVA = re.compile(r"^\*X?(?:8va|8ba|15ma|15mb)")
_RE_DOTS = re.compile(r"^[^\d]*\d+(?:%\d+)?(\.*)")


def clef_bottom(token: Optional[str]) -> Optional[int]:
    """Bậc diatonic của dòng kẻ dưới cùng theo khóa kern (``*clefG2``, ``*clefF4``, ``*clefC3``, ``*clefGv2``...); None
    nếu không có/không nhận ra khóa."""
    match = _RE_CLEF_TOKEN.match(token or "")
    if match is None:
        return None
    letter, shift, line = match.groups()
    return _CLEF_REFERENCE[letter] - 2 * (int(line) - 1) + 7 * (shift.count("^") - shift.count("v"))


def ottava_spines(result: merge.MergeResult) -> set[int]:
    """Spine có dấu 8va/8vb ở đâu đó: cao độ ghi trên khuông khác cao độ kern, không so vị trí đầu nốt được."""
    out: set[int] = set()
    for line in result.lines:
        if line.startswith("*"):
            for column, token in enumerate(line.split(TAB)):
                if _RE_OTTAVA.match(token):
                    out.add(column)
    return out


def _kern_glyph_view(
    lines: list[str], spines: int, clefs: list[Optional[str]], ottava: set[int]
) -> tuple[int, int, list[Optional[list[int]]]]:
    """``(số đầu nốt, số chấm dôi, vị trí khuông các nốt của từng spine)`` của một ô kern, theo cách PDF vẽ: mỗi nốt
    (kể cả trong hợp âm, nốt nối, nốt hoa mỹ) là một đầu nốt, mỗi dấu chấm của trường độ (cả dấu lặng) là một chấm dôi.
    Vị trí khuông = bậc diatonic - bậc dòng kẻ dưới cùng theo khóa; None cho spine không so được (khóa lạ, 8va, tách bè)."""
    heads = dots = 0
    current = list(clefs)
    steps: list[Optional[list[int]]] = [None if column in ottava else [] for column in range(spines)]
    for line in lines:
        if line.startswith("*"):
            fields = line.split(TAB)
            if len(fields) != spines:
                steps = [None] * spines
                continue
            for column, token in enumerate(fields):
                if token.startswith("*clef"):
                    current[column] = token
            continue
        if not merge.is_data_line(line):
            continue
        fields = line.split(TAB)
        if len(fields) != spines:
            steps = [None] * spines
        for column, cell in enumerate(fields):
            for sub in cell.split(" "):
                if not sub or sub == "." or "yy" in sub:
                    continue
                found = _RE_DOTS.match(sub)
                if found:
                    dots += len(found.group(1))
                if "r" in sub:
                    continue
                pitch = _RE_PITCH.search(sub)
                if pitch is None:
                    continue
                heads += 1
                if column >= spines or steps[column] is None:
                    continue
                bottom = clef_bottom(current[column])
                if bottom is None:
                    steps[column] = None
                    continue
                run = pitch.group(0)[: len(pitch.group(0)) - len(pitch.group(2))]
                octave = 3 + len(run) if run[0].islower() else 4 - len(run)
                steps[column].append(7 * octave + "cdefgab".index(run[0].lower()) - bottom)  # type: ignore[union-attr]
    return heads, dots, steps


def compare_glyphs(
    evidence: dict, piece: MeasureSlice, result: merge.MergeResult, ottava: set[int]
) -> tuple[list["Finding"], bool]:
    """So một ô kern với bằng chứng PDF của ô đó (:meth:`app.omr.glyphs.GlyphPage.measure`). Trả ``(phát hiện, khớp
    hoàn toàn)``; khớp hoàn toàn = cùng số đầu nốt, số chấm dôi và cao độ từng khuông (mọi khuông so được)."""
    return glyph_findings(evidence, piece.lines(result), result.spines, list(piece.clefs), ottava)


def glyph_findings(
    evidence: dict, lines: list[str], spines: int, clefs: list[Optional[str]], ottava: set[int]
) -> tuple[list["Finding"], bool]:
    """Như :func:`compare_glyphs` cho các dòng kern bất kỳ của một ô (vd. cách đọc của engine khác), ``clefs``: khóa của
    từng spine ở đầu ô."""
    heads, dots, steps = _kern_glyph_view(lines, spines, list(clefs), ottava)
    findings: list[Finding] = []
    if heads != evidence["heads"]:
        findings.append(
            Finding(FLAG_PDF, f"Bản PDF gốc có {evidence['heads']} đầu nốt ở ô này, bản số có {heads}: có nốt thừa hoặc thiếu")
        )
    if dots != evidence["dots"]:
        findings.append(
            Finding(FLAG_PDF, f"Bản PDF gốc có {evidence['dots']} chấm dôi ở ô này, bản số có {dots}: kiểm tra trường độ")
        )
    staves = evidence.get("staves") or []
    compared = len(staves) == spines
    if compared:
        for column in range(spines):
            staff = spines - 1 - column  # spine 1 của kern là khuông DƯỚI cùng
            kern_steps = steps[column]
            if kern_steps is None:
                compared = False
                continue
            if len(kern_steps) == len(staves[staff]) and sorted(kern_steps) != sorted(staves[staff]):
                label = f"khuông {staff + 1}" if spines > 1 else "ô này"
                findings.append(Finding(FLAG_PDF, f"Cao độ ở {label} khác ký hiệu nhạc trong PDF gốc"))
    return findings, not findings and compared


def public_entries(entries: list[dict]) -> list[dict]:
    """Bản gửi về Java: bỏ các khóa nội bộ bắt đầu bằng ``_``."""
    return [{k: v for k, v in e.items() if not k.startswith("_")} for e in entries]


def summary(entries: list[dict]) -> dict:
    """Tóm tắt cho ``measureCheck.review``."""
    by_flag: dict[str, int] = {}
    for entry in entries:
        for flag in entry.get("flags", []):
            by_flag[flag] = by_flag.get(flag, 0) + 1
    return {
        "measures": len(entries),
        "flagged": sum(1 for e in entries if e.get("flags")),
        "lowConfidence": sum(1 for e in entries if e.get("confidence", 1.0) < REVIEW_THRESHOLD),
        "byFlag": by_flag,
    }


def replace_measure(
    result: merge.MergeResult, piece: MeasureSlice, new_data: list[str]
) -> merge.MergeResult:
    """Thay các dòng dữ liệu của một ô (giữ dòng diễn giải và vạch nhịp) và dựng lại văn bản kern."""
    old = result.lines[piece.start : piece.end + 1]
    page = result.line_pages[piece.data_lines[0]] if piece.data_lines else result.line_pages[piece.start]
    head = old[: _first_data(old)]
    tail = [old[-1]] if old and merge.is_barline(old[-1]) else []
    replacement = head + [line for line in new_data if merge.is_data_line(line)] + tail
    lines = result.lines[: piece.start] + replacement + result.lines[piece.end + 1 :]
    line_pages = result.line_pages[: piece.start] + [page] * len(replacement) + result.line_pages[piece.end + 1 :]
    text = "\n".join([result.header, *lines, TAB.join(["*-"] * result.spines)]) + "\n"
    return merge.MergeResult(
        text=text,
        spines=result.spines,
        warnings=list(result.warnings),
        line_pages=line_pages,
        lines=lines,
        header=result.header,
    )


def _first_data(lines: list[str]) -> int:
    for index, line in enumerate(lines):
        if merge.is_data_line(line):
            return index
    return len(lines)
