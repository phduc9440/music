"""Chuẩn hóa MusicXML trước khi lưu (đặc tả mục 2.4, "Chuẩn hóa MusicXML").

Đầu ra có dạng:

* bản piano (mặc định, kern không ghi tên part hoặc mọi part tên "Piano"): đúng 1 ``<part>`` tên "Piano", id ``P1``;
  nhiều khuông (kern có 2 spine) được gộp thành nhiều **staff** trong cùng part (``<staves>2</staves>``, staff 1 = tay
  phải/khuông trên, staff 2 = tay trái/khuông dưới);
* bản có giọng hát (kern có dòng ``*Ivox``/``*Ipiano`` do bước ghép thêm theo bố cục trang, music21 đọc thành tên part
  "Voice"/"Piano"): mỗi khuông đơn là một part riêng
  ("Giọng hát", chương trình MIDI 53) đứng trên, các khuông piano gộp thành part "Piano" nhiều staff như trên; id
  ``P1``, ``P2``... từ trên xuống;
* ``<sound tempo>`` ở ô nhịp 1 theo ``tempo_bpm``;
* số ô nhịp đánh lại liên tục từ 1.

Vì sao không nhờ music21 gộp staff: cách music21 gom ``PartStaff`` thành một part phụ thuộc vào ``StaffGroup`` và khác
nhau giữa các phiên bản, còn bước này chỉ dùng thư viện chuẩn nên cho kết quả cố định và kiểm thử được mà không cần
music21. Đây cũng là bước ``/convert/normalize`` mà nhánh nhập file MusicXML (feature/export-format-conversion) sẽ dùng
lại; khi đó phải thay ``xml.etree`` bằng bộ đọc chống XXE (``defusedxml``) vì đầu vào không còn do music21 sinh ra.
"""

from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Optional

from app.convert.errors import ConversionError
from app.convert.score_xml import child_int, child_text, parse_part_events

XML_HEADER = (
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" '
    '"http://www.musicxml.org/dtds/partwise.dtd">\n'
)

DEFAULT_TEMPO_BPM = 100

PIANO_NAME = "Piano"
VOICE_NAME = "Giọng hát"
VOICE_MIDI_PROGRAM = 53
"""Chương trình MIDI (đánh số từ 1) cho giọng hát: 53 = Choir Aahs. Editor nhận cả tên "Giọng hát" lẫn chương trình này
là giọng hát."""

# Thứ tự phần tử con theo lược đồ MusicXML, dùng để chèn đúng chỗ
_NOTE_BEFORE_VOICE = {
    "type", "dot", "accidental", "time-modification", "stem", "notehead", "notehead-text", "staff", "beam",
    "notations", "lyric", "play", "listen",
}  # fmt: skip
_NOTE_BEFORE_STAFF = {"beam", "notations", "lyric", "play", "listen"}
_DIRECTION_BEFORE_STAFF = {"staff", "sound", "listening"}
_DIRECTION_BEFORE_SOUND = {"sound", "listening"}
_ATTR_AFTER_STAVES = {
    "part-symbol", "instruments", "clef", "staff-details", "transpose", "directive", "measure-style",
}  # fmt: skip
_ATTR_AFTER_CLEF = {"staff-details", "transpose", "directive", "measure-style"}

_MAJOR_KEYS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"]
_MINOR_KEYS = [
    "Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m",
]  # fmt: skip


@dataclass
class NormalizeResult:
    """Kết quả chuẩn hóa: XML đã tuần tự hóa và metadata rút từ chính XML đó (điền vào bảng ``scores``)."""

    xml: bytes
    measure_count: int
    staff_count: int
    key_signature: Optional[str]
    time_signature: Optional[str]
    tempo_bpm: int
    warnings: list[str] = field(default_factory=list)
    parts: list[str] = field(default_factory=lambda: [PIANO_NAME])
    """Tên các part từ trên xuống (``["Piano"]`` với bản piano, ``["Giọng hát", "Piano"]`` với bản có giọng hát)."""


# ====================================================================== điểm vào


