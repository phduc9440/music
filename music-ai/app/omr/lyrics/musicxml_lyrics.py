"""Đọc các lần đánh nốt của khuông giọng hát trong MusicXML đã chuẩn hóa và chèn ``<lyric>``.

Khuông nhận lời ca:
* bản có part tên "Giọng hát..." (``convert/musicxml`` tạo từ ``*Ivox``): part giọng hát đầu tiên, staff 1;
* không có: part đầu tiên nếu nó chỉ có MỘT khuông (bản giai điệu một khuông như thánh ca), staff 1;
* bản piano 2 khuông không có giọng hát: không gắn lời (trả None), vì lời ca nằm giữa hai khuông là trường hợp hiếm và dễ
  gắn nhầm tay.

Mỗi lần đánh = nốt đầu tiên (không phải ``<chord/>``) tại một thời điểm trên khuông đó, không tính dấu lặng và phần nối
tiếp của dấu nối. ``<lyric>`` được chèn vào nốt đó theo đúng thứ tự phần tử của MusicXML 4.0 (trước ``<play>``,
``<listen>``), MuseScore mở được.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional

from app.convert.musicxml import VOICE_NAME

_AFTER_LYRIC = ("play", "listen")


@dataclass
class MeasureAttacks:
    ordinal: int
    attacks: list[tuple[Fraction, Fraction, ET.Element]] = field(default_factory=list)
    """``(thời điểm, trường độ, phần tử <note>)`` theo thời gian, đơn vị phách đen."""

    length: Fraction = Fraction(0)
    """Độ dài ô theo số chỉ nhịp (phách đen)."""

    key_fifths: int = 0
    shows_time: bool = False
    """Ô này có ghi số chỉ nhịp (đầu bài hoặc đổi nhịp): vùng đầu hệ rộng hơn."""


def select_target(root: ET.Element) -> tuple[Optional[ET.Element], int, Optional[str]]:
    """``(part, staff, lý do nếu không có)``."""
    names = {sp.get("id"): (sp.findtext("part-name") or "").strip() for sp in root.iter("score-part")}
    parts = root.findall("part")
    for part in parts:
        if names.get(part.get("id"), "").startswith(VOICE_NAME) or names.get(part.get("id"), "").lower().startswith(
            "voice"
        ):
            return part, 1, None
    if parts:
        staves = max((int(el.text or "1") for el in parts[0].iter("staves")), default=1)
        if staves == 1:
            return parts[0], 1, None
    return None, 1, "bản nhạc không có khuông giọng hát (piano 2 khuông)"


def collect_attacks(part: ET.Element, staff: int) -> list[MeasureAttacks]:
    divisions = 1
    fifths = 0
    beats, beat_type = 4, 4
    out: list[MeasureAttacks] = []
    for ordinal, measure in enumerate(part.findall("measure"), start=1):
        info = MeasureAttacks(ordinal=ordinal)
        cursor = Fraction(0)
        last_onset = Fraction(0)
        seen: dict[Fraction, ET.Element] = {}
        durations: dict[Fraction, Fraction] = {}
        for el in measure:
            if el.tag == "attributes":
                if el.findtext("divisions"):
                    divisions = int(el.findtext("divisions") or 1)
                if el.findtext("key/fifths") is not None:
                    fifths = int(el.findtext("key/fifths") or 0)
                if el.findtext("time/beats"):
                    try:
                        beats = int((el.findtext("time/beats") or "4").split("+")[0])
                        beat_type = int(el.findtext("time/beat-type") or 4)
                        info.shows_time = True
                    except ValueError:
                        pass
            elif el.tag == "backup":
                cursor -= Fraction(int(el.findtext("duration") or 0), divisions)
            elif el.tag == "forward":
                cursor += Fraction(int(el.findtext("duration") or 0), divisions)
            elif el.tag == "note":
                if el.find("grace") is not None:
                    continue
                duration = Fraction(int(el.findtext("duration") or 0), divisions)
                chord = el.find("chord") is not None
                onset = last_onset if chord else cursor
                if not chord:
                    last_onset = cursor
                    cursor += duration
                if int(el.findtext("staff") or 1) != staff or el.find("rest") is not None:
                    continue
                ties = {t.get("type") for t in el.findall("tie")}
                if "stop" in ties:
                    continue
                if onset not in seen:
                    seen[onset] = el
                    durations[onset] = duration
        info.attacks = [(o, durations[o], seen[o]) for o in sorted(seen)]
        info.length = Fraction(4 * beats, beat_type)
        info.key_fifths = fifths
        out.append(info)
    return out


def clear_lyrics(measures: list[MeasureAttacks]) -> None:
    for m in measures:
        for _o, _d, note in m.attacks:
            for lyric in note.findall("lyric"):
                note.remove(lyric)


def add_lyric(note: ET.Element, number: int, text: str, syllabic: str, extend: bool = False) -> None:
    lyric = ET.Element("lyric", {"number": str(number)})
    ET.SubElement(lyric, "syllabic").text = syllabic
    ET.SubElement(lyric, "text").text = text
    if extend:
        ET.SubElement(lyric, "extend")
    children = list(note)
    position = len(children)
    for index, child in enumerate(children):
        if child.tag in _AFTER_LYRIC:
            position = index
            break
    # Các lời cùng nốt xếp theo số lời
    existing = [c for c in children if c.tag == "lyric"]
    for c in existing:
        try:
            if int(c.get("number", "1")) > number:
                position = min(position, children.index(c))
        except ValueError:
            pass
    note.insert(position, lyric)
