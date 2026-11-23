"""Tách giai điệu của bản nhạc thành các bước thời gian cho HMM (spec R3 mục 5.1).

- Bè giai điệu: part đầu tiên có nốt có cao độ (bỏ part bộ gõ), khuông 1.
- Tại mỗi thời điểm chỉ giữ nốt cao nhất đang vang (skyline); nốt nối đã được gộp bởi ``parse_part_events``.
- Bước: nửa ô với 4/4, 2/2, 6/8, 12/8 (khi ô đủ phách); cả ô với các nhịp khác hoặc ô thiếu phách (ô lấy đà).
- Ô đã có ``<harmony>`` bị khóa: không ghi đè, hợp âm có sẵn được dùng làm ràng buộc cho Viterbi.

Vị trí và độ dài tính bằng phách đen (``Fraction``), như ``app/convert/score_xml.py``.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional

from app.chords import ChordError
from app.convert.errors import ConversionError
from app.convert.score_xml import child_int, current_divisions, parse_part_events

MELODY_STAFF = 1

# (beats, beat-type) được chia đôi mỗi ô
HALF_MEASURE_TIMES = {(4, 4), (2, 2), (6, 8), (12, 8)}


@dataclass(frozen=True)
class MelodyNote:
    midi: int
    start: Fraction
    length: Fraction


@dataclass
class Step:
    measure_index: int
    start: Fraction
    offset_in_measure: Fraction
    length: Fraction
    notes: list[MelodyNote] = field(default_factory=list)
    existing: Optional[ET.Element] = None
    locked: bool = False


@dataclass
class MelodySource:
    root: ET.Element
    part: ET.Element
    staff: int
    staves: int
    fifths: Optional[int]
    steps: list[Step]
    prolog: str = ""
    """Phần trước thẻ gốc (khai báo XML, DOCTYPE, ghi chú) để ghi lại nguyên vẹn."""


@dataclass
class _MeasureInfo:
    element: ET.Element
    start: Fraction
    length: Fraction
    beats: int
    beat_type: int
    harmonies: list[tuple[Fraction, ET.Element]]  # (vị trí trong ô, phần tử)


def parse_xml(data: bytes) -> ET.Element:
    """Đọc MusicXML partwise; từ chối ENTITY (đầu vào do người dùng nhập) và XML hỏng."""
    if b"<!ENTITY" in data:
        raise ChordError("PARSE_ERROR", "MusicXML có khai báo ENTITY nên không được chấp nhận")
    try:
        # Giữ ghi chú và chỉ thị xử lý để file ghi ra chỉ khác ở các <harmony> được thêm
        parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True))
        root = ET.fromstring(data, parser=parser)
    except ET.ParseError as exc:
        raise ChordError("PARSE_ERROR", f"MusicXML hỏng: {exc}") from exc
    if root.tag != "score-partwise":
        raise ChordError("PARSE_ERROR", "Chỉ hỗ trợ MusicXML dạng score-partwise")
    return root


def load_melody(data: bytes, strip_harmonies: bool = False) -> MelodySource:
    """``strip_harmonies``: gỡ mọi ``<harmony>`` của mọi part trước (gợi ý lại từ đầu, không ô nào bị khóa)."""
    root = parse_xml(data)
    if strip_harmonies:
        for measure in root.iter("measure"):
            for harmony in measure.findall("harmony"):
                measure.remove(harmony)
    part = next((p for p in root.findall("part") if p.find(".//note/pitch") is not None), None)
    if part is None:
        raise ChordError("NO_MELODY", "Bản nhạc không có nốt nào có cao độ")

    try:
        measures = _measure_layout(part)
        events, _ = parse_part_events(part)
    except ChordError:
        raise
    except ConversionError as exc:
        raise ChordError("PARSE_ERROR", str(exc)) from exc

    staves = child_int(part.find("measure/attributes"), "staves") if part.find("measure/attributes") is not None else None
    fifths_text = part.findtext("measure/attributes/key/fifths")
    fifths = int(fifths_text.strip()) if fifths_text and fifths_text.strip().lstrip("-").isdigit() else None

    melody = [e for e in events if e.staff == MELODY_STAFF]
    steps: list[Step] = []
    carried: Optional[ET.Element] = None
    for index, info in enumerate(measures):
        locked = bool(info.harmonies)
        for offset, length in _split(info):
            start = info.start + offset
            existing = None
            if locked:
                before = [h for pos, h in info.harmonies if pos <= offset]
                existing = before[-1] if before else (carried if carried is not None else info.harmonies[0][1])
            steps.append(
                Step(
                    measure_index=index,
                    start=start,
                    offset_in_measure=offset,
                    length=length,
                    notes=_skyline(melody, start, start + length),
                    existing=existing,
                    locked=locked,
                )
            )
        if info.harmonies:
            carried = info.harmonies[-1][1]

    return MelodySource(
        root=root,
        part=part,
        staff=MELODY_STAFF,
        staves=staves or 1,
        fifths=fifths,
        steps=steps,
        prolog=_prolog(data),
    )


def _prolog(data: bytes) -> str:
    text = data.decode("utf-8", errors="replace")
    index = text.find("<score-partwise")
    return text[:index] if index > 0 else ""


def _measure_layout(part: ET.Element) -> list[_MeasureInfo]:
    """Vị trí, độ dài, nhịp và các ``<harmony>`` của từng ô (con trỏ đi như ``parse_part_events``)."""
    out: list[_MeasureInfo] = []
    divisions = 1
    beats, beat_type = 4, 4
    measure_start = Fraction(0)
    for measure in part.findall("measure"):
        pos = Fraction(0)
        farthest = Fraction(0)
        harmonies: list[tuple[Fraction, ET.Element]] = []
        for element in measure:
            tag = element.tag
            if tag == "attributes":
                divisions = current_divisions(element, divisions)
                time = element.find("time")
                if time is not None:
                    b, bt = child_int(time, "beats"), child_int(time, "beat-type")
                    if b and bt:
                        beats, beat_type = b, bt
            elif tag == "forward":
                pos += Fraction(child_int(element, "duration") or 0, divisions)
            elif tag == "backup":
                pos -= Fraction(child_int(element, "duration") or 0, divisions)
            elif tag == "harmony":
                offset = Fraction(child_int(element, "offset") or 0, divisions)
                harmonies.append((max(Fraction(0), pos + offset), element))
            elif tag == "note":
                duration = child_int(element, "duration")
                if duration is None or element.find("grace") is not None:
                    continue
                if element.find("chord") is None:
                    pos += Fraction(duration, divisions)
            farthest = max(farthest, pos)
        out.append(_MeasureInfo(measure, measure_start, farthest, beats, beat_type, harmonies))
        measure_start += farthest
    return out


def _split(info: _MeasureInfo) -> list[tuple[Fraction, Fraction]]:
    """Các bước ``(vị trí trong ô, độ dài)`` của một ô."""
    nominal = Fraction(info.beats * 4, info.beat_type)
    if info.length <= 0:
        return []
    if (info.beats, info.beat_type) in HALF_MEASURE_TIMES and info.length == nominal:
        half = info.length / 2
        return [(Fraction(0), half), (half, half)]
    return [(Fraction(0), info.length)]


def _skyline(events, start: Fraction, end: Fraction) -> list[MelodyNote]:
    """Nốt cao nhất ở mỗi thời điểm trong ``[start, end)``, cắt theo biên bước; các đoạn liền nhau của cùng một nốt
    được gộp lại."""
    clipped = []
    for e in events:
        s, t = max(e.start, start), min(e.start + e.length, end)
        if s < t:
            clipped.append((s, t, e))
    if not clipped:
        return []
    points = sorted({p for s, t, _ in clipped for p in (s, t)})
    out: list[MelodyNote] = []
    last_event = None
    for a, b in zip(points, points[1:]):
        active = [e for s, t, e in clipped if s <= a and t >= b]
        if not active:
            last_event = None
            continue
        top = max(active, key=lambda e: e.midi)
        if top is last_event and out and out[-1].start + out[-1].length == a:
            prev = out[-1]
            out[-1] = MelodyNote(prev.midi, prev.start, prev.length + (b - a))
        else:
            out.append(MelodyNote(top.midi, a, b - a))
        last_event = top
    return out
