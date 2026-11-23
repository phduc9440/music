"""Nhạc lý phụ trợ cho gợi ý hợp âm: đoán giọng của giai điệu (ghi vào mô tả đề xuất) và đánh vần tên nốt.

Việc chọn hợp âm do model AutoHarmonizer làm (``app/chords/autoharmonizer``); file này không còn từ vựng hay bảng xác suất.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from app.chords.melody import MelodyNote

SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


@dataclass(frozen=True)
class Key:
    tonic: int
    mode: Literal["major", "minor"]
    fifths: int


def major_tonic_of(fifths: int) -> int:
    return (fifths * 7) % 12


def fifths_of(tonic: int, mode: str) -> int:
    """Số dấu hóa của giọng (âm = giáng), chọn trong khoảng -6..5 (Gb thay cho F#)."""
    major = tonic if mode == "major" else (tonic + 3) % 12
    value = (major * 7) % 12  # vì 7*7 ≡ 1 (mod 12), đây là nghịch đảo của major_tonic_of
    return value - 12 if value > 5 else value


def detect_key(notes: list[MelodyNote], fifths: Optional[int]) -> Key:
    """Đoán giọng bằng Krumhansl–Schmuckler của music21. Có hóa biểu thì chỉ chọn giữa giọng trưởng và giọng thứ song
    song của hóa biểu đó."""
    from music21 import note as m21note  # noqa: PLC0415
    from music21 import stream  # noqa: PLC0415

    if not notes:
        tonic = major_tonic_of(fifths or 0)
        return Key(tonic, "major", fifths or 0)

    s = stream.Stream()
    for item in notes:
        n = m21note.Note(item.midi)
        n.quarterLength = float(item.length)
        s.insert(float(item.start), n)
    analysed = s.analyze("key.krumhansl")
    candidates = [analysed] + list(analysed.alternateInterpretations)

    if fifths is None:
        best = analysed
        mode = "minor" if best.mode == "minor" else "major"
        tonic = best.tonic.pitchClass
        return Key(tonic, mode, fifths_of(tonic, mode))

    major = major_tonic_of(fifths)
    allowed = {(major, "major"), ((major + 9) % 12, "minor")}
    for k in candidates:  # đã sắp theo hệ số tương quan giảm dần
        if (k.tonic.pitchClass, k.mode) in allowed:
            return Key(k.tonic.pitchClass, k.mode, fifths)
    return Key(major, "major", fifths)


def spell_root(pc: int, key: Key, *, prefer_flat: bool = False) -> tuple[str, int]:
    """Tên nốt ``(step, alter)`` của một cao độ tuyệt đối (0–11): giọng có dấu giáng hoặc bậc giáng dùng tên giáng."""
    names = FLAT_NAMES if (prefer_flat or key.fifths < 0) else SHARP_NAMES
    name = names[pc % 12]
    return name[0], (1 if name.endswith("#") else -1 if name.endswith("b") else 0)


def key_name(key: Key) -> str:
    """``"C major"``, ``"F# minor"`` (tên giọng ghi vào kết quả và mô tả đề xuất)."""
    step, alter = spell_root(key.tonic, key)
    return f"{step}{'#' if alter > 0 else 'b' if alter < 0 else ''} {key.mode}"