def normalize_musicxml(data: bytes, tempo_bpm: Optional[int] = None) -> NormalizeResult:
    """Chuẩn hóa MusicXML partwise ``data``. ``tempo_bpm`` None thì giữ tempo đã có trong ô nhịp 1, không có thì 100.

    Ném :class:`ConversionError` nếu XML hỏng, không phải ``score-partwise``, không có part hoặc không có ô nhịp nào.
    """
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ConversionError(f"MusicXML không đọc được: {exc}") from exc
    if root.tag != "score-partwise":
        raise ConversionError(f"MusicXML phải là score-partwise, nhận được <{root.tag}>")

    warnings: list[str] = []
    parts = root.findall("part")
    if not parts:
        raise ConversionError("MusicXML không có <part> nào")
    if not any(p.findall("measure") for p in parts):
        raise ConversionError("MusicXML không có ô nhịp nào")

    names = _part_names(root)
    _strip_instrument_refs(root)
    groups = _group_parts(parts, names)
    if len(groups) == 1 and groups[0][0] is None:
        return _normalize_piano(root, parts, tempo_bpm, warnings)
    return _normalize_ensemble(root, groups, tempo_bpm, warnings)


def _normalize_piano(
    root: ET.Element, parts: list[ET.Element], tempo_bpm: Optional[int], warnings: list[str]
) -> NormalizeResult:
    """Đường cũ: mọi khuông gộp thành một part "Piano" nhiều staff."""
    ordered = _order_parts(parts)
    _rescale_divisions(ordered)
    merged = _merge_parts(ordered, warnings) if len(ordered) > 1 else ordered[0]
    merged.set("id", "P1")

    measures = merged.findall("measure")
    for number, measure in enumerate(measures, start=1):
        measure.set("number", str(number))
    _ensure_clef_numbers(merged)
    _drop_repeated_signatures(merged)
    _set_tempo(measures[0], tempo_bpm)
    _rebuild_part_list(root, merged)
    for old_part in root.findall("part"):
        root.remove(old_part)
    root.append(merged)  # part đã gộp là phần tử mới, chưa nằm trong cây

    ET.indent(root)
    xml = (XML_HEADER + ET.tostring(root, encoding="unicode")).encode("utf-8")
    summary = summarize(merged)
    return NormalizeResult(xml=xml, warnings=warnings, **summary)


def _normalize_ensemble(
    root: ET.Element,
    groups: list[tuple[Optional[str], list[ET.Element]]],
    tempo_bpm: Optional[int],
    warnings: list[str],
) -> NormalizeResult:
    """Bản có khuông đơn (giọng hát...): mỗi khuông đơn một part, các khuông piano gộp thành một part nhiều staff."""
    every_part = [p for _, members in groups for p in members]
    _rescale_divisions(every_part)
    outputs: list[tuple[str, ET.Element]] = []
    for name, members in groups:
        if name is None:  # nhóm piano
            ordered = _order_parts(members)
            part = _merge_parts(ordered, warnings) if len(ordered) > 1 else ordered[0]
            outputs.append((PIANO_NAME, part))
        else:
            outputs.append((name, members[0]))

    counts = [len(part.findall("measure")) for _, part in outputs]
    if len(set(counts)) > 1:
        warnings.append(f"Các part có số ô nhịp khác nhau {counts}")
    for index, (_, part) in enumerate(outputs, start=1):
        part.set("id", f"P{index}")
        for number, measure in enumerate(part.findall("measure"), start=1):
            measure.set("number", str(number))
        _ensure_clef_numbers(part)
        _drop_repeated_signatures(part)
    # Tempo có thể chỉ nằm ở một part (music21 ghi vào part chứa *MM); part trên cùng mang tempo cho cả bản và mọi
    # part khác đã có tempo ở ô nhịp 1 được đồng bộ theo, để không có hai tempo khác nhau
    bpm = tempo_bpm if tempo_bpm is not None else _existing_tempo([part for _, part in outputs])
    for index, (_, part) in enumerate(outputs):
        first = part.findall("measure")[0]
        if index == 0 or any(sound.get("tempo") for sound in first.iter("sound")):
            _set_tempo(first, bpm)

    _rebuild_part_list_ensemble(root, [name for name, _ in outputs])
    for old_part in root.findall("part"):
        root.remove(old_part)
    for _, part in outputs:
        root.append(part)

    ET.indent(root)
    xml = (XML_HEADER + ET.tostring(root, encoding="unicode")).encode("utf-8")
    summary = summarize(outputs[0][1])
    summary["staff_count"] = sum(summarize(part)["staff_count"] for _, part in outputs)
    return NormalizeResult(xml=xml, warnings=warnings, parts=[name for name, _ in outputs], **summary)


