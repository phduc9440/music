"""Đọc nốt từ MusicXML dạng partwise bằng thư viện chuẩn (đặc tả mục 2.4).

Dùng chung cho hai việc: xác định staff nào là tay phải khi chuẩn hóa (trung bình cao độ) và ghi MIDI. Vị trí và độ dài
tính bằng **phách đen** (``Fraction``) nên không trôi số khi ``divisions`` thay đổi giữa bài.

Chưa hỗ trợ (không cần cho đầu ra của Transcoda): dấu lặp, nốt trang trí (bị bỏ qua), nốt không cao độ (bị bỏ qua).
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from fractions import Fraction
from typing import Optional

from app.convert.errors import ConversionError

STEP_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


@dataclass
class NoteEvent:
    """Một nốt đã gộp các nốt nối (tie): ``staff`` bắt đầu từ 1, ``start``/``length`` tính bằng phách đen."""

    staff: int
    start: Fraction
    length: Fraction
    midi: int


def child_text(element: ET.Element, tag: str) -> Optional[str]:
    child = element.find(tag)
    if child is None or child.text is None:
        return None
    text = child.text.strip()
    return text or None


def child_int(element: ET.Element, tag: str) -> Optional[int]:
    text = child_text(element, tag)
    if text is None:
        return None
    try:
        return int(text)
    except ValueError:
        try:
            return int(float(text))  # một số bộ xuất ghi "480.0"
        except ValueError as exc:
            raise ConversionError(f"MusicXML có <{tag}> không phải số: {text!r}") from exc


def pitch_to_midi(pitch: ET.Element) -> Optional[int]:
    """``<pitch>`` -> số MIDI 0-127 (``alter`` lẻ như 1/4 cung được làm tròn), hoặc None nếu thiếu thông tin."""
    step = child_text(pitch, "step")
    octave = child_int(pitch, "octave")
    if step is None or octave is None or step.upper() not in STEP_SEMITONE:
        return None
    alter_text = child_text(pitch, "alter")
    try:
        alter = round(float(alter_text)) if alter_text is not None else 0
    except ValueError:
        alter = 0
    return max(0, min(127, 12 * (octave + 1) + STEP_SEMITONE[step.upper()] + alter))


def current_divisions(attributes: ET.Element, fallback: int) -> int:
    value = child_int(attributes, "divisions")
    if value is None:
        return fallback
    if value <= 0:
        raise ConversionError("MusicXML có <divisions> không dương")
    return value


def parse_part_events(part: ET.Element) -> tuple[list[NoteEvent], Fraction]:
    """Đọc mọi nốt của một ``<part>``. Trả ``(danh_sách_nốt_theo_thời_gian, tổng_độ_dài_phách_đen)``.

    Con trỏ thời gian đi theo ``<note>`` (trừ nốt trong hợp âm ``<chord/>``), ``<forward>`` và ``<backup>`` như đặc tả
    MusicXML; sang ô nhịp mới thì cộng vị trí xa nhất mà con trỏ từng tới trong ô nhịp trước (ô nhịp thiếu/thừa phách vẫn
    nối đúng). Nốt nối ``<tie type="stop"/>`` được cộng dồn vào nốt trước cùng staff và cao độ.
    """
    events: list[NoteEvent] = []
    open_ties: dict[tuple[int, int], NoteEvent] = {}
    divisions = 1
    measure_start = Fraction(0)

    for measure in part.findall("measure"):
        pos = Fraction(0)
        farthest = Fraction(0)
        last_start = Fraction(0)
        for element in measure:
            tag = element.tag
            if tag == "attributes":
                divisions = current_divisions(element, divisions)
            elif tag == "forward":
                pos += Fraction(child_int(element, "duration") or 0, divisions)
            elif tag == "backup":
                pos -= Fraction(child_int(element, "duration") or 0, divisions)
            elif tag == "note":
                duration = child_int(element, "duration")
                if duration is None or element.find("grace") is not None:
                    continue  # nốt trang trí không chiếm thời gian
                length = Fraction(duration, divisions)
                is_chord = element.find("chord") is not None
                start = last_start if is_chord else pos
                if not is_chord:
                    last_start = start
                    pos = start + length
                pitch = element.find("pitch")
                midi = pitch_to_midi(pitch) if pitch is not None else None
                if midi is None:  # nghỉ hoặc nốt không cao độ
                    farthest = max(farthest, pos)
                    continue
                staff = child_int(element, "staff") or 1
                _add_note(events, open_ties, element, staff, measure_start + start, length, midi)
            farthest = max(farthest, pos)
        measure_start += farthest

    events.sort(key=lambda e: (e.start, e.staff, e.midi))
    return events, measure_start


def _add_note(
    events: list[NoteEvent],
    open_ties: dict[tuple[int, int], NoteEvent],
    note: ET.Element,
    staff: int,
    start: Fraction,
    length: Fraction,
    midi: int,
) -> None:
    ties = {t.get("type") for t in note.findall("tie")}
    key = (staff, midi)
    if "stop" in ties and key in open_ties:
        open_ties[key].length += length
        if "start" not in ties:
            del open_ties[key]
        return
    event = NoteEvent(staff=staff, start=start, length=length, midi=midi)
    events.append(event)
    if "start" in ties:
        open_ties[key] = event
