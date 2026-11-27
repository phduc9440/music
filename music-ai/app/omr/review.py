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

Mỗi ô có ``confidence`` trong [0, 1] (1 trừ tổng trọng số các cờ) và ``reasons`` (câu tiếng Việt cho người dùng).
Khuông piano chỉ được kiểm trường độ (tầm âm và bước nhảy của piano quá rộng để đặt luật chung).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional

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

FLAG_WEIGHTS: dict[str, float] = {
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
    return slices


def chunk_duration_ok(lines: list[str], spines: int, meter: Optional[Fraction], lenient: bool = False) -> Optional[bool]:
    """Tổng trường độ từng spine của một ô có bằng số chỉ nhịp không (None nếu không kiểm được).
    ``lenient``: ô đầu/cuối bài được phép ngắn hơn."""
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
    """Thêm cờ RANGE/LEAP/ACCIDENTAL, ``confidence`` và ``reasons`` vào các ô của ``measureMap`` (sửa tại chỗ).

    Gọi lại được nhiều lần (sau khi đọc lại hoặc AI sửa ô): mỗi lần tính lại từ cờ hiện có, giữ thông tin đọc lại/AI
    trong các khóa riêng ``_stable``/``_ai``/``_notes`` (bỏ đi trước khi gửi về Java bằng :func:`public_entries`).
    """
    findings = analyze(result, roles_top_down)
    for entry in entries:
        flags = [f for f in entry.get("flags", []) if f not in (FLAG_RANGE, FLAG_LEAP, FLAG_ACCIDENTAL)]
        reasons = [_BASE_REASONS[f] for f in flags if f in _BASE_REASONS]
        for found in findings.get(entry["measure"], []):
            flags.append(found.flag)
            reasons.append(found.reason)
        reasons.extend(entry.get("_notes", []))
        entry["flags"] = flags
        entry["reasons"] = reasons
        ai = entry.get("_ai") or {}
        stable = bool(entry.get("_stable")) or bool(entry.get("_agree"))  # đọc lại ổn định / engine khác đọc giống hệt
        entry["confidence"] = confidence_of(flags, stable, ai.get("verdict") == "confirmed")
    return entries


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