# ====================================================================== nhóm part theo tên


def _part_names(root: ET.Element) -> dict[str, str]:
    """``id part -> part-name`` theo ``<part-list>`` (music21 lấy tên từ mã nhạc cụ ``*Ivox``/``*Ipiano`` của kern)."""
    names: dict[str, str] = {}
    part_list = root.find("part-list")
    if part_list is None:
        return names
    for score_part in part_list.findall("score-part"):
        name = (child_text(score_part, "part-name") or "").strip()
        if score_part.get("id") and name:
            names[score_part.get("id")] = name
    return names


_VOICE_WORDS = ("voice", "vocal", "soprano", "mezzo", "alto", "tenor", "baritone", "choir", "giọng")


def _is_voice(name: Optional[str]) -> bool:
    """Tên part là giọng hát (``Voice`` do bước ghép thêm theo bố cục, hoặc tên giọng quen thuộc).

    Chỉ những tên này mới được tách thành part riêng; mọi tên khác (kể cả tên music21 tự đặt) đi đường piano cũ để bản
    piano không bị đổi đầu ra.
    """
    return bool(name) and any(word in name.lower() for word in _VOICE_WORDS)


def _group_parts(
    parts: list[ET.Element], names: dict[str, str]
) -> list[tuple[Optional[str], list[ET.Element]]]:
    """Chia part thành nhóm ``(tên, các part)``: mỗi part giọng hát là một nhóm riêng (tên hiển thị, ví dụ "Giọng hát"),
    mọi part còn lại gộp thành nhóm piano tên ``None`` đặt cuối.

    Giọng hát luôn đứng trên piano trong bản có đệm, nên thứ tự nhóm không dựa vào thứ tự part của music21; trong nhóm
    piano, :func:`_order_parts` sắp lại khuông trên/dưới theo khóa nhạc và cao độ.
    """
    singles: list[tuple[Optional[str], list[ET.Element]]] = []
    piano: list[ET.Element] = []
    for part in parts:
        name = names.get(part.get("id", ""))
        if _is_voice(name):
            singles.append((_display_name(name or ""), [part]))
        else:
            piano.append(part)
    # Nhiều giọng cùng tên (mỗi khuông đơn đều là *Ivox) thì đánh số từ trên xuống: Giọng hát 1, Giọng hát 2...
    labels = [label for label, _ in singles]
    if len(singles) > 1 and len(set(labels)) < len(labels):
        singles = [(f"{label} {index}", members) for index, (label, members) in enumerate(singles, start=1)]
    return singles + ([(None, piano)] if piano else [])


def _display_name(name: str) -> str:
    """Tên part tiếng Việt cho khuông đơn: ``Voice`` -> ``Giọng hát``, ``Voice 2`` -> ``Giọng hát 2``; tên khác giữ nguyên."""
    lowered = name.lower()
    if lowered == "voice":
        return VOICE_NAME
    if lowered.startswith("voice "):
        return f"{VOICE_NAME} {name[6:].strip()}"
    return name


def summarize(part: ET.Element) -> dict:
    """Metadata từ part đã chuẩn hóa: số ô nhịp, số staff, giọng (``G``, ``Bb``, ``F#m``), nhịp (``3/4``), tempo."""
    measures = part.findall("measure")
    key_signature = None
    time_signature = None
    staves = 1
    tempo = None
    for measure in measures:
        for attributes in measure.findall("attributes"):
            if key_signature is None:
                key = attributes.find("key")
                if key is not None:
                    key_signature = _key_name(child_int(key, "fifths"), child_text(key, "mode"))
            if time_signature is None:
                time = attributes.find("time")
                if time is not None:
                    beats, beat_type = child_text(time, "beats"), child_text(time, "beat-type")
                    if beats and beat_type:
                        time_signature = f"{beats}/{beat_type}"
            declared = child_int(attributes, "staves")
            if declared:
                staves = max(staves, declared)
        if tempo is None:
            for sound in measure.iter("sound"):
                if sound.get("tempo"):
                    tempo = round(float(sound.get("tempo")))
                    break
    return {
        "measure_count": len(measures),
        "staff_count": staves,
        "key_signature": key_signature,
        "time_signature": time_signature,
        "tempo_bpm": tempo or DEFAULT_TEMPO_BPM,
    }


