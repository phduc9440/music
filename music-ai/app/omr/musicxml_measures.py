"""Đọc MusicXML của engine khác (copisteria, homr, Audiveris) thành từng ô nhịp, và viết một ô thành dòng ``**kern``.

Dùng cho bước so kết quả nhiều engine theo từng ô (:mod:`app.omr.arbiter`): Transcoda ra ``**kern``, các engine kia ra
MusicXML. Không cần music21: chỉ đọc những gì cần để so và thay một ô (cao độ, trường độ, nốt nối, hợp âm, khuông), bằng
``xml.etree``.

Giới hạn có chủ ý: mỗi khuông chỉ một bè (hợp âm được). Khuông có hai bè cùng có nốt trong một ô thì ô đó đánh dấu
``multi_voice`` và không dùng để thay (kern cần tách spine, dễ sai hơn là có lợi). Nốt hoa mỹ bị bỏ qua ở cả hai phía.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree

TAB = "\t"

_STEPS = "CDEFGAB"


@dataclass
class Event:
    """Một nốt/hợp âm/dấu lặng trên một khuông. ``onset``/``duration`` tính theo nốt tròn (= 1)."""

    onset: Fraction
    duration: Fraction
    pitches: list[tuple[str, int, int]] = field(default_factory=list)
    """``(bậc C..B, alter, quãng tám)``; rỗng là dấu lặng."""
    tie_start: list[bool] = field(default_factory=list)
    tie_stop: list[bool] = field(default_factory=list)


@dataclass
class Measure:
    """Một ô nhịp của cả bản: ``staves[k]`` là sự kiện của khuông thứ k tính từ TRÊN xuống (mọi part nối tiếp nhau)."""

    staves: list[list[Event]]
    multi_voice: bool = False

    def total(self, staff: int) -> Fraction:
        events = self.staves[staff]
        return max((e.onset + e.duration for e in events), default=Fraction(0))


def read_file(path) -> list[Measure]:
    """Đọc ``.musicxml``/``.xml`` hoặc ``.mxl`` (MusicXML nén)."""
    data = Path(path).read_bytes()
    if data[:2] == b"PK":
        data = _unzip(data)
    return read_bytes(data)


def _unzip(data: bytes) -> bytes:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        root = None
        if "META-INF/container.xml" in names:
            container = ElementTree.fromstring(archive.read("META-INF/container.xml"))
            for element in container.iter():
                if element.tag.endswith("rootfile") and element.get("full-path"):
                    root = element.get("full-path")
                    break
        if root is None:
            root = next(n for n in names if n.endswith(".xml") and not n.startswith("META-INF"))
        return archive.read(root)


def read_bytes(data: bytes) -> list[Measure]:
    """MusicXML dạng partwise -> danh sách ô (ô thứ i của mọi part ghép lại, khuông trên cùng trước)."""
    root = ElementTree.fromstring(data)
    parts = [p for p in root if _local(p.tag) == "part"]
    per_part: list[list[list[list[Event]]]] = []  # part -> ô -> khuông của part -> sự kiện
    multi: list[set[int]] = []
    for part in parts:
        measures, voices = _read_part(part)
        per_part.append(measures)
        multi.append(voices)
    count = max((len(m) for m in per_part), default=0)
    out: list[Measure] = []
    for index in range(count):
        staves: list[list[Event]] = []
        for measures in per_part:
            if index < len(measures):
                staves.extend(measures[index])
        if not any(staves):
            continue  # ô chỉ có <attributes>/<print>, không có nốt hay dấu lặng nào: không phải ô nhạc
        out.append(Measure(staves=staves, multi_voice=any(index in m for m in multi)))
    return out


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child(element, name: str):
    return next((c for c in element if _local(c.tag) == name), None)


def _read_part(part) -> tuple[list[list[list[Event]]], set[int]]:
    divisions = 1
    staves_count = 1
    measures: list[list[list[Event]]] = []
    multi_voice: set[int] = set()
    for index, measure in enumerate(m for m in part if _local(m.tag) == "measure"):
        cursor = 0
        last_onset = 0
        events: dict[int, list[Event]] = {}
        voices: dict[int, set[str]] = {}
        for element in measure:
            name = _local(element.tag)
            if name == "attributes":
                found = _child(element, "divisions")
                if found is not None and (found.text or "").strip():
                    divisions = int(found.text)
                found = _child(element, "staves")
                if found is not None and (found.text or "").strip():
                    staves_count = int(found.text)
            elif name == "backup":
                cursor -= int(_child(element, "duration").text)
            elif name == "forward":
                cursor += int(_child(element, "duration").text)
            elif name == "note":
                if _child(element, "grace") is not None or _child(element, "cue") is not None:
                    continue
                duration_el = _child(element, "duration")
                duration = int(duration_el.text) if duration_el is not None and duration_el.text else 0
                chord = _child(element, "chord") is not None
                onset = last_onset if chord else cursor
                staff_el = _child(element, "staff")
                staff = int(staff_el.text) - 1 if staff_el is not None and staff_el.text else 0
                voice_el = _child(element, "voice")
                voice = (voice_el.text or "1").strip() if voice_el is not None else "1"
                rest = _child(element, "rest") is not None
                staff_events = events.setdefault(staff, [])
                if not rest:
                    voices.setdefault(staff, set()).add(voice)
                start = Fraction(onset, 4 * divisions)
                length = Fraction(duration, 4 * divisions)
                if chord and staff_events and staff_events[-1].onset == start and not rest:
                    event = staff_events[-1]
                else:
                    event = Event(onset=start, duration=length)
                    if not (rest and any(e.onset == start for e in staff_events)):
                        staff_events.append(event)  # dấu lặng của bè thứ hai trùng chỗ nốt bè một: bỏ
                if not rest:
                    pitch = _child(element, "pitch")
                    if pitch is not None:
                        step = _child(pitch, "step").text.strip().upper()
                        alter_el = _child(pitch, "alter")
                        alter = int(round(float(alter_el.text))) if alter_el is not None and alter_el.text else 0
                        octave = int(_child(pitch, "octave").text)
                        event.pitches.append((step, alter, octave))
                        ties = [t.get("type") for t in element if _local(t.tag) == "tie"]
                        event.tie_start.append("start" in ties)
                        event.tie_stop.append("stop" in ties)
                last_onset = onset
                if not chord:
                    cursor += duration
        staves = [sorted(_dedupe(events.get(k, [])), key=lambda e: e.onset) for k in range(staves_count)]
        if any(len(v) > 1 for v in voices.values()):
            multi_voice.add(index)
        if any(_overlaps(s) for s in staves):
            multi_voice.add(index)
        measures.append(staves)
    return measures, multi_voice


def _dedupe(events: list[Event]) -> list[Event]:
    """Bỏ dấu lặng trùng thời điểm với nốt (bè hai im lặng), giữ nốt."""
    out: list[Event] = []
    for event in events:
        clash = next((e for e in out if e.onset == event.onset), None)
        if clash is None:
            out.append(event)
        elif not clash.pitches and event.pitches:
            out[out.index(clash)] = event
    return out


def _overlaps(events: list[Event]) -> bool:
    ordered = sorted(events, key=lambda e: e.onset)
    return any(a.onset + a.duration > b.onset for a, b in zip(ordered, ordered[1:]))


# ====================================================================== viết kern


def recip(duration: Fraction) -> Optional[str]:
    """Trường độ kern (``4``, ``8.``, ``12``...) của ``duration`` (nốt tròn = 1), None nếu không biểu diễn được."""
    if duration <= 0:
        return None
    for dots in range(3):
        base = duration / (2 - Fraction(1, 2**dots))
        value = 1 / base
        if value.denominator == 1:
            number = int(value)
            if number >= 1:
                return f"{number}{'.' * dots}"
            if number == 0:
                continue
        if base == 2:
            return "0" + "." * dots
        if base == 4:
            return "00" + "." * dots
    return None


def kern_pitch(step: str, alter: int, octave: int) -> str:
    letter = step.lower()
    name = letter * (octave - 3) if octave >= 4 else step.upper() * (4 - octave)
    accidental = "#" * alter if alter > 0 else "-" * (-alter)
    return name + accidental


def _token(event: Event) -> Optional[str]:
    length = recip(event.duration)
    if length is None:
        return None
    if not event.pitches:
        return f"{length}r"
    subs = []
    for (step, alter, octave), start, stop in zip(event.pitches, event.tie_start, event.tie_stop):
        sub = f"{length}{kern_pitch(step, alter, octave)}"
        if start and stop:
            sub += "_"
        elif start:
            sub = "[" + sub
        elif stop:
            sub += "]"
        subs.append(sub)
    return " ".join(subs)


def to_kern_lines(measure: Measure, spines: int) -> Optional[list[str]]:
    """Dòng dữ liệu kern của một ô (spine 1 = khuông DƯỚI cùng, như Transcoda). None nếu không chuyển được: số khuông khác
    ``spines``, khuông nhiều bè, trường độ không biểu diễn được, hoặc ô không có nốt nào."""
    if measure.multi_voice or len(measure.staves) != spines:
        return None
    columns = list(reversed(measure.staves))  # kern: cột trái là khuông dưới
    onsets = sorted({e.onset for staff in columns for e in staff})
    if not onsets:
        return None
    rows: list[str] = []
    for onset in onsets:
        cells = []
        for staff in columns:
            event = next((e for e in staff if e.onset == onset), None)
            if event is None:
                cells.append(".")
                continue
            token = _token(event)
            if token is None:
                return None
            cells.append(token)
        rows.append(TAB.join(cells))
    if not any(e.pitches for staff in columns for e in staff):
        return None
    return rows
