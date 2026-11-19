"""Nhạc lý cho gợi ý hợp âm (spec R3 mục 5.2–5.3): đoán giọng, từ vựng hợp âm theo phong cách, viết và đọc tên hợp âm.

Mọi hợp âm được biểu diễn theo **bậc so với chủ âm** (``root`` là số bán cung từ chủ âm), nên dữ liệu ở giọng nào cũng
gộp được; chỉ lúc ghi ra mới đổi sang tên thật theo giọng.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Literal, Optional

from app.chords.melody import MelodyNote

QUALITIES = ("maj", "min", "7", "maj7", "min7", "hdim7", "sus4")

# Chữ sau tên gốc, khớp cách gõ của editor (music-web/src/components/editor/notation/harmony.ts)
SUFFIX = {"maj": "", "min": "m", "7": "7", "maj7": "maj7", "min7": "m7", "hdim7": "m7b5", "sus4": "sus4"}
QUALITY_OF_SUFFIX = {v: k for k, v in SUFFIX.items()}

# Giá trị <kind> của MusicXML
KIND_OF_QUALITY = {
    "maj": "major",
    "min": "minor",
    "7": "dominant",
    "maj7": "major-seventh",
    "min7": "minor-seventh",
    "hdim7": "half-diminished",
    "sus4": "suspended-fourth",
}
QUALITY_OF_KIND = {v: k for k, v in KIND_OF_QUALITY.items()}

# Loại hợp âm 3 nốt gần nhất, dùng khi từ vựng không có đúng loại
TRIAD_OF_QUALITY = {"maj": "maj", "7": "maj", "maj7": "maj", "sus4": "maj", "min": "min", "min7": "min", "hdim7": "min"}

STEP_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


@dataclass(frozen=True)
class ChordDef:
    label: str
    root: int
    quality: str
    bass: Optional[int] = None


@dataclass(frozen=True)
class Key:
    tonic: int
    mode: Literal["major", "minor"]
    fifths: int


def _c(label: str, root: int, quality: str, bass: Optional[int] = None) -> ChordDef:
    return ChordDef(label, root, quality, bass)


_POP_MAJOR = [
    _c("I", 0, "maj"),
    _c("ii", 2, "min"),
    _c("iii", 4, "min"),
    _c("IV", 5, "maj"),
    _c("V", 7, "maj"),
    _c("vi", 9, "min"),
    _c("V7", 7, "7"),
    _c("bVII", 10, "maj"),
]
_POP_MINOR = [
    _c("i", 0, "min"),
    _c("iv", 5, "min"),
    _c("v", 7, "min"),
    _c("V", 7, "maj"),
    _c("bIII", 3, "maj"),
    _c("bVI", 8, "maj"),
    _c("bVII", 10, "maj"),
]

VOCAB: dict[str, dict[str, list[ChordDef]]] = {
    "POP": {"major": _POP_MAJOR, "minor": _POP_MINOR},
    "BALLAD": {
        "major": _POP_MAJOR
        + [
            _c("Imaj7", 0, "maj7"),
            _c("IVmaj7", 5, "maj7"),
            _c("ii7", 2, "min7"),
            _c("vi7", 9, "min7"),
            _c("Vsus4", 7, "sus4"),
            _c("I/3", 0, "maj", 4),
            _c("V/7", 7, "maj", 11),
        ],
        "minor": _POP_MINOR + [_c("i7", 0, "min7"), _c("iv7", 5, "min7"), _c("bVImaj7", 8, "maj7")],
    },
    "JAZZ": {
        "major": [
            _c("Imaj7", 0, "maj7"),
            _c("ii7", 2, "min7"),
            _c("iii7", 4, "min7"),
            _c("IVmaj7", 5, "maj7"),
            _c("V7", 7, "7"),
            _c("vi7", 9, "min7"),
            _c("viiø7", 11, "hdim7"),
            _c("V7/ii", 9, "7"),
            _c("V7/V", 2, "7"),
            _c("V7/vi", 4, "7"),
        ],
        "minor": [
            _c("i7", 0, "min7"),
            _c("iiø7", 2, "hdim7"),
            _c("bIIImaj7", 3, "maj7"),
            _c("iv7", 5, "min7"),
            _c("V7", 7, "7"),
            _c("bVImaj7", 8, "maj7"),
            _c("bVII7", 10, "7"),
            _c("i", 0, "min"),
        ],
    },
}


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


def _name(pc: int, key: Key, prefer_flat: bool) -> str:
    step, alter = spell_root(pc, key, prefer_flat=prefer_flat)
    return step + ("#" if alter > 0 else "b" if alter < 0 else "")


def chord_symbol(chord: ChordDef, key: Key) -> str:
    flat = chord.label.startswith("b")
    text = _name(key.tonic + chord.root, key, flat) + SUFFIX[chord.quality]
    if chord.bass is not None:
        text += "/" + _name(key.tonic + chord.bass, key, flat)
    return text


_SYMBOL = re.compile(r"^([A-G])([#b]?)(.*?)(?:/([A-G][#b]?))?$")


def parse_symbol(text: str, key: Key) -> Optional[tuple[int, str]]:
    match = _SYMBOL.match(text.strip())
    if not match:
        return None
    step, accidental, suffix, _ = match.groups()
    quality = QUALITY_OF_SUFFIX.get(suffix)
    if quality is None:
        return None
    pc = STEP_PC[step] + (1 if accidental == "#" else -1 if accidental == "b" else 0)
    return (pc - key.tonic) % 12, quality


def parse_harmony(el: ET.Element, key: Key) -> Optional[tuple[int, str]]:
    step = (el.findtext("root/root-step") or "").strip().upper()
    quality = QUALITY_OF_KIND.get((el.findtext("kind") or "").strip())
    if step not in STEP_PC or quality is None:
        return None
    try:
        alter = round(float(el.findtext("root/root-alter") or 0))
    except ValueError:
        alter = 0
    return (STEP_PC[step] + alter - key.tonic) % 12, quality


def nearest_state(root: int, quality: str, states: list[ChordDef]) -> Optional[int]:
    """Chỉ số trạng thái khớp nhất: đúng gốc và loại (ưu tiên không có bass), rồi cùng gốc cùng loại 3 nốt, rồi cùng gốc."""

    def first(predicate) -> Optional[int]:
        matches = [i for i, c in enumerate(states) if predicate(c)]
        if not matches:
            return None
        plain = [i for i in matches if states[i].bass is None]
        return (plain or matches)[0]

    triad = TRIAD_OF_QUALITY.get(quality)
    for predicate in (
        lambda c: c.root == root and c.quality == quality,
        lambda c: c.root == root and c.quality == triad,
        lambda c: c.root == root and TRIAD_OF_QUALITY.get(c.quality) == triad,
        lambda c: c.root == root,
    ):
        found = first(predicate)
        if found is not None:
            return found
    return None