def _key_name(fifths: Optional[int], mode: Optional[str]) -> Optional[str]:
    if fifths is None or not -7 <= fifths <= 7:
        return None
    if mode and mode.lower() == "minor":
        return _MINOR_KEYS[fifths + 7]
    return _MAJOR_KEYS[fifths + 7]


# ====================================================================== sắp xếp và đưa về cùng divisions


def _strip_instrument_refs(root: ET.Element) -> None:
    """Bỏ ``<instrument id=...>`` trong từng nốt: part-list được dựng lại nên các id đó không còn tồn tại."""
    for note in root.iter("note"):
        for instrument in note.findall("instrument"):
            note.remove(instrument)


def _order_parts(parts: list[ET.Element]) -> list[ET.Element]:
    """Sắp các part từ khuông trên xuống khuông dưới: khóa Sol trước khóa Fa, rồi cao độ trung bình giảm dần.

    Humdrum để spine trái (khuông dưới, tay trái) trước nên không thể giả định thứ tự part music21 trả về; đọc từ chính
    nội dung thì không phụ thuộc phiên bản music21.
    """
    if len(parts) == 1:
        return parts

    def key(part: ET.Element) -> tuple[int, float]:
        sign = None
        for clef in part.iter("clef"):
            sign = child_text(clef, "sign")
            break
        rank = 1 if sign == "F" else 0
        events, _ = parse_part_events(part)
        mean = sum(e.midi for e in events) / len(events) if events else 0.0
        return rank, -mean

    return sorted(parts, key=key)


def _rescale_divisions(parts: list[ET.Element]) -> None:
    """Đưa mọi part về cùng một ``divisions`` (bội chung nhỏ nhất) để ghép trong một part mà không lệch trường độ."""
    values = {
        child_int(a, "divisions") or 1 for p in parts for a in p.iter("attributes") if a.find("divisions") is not None
    }
    target = math.lcm(*values) if values else 1
    for part in parts:
        current = 1
        for measure in part.findall("measure"):
            for element in measure:
                if element.tag == "attributes":
                    divisions = element.find("divisions")
                    if divisions is not None:
                        current = child_int(element, "divisions") or current
                        divisions.text = str(target)
                elif element.tag in ("note", "forward", "backup"):
                    _scale(element, "duration", target // current)
                elif element.tag == "direction":
                    _scale(element, "offset", target // current)


def _scale(element: ET.Element, tag: str, factor: int) -> None:
    child = element.find(tag)
    if child is not None and child.text and factor != 1:
        child.text = str(int(float(child.text)) * factor)


# ====================================================================== gộp các part thành nhiều staff


def _merge_parts(parts: list[ET.Element], warnings: list[str]) -> ET.Element:
    """Gộp ``parts`` (khuông trên trước) thành một part nhiều staff: cùng ô nhịp, mỗi staff một khối nối nhau bằng
    ``<backup>`` về đầu ô nhịp, ``<staff>`` và ``<voice>`` được đánh lại để không trùng giữa các staff."""
    counts = [len(p.findall("measure")) for p in parts]
    if len(set(counts)) > 1:
        warnings.append(f"Các khuông có số ô nhịp khác nhau {counts}, ô nhịp thiếu được để trống")
    total = max(counts)
    measures_by_staff = [p.findall("measure") for p in parts]

    first_measure = measures_by_staff[0][0] if measures_by_staff[0] else None
    if first_measure is None or first_measure.find("attributes") is None:
        raise ConversionError("MusicXML thiếu <attributes> ở ô nhịp đầu của khuông trên")

    # Voice của staff dưới bắt đầu sau voice lớn nhất của các staff trên để không trùng nhau trong cùng part
    voice_offsets: list[int] = []
    running = 0
    for part in parts:
        voice_offsets.append(running)
        running += _max_voice(part)

    merged = ET.Element("part", {"id": "P1"})
    for index in range(total):
        blocks = [m[index] if index < len(m) else None for m in measures_by_staff]
        merged.append(_merge_measure(blocks, voice_offsets, len(parts), index))
    return merged


def _max_voice(part: ET.Element) -> int:
    best = 1
    for voice in part.iter("voice"):
        try:
            best = max(best, int((voice.text or "1").strip()))
        except ValueError:
            continue
    return best


def _merge_measure(
    blocks: list[Optional[ET.Element]], voice_offsets: list[int], staves: int, index: int
) -> ET.Element:
    first = blocks[0]
    merged = ET.Element("measure", dict(first.attrib) if first is not None else {"number": str(index + 1)})
    trailing_barlines: list[ET.Element] = []
    bottom_clefs_pending: list[ET.Element] = []

    for staff_index, block in enumerate(blocks):
        staff = staff_index + 1
        if block is None:
            continue
        if staff_index > 0:
            end = _cursor_end(merged)
            if end > 0:
                backup = ET.SubElement(merged, "backup")
                ET.SubElement(backup, "duration").text = str(end)
        for element in list(block):
            tag = element.tag
            if staff_index == 0:
                if tag == "barline":
                    # Vạch trái (mở đầu đoạn lặp) giữ ở đầu ô nhịp, các vạch còn lại dồn xuống cuối sau mọi staff
                    if element.get("location") == "left":
                        merged.append(element)
                    else:
                        trailing_barlines.append(element)
                    continue
                if tag == "attributes":
                    _prepare_top_attributes(element, staves, first_measure=(index == 0))
                elif tag in ("note", "direction", "forward"):
                    _apply_staff_and_voice(element, staff, voice_offsets[staff_index])
                merged.append(element)
                continue

            # staff dưới: chỉ giữ nốt, hướng dẫn, forward/backup và khóa nhạc của riêng staff đó
            if tag == "attributes":
                clefs = element.findall("clef")
                for clef in clefs:
                    clef.set("number", str(staff))
                at_start = _first_attributes_before_notes(merged) is not None and not _has_content_after_backup(merged)
                if clefs and at_start:
                    bottom_clefs_pending.extend(clefs)
                elif clefs:
                    holder = ET.SubElement(merged, "attributes")
                    for clef in clefs:
                        holder.append(clef)
            elif tag in ("note", "direction", "forward"):
                _apply_staff_and_voice(element, staff, voice_offsets[staff_index])
                merged.append(element)
            elif tag == "backup":
                merged.append(element)

    if bottom_clefs_pending:
        _merge_clefs_into_first_attributes(merged, bottom_clefs_pending)
    for barline in trailing_barlines:
        merged.append(barline)
    return merged


def _cursor_end(measure: ET.Element) -> int:
    """Vị trí con trỏ (đơn vị ``divisions``) ở cuối nội dung hiện có của ô nhịp, để ``<backup>`` về đầu ô nhịp."""
    pos = 0
    for element in measure:
        if element.tag == "note":
            if element.find("grace") is not None or element.find("chord") is not None:
                continue
            pos += child_int(element, "duration") or 0
        elif element.tag == "forward":
            pos += child_int(element, "duration") or 0
        elif element.tag == "backup":
            pos -= child_int(element, "duration") or 0
    return pos


def _first_attributes_before_notes(measure: ET.Element) -> Optional[ET.Element]:
    for element in measure:
        if element.tag == "attributes":
            return element
        if element.tag in ("note", "forward", "backup"):
            return None
    return None


def _has_content_after_backup(measure: ET.Element) -> bool:
    """Đã có nốt của staff dưới được thêm chưa (tức khóa nhạc đến muộn giữa ô nhịp)."""
    seen_backup = False
    for element in measure:
        if element.tag == "backup":
            seen_backup = True
        elif seen_backup and element.tag in ("note", "forward"):
            return True
    return False


def _merge_clefs_into_first_attributes(measure: ET.Element, clefs: list[ET.Element]) -> None:
    attributes = _first_attributes_before_notes(measure)
    if attributes is None:
        return
    for clef in clefs:
        _insert_before_first(attributes, clef, _ATTR_AFTER_CLEF)


def _prepare_top_attributes(attributes: ET.Element, staves: int, first_measure: bool) -> None:
    """Staff trên: đánh số khóa nhạc là 1 và (ở ô nhịp đầu) khai báo ``<staves>``."""
    for clef in attributes.findall("clef"):
        clef.set("number", "1")
    existing = attributes.find("staves")
    if existing is not None:
        existing.text = str(staves)
    elif first_measure and staves > 1:
        _insert_before_first(attributes, _text_element("staves", str(staves)), _ATTR_AFTER_STAVES)


def _ensure_clef_numbers(part: ET.Element) -> None:
    """Part nhiều staff mà khóa nhạc còn thiếu ``number`` (đầu vào đã gộp sẵn) thì gán theo thứ tự xuất hiện."""
    declared = 1
    for staves in part.iter("staves"):
        declared = max(declared, _int_text(staves))
    if declared <= 1:
        return
    for attributes in part.iter("attributes"):
        clefs = attributes.findall("clef")
        for position, clef in enumerate(clefs, start=1):
            if clef.get("number") is None and len(clefs) > 1:
                clef.set("number", str(position))


def _drop_repeated_signatures(part: ET.Element) -> None:
    """Bỏ ``<time>`` và ``<key>`` lặp lại đúng giá trị đang hiệu lực (kern ghép nhiều trang/hệ có dòng ``*M3/4`` ở mỗi chỗ
    nối nên music21 in lại số chỉ nhịp ở đầu mỗi hệ). Chỉ đổi nhịp/dấu hóa thật mới được giữ. Ô nhịp đầu luôn giữ nguyên.
    ``<attributes>`` rỗng sau khi bỏ cũng được xóa."""
    current: dict[tuple[str, Optional[str]], bytes] = {}
    for index, measure in enumerate(part.findall("measure")):
        for attributes in measure.findall("attributes"):
            for tag in ("time", "key"):
                for element in attributes.findall(tag):
                    key = (tag, element.get("number"))
                    signature = ET.tostring(_without_tail(element))
                    if index > 0 and current.get(key) == signature:
                        attributes.remove(element)
                    else:
                        current[key] = signature
            if index > 0 and len(attributes) == 0:
                measure.remove(attributes)


def _without_tail(element: ET.Element) -> ET.Element:
    copy = ET.fromstring(ET.tostring(element))
    copy.tail = None
    return copy


def _int_text(element: ET.Element) -> int:
    try:
        return int((element.text or "1").strip())
    except ValueError:
        return 1


def _apply_staff_and_voice(element: ET.Element, staff: int, voice_offset: int) -> None:
    """Đặt ``<staff>`` và dời ``<voice>`` (cộng ``voice_offset``) cho nốt/hướng dẫn/forward của một staff."""
    tag = element.tag
    voice = element.find("voice")
    if voice is not None:
        try:
            voice.text = str(int((voice.text or "1").strip()) + voice_offset)
        except ValueError:
            voice.text = str(1 + voice_offset)
    elif tag == "note":  # mọi nốt phải có voice để staff trên và dưới không dùng chung voice 1 ngầm định
        _insert_before_first(element, _text_element("voice", str(1 + voice_offset)), _NOTE_BEFORE_VOICE)

    staff_element = element.find("staff")
    if staff_element is not None:
        staff_element.text = str(staff)
    elif tag == "note":
        _insert_before_first(element, _text_element("staff", str(staff)), _NOTE_BEFORE_STAFF)
    elif tag == "direction":
        _insert_before_first(element, _text_element("staff", str(staff)), _DIRECTION_BEFORE_SOUND)
    elif tag == "forward":
        element.append(_text_element("staff", str(staff)))


# ====================================================================== tempo và part-list


def _existing_tempo(parts: list[ET.Element]) -> Optional[int]:
    """Tempo ``<sound tempo>`` đầu tiên ở ô nhịp 1 của các part, hoặc None."""
    for part in parts:
        measures = part.findall("measure")
        if not measures:
            continue
        for sound in measures[0].iter("sound"):
            if sound.get("tempo"):
                return round(float(sound.get("tempo")))
    return None


def _set_tempo(first_measure: ET.Element, tempo_bpm: Optional[int]) -> None:
    """Bảo đảm ô nhịp 1 có ``<sound tempo>``: sửa cái đã có, chưa có thì thêm hướng dẫn tempo (đặc tả mục 2.4)."""
    sounds = [s for s in first_measure.iter("sound") if s.get("tempo")]
    if sounds:
        if tempo_bpm is not None:
            for sound in sounds:
                sound.set("tempo", str(tempo_bpm))
            for direction in first_measure.findall("direction"):
                if direction.find("sound") is not None and direction.find("sound").get("tempo"):
                    for per_minute in direction.iter("per-minute"):
                        per_minute.text = str(tempo_bpm)
        return

    bpm = tempo_bpm if tempo_bpm is not None else DEFAULT_TEMPO_BPM
    direction = ET.Element("direction", {"placement": "above"})
    direction_type = ET.SubElement(direction, "direction-type")
    metronome = ET.SubElement(direction_type, "metronome", {"parentheses": "no"})
    ET.SubElement(metronome, "beat-unit").text = "quarter"
    ET.SubElement(metronome, "per-minute").text = str(bpm)
    ET.SubElement(direction, "staff").text = "1"
    ET.SubElement(direction, "sound", {"tempo": str(bpm)})

    for position, element in enumerate(first_measure):
        if element.tag not in ("print", "attributes") and not (
            element.tag == "barline" and element.get("location") == "left"
        ):
            break
    else:
        position = len(first_measure)
    first_measure.insert(position, direction)


def _rebuild_part_list_ensemble(root: ET.Element, names: list[str]) -> None:
    """``<part-list>`` cho bản nhiều part: mỗi part một ``<score-part id="Pn">``, kênh MIDI riêng, giọng hát chương trình
    :data:`VOICE_MIDI_PROGRAM`, piano chương trình 1."""
    old = root.find("part-list")
    index = list(root).index(old) if old is not None else 0
    if old is not None:
        root.remove(old)
    part_list = ET.Element("part-list")
    for number, name in enumerate(names, start=1):
        part_id = f"P{number}"
        voice = name.startswith(VOICE_NAME)
        score_part = ET.SubElement(part_list, "score-part", {"id": part_id})
        ET.SubElement(score_part, "part-name").text = name
        ET.SubElement(score_part, "part-abbreviation").text = (
            "Gh." if voice else ("Pno." if name == PIANO_NAME else name[:4] + ".")
        )
        instrument = ET.SubElement(score_part, "score-instrument", {"id": f"{part_id}-I1"})
        ET.SubElement(instrument, "instrument-name").text = "Voice" if voice else name
        midi = ET.SubElement(score_part, "midi-instrument", {"id": f"{part_id}-I1"})
        channel = number if number < 10 else number + 1  # bỏ kênh 10 (trống)
        ET.SubElement(midi, "midi-channel").text = str(min(channel, 16))
        ET.SubElement(midi, "midi-program").text = str(VOICE_MIDI_PROGRAM if voice else 1)
    root.insert(index, part_list)


def _rebuild_part_list(root: ET.Element, merged: ET.Element) -> None:
    """Thay ``<part-list>`` bằng đúng một ``<score-part id="P1">`` tên Piano (bỏ part-group của music21)."""
    old = root.find("part-list")
    index = list(root).index(old) if old is not None else 0
    if old is not None:
        root.remove(old)
    part_list = ET.Element("part-list")
    score_part = ET.SubElement(part_list, "score-part", {"id": "P1"})
    ET.SubElement(score_part, "part-name").text = "Piano"
    ET.SubElement(score_part, "part-abbreviation").text = "Pno."
    instrument = ET.SubElement(score_part, "score-instrument", {"id": "P1-I1"})
    ET.SubElement(instrument, "instrument-name").text = "Piano"
    midi = ET.SubElement(score_part, "midi-instrument", {"id": "P1-I1"})
    ET.SubElement(midi, "midi-channel").text = "1"
    ET.SubElement(midi, "midi-program").text = "1"
    root.insert(index, part_list)


# ====================================================================== tiện ích


def _text_element(tag: str, text: str) -> ET.Element:
    element = ET.Element(tag)
    element.text = text
    return element


def _insert_before_first(parent: ET.Element, new: ET.Element, before_tags: set[str]) -> None:
    """Chèn ``new`` ngay trước phần tử con đầu tiên có tag thuộc ``before_tags``, không có thì cuối cùng."""
    for position, child in enumerate(parent):
        if child.tag in before_tags:
            parent.insert(position, new)
            return
    parent.append(new)
