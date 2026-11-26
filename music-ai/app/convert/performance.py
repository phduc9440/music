"""Biến một ``<part>`` MusicXML thành các nốt NHƯ ĐƯỢC PHÁT (đặc tả mục 2.4), dùng để ghi MIDI.

Khác ``score_xml.parse_part_events`` (đọc nốt theo đúng thứ tự viết, bỏ qua mọi ký hiệu biểu diễn), ở đây:

* **Cấu trúc**: đi theo thứ tự phát như trình phát trên web (``playOrder.ts``): dấu lặp ``|: :|`` (kể cả ``times``), nhà 1 /
  nhà 2 (volta), D.C., D.S., Fine, To Coda / Coda. Thứ tự đọc theo các ô nhịp của part đang xử lý.
* **Hoa mỹ**: nốt nhỏ (grace, có gạch lấy 1/8 phách, không gạch chia nửa nốt chính), láy rền (trill), láy ngắn (mordent),
  láy ngắn ngược, láy vòng (turn), rải hợp âm (arpeggiate lên / xuống), glissando và slide (trượt nửa cung tới nốt đích).
* **Biểu cảm**: vận tốc theo mức to nhỏ (pp...ff), sf/sfz/fp, accent / marcato, cresc. / dim.

Mọi thời lượng ngắn (láy, rải) tính bằng giây ở ``tempo_bpm`` rồi đổi sang phách đen, giống trình phát. Bản không có ký hiệu
nào trong số trên (ví dụ đầu ra OMR) cho kết quả giống ``parse_part_events``: thứ tự nguyên bản, vận tốc mặc định.
Nốt không cao độ (nghỉ, nốt gõ) bị bỏ qua. Cao độ nghe thấy của nhạc cụ chuyển âm chưa được tính.
"""

from __future__ import annotations

import bisect
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional

from app.convert.score_xml import (
    DEFAULT_VELOCITY,
    NoteEvent,
    child_int,
    current_divisions,
    pitch_to_midi,
)

EPS = Fraction(1, 1_000_000)

# Hằng số giống music-web/src/components/editor/playback.ts
GRACE_QUARTERS = Fraction(1, 8)
TRILL_STEP_S = 0.07
TRILL_MIN_STEP_S = 0.035
ORNAMENT_MIN_S = 0.03
ORNAMENT_MAX_S = 0.09
ARPEGGIO_STEP_S = 0.035
ARPEGGIO_MAX_S = 0.25
GLISS_HOLD = 0.3
GLISS_STEP_MAX_S = 0.1
GLISS_STEP_MIN_S = 0.025
ACCENT_BOOST = 1.3
HAIRPIN_STEP = 0.25

LEVEL_VELOCITY = {
    "pppp": 10,
    "ppp": 20,
    "pp": 36,
    "p": 54,
    "mp": 69,
    "mf": 83,
    "f": 98,
    "ff": 112,
    "fff": 127,
    "ffff": 127,
}
ACCENT_DYNAMICS: dict[str, tuple[Optional[int], Optional[int]]] = {
    "sf": (None, None),
    "sfz": (None, None),
    "sffz": (None, None),
    "fz": (None, None),
    "rf": (None, None),
    "rfz": (None, None),
    "fp": (98, 54),
    "sfp": (98, 54),
}

STEPS = ["C", "D", "E", "F", "G", "A", "B"]
STEP_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"]
FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"]


def _q(value: float) -> Fraction:
    return Fraction(value).limit_denominator(100_000)


def _clamp_velocity(value: float) -> int:
    return max(1, min(127, int(round(value))))


# ============================================================================ thứ tự phát


@dataclass
class _Marks:
    forward: bool = False
    backward: int = 0
    endings: Optional[list[int]] = None
    group_last: int = 0
    segno: bool = False
    coda: bool = False
    dc: bool = False
    ds: bool = False
    fine: bool = False
    to_coda: bool = False


def _ending_numbers(text: Optional[str]) -> list[int]:
    out: list[int] = []
    for token in (text or "").replace(",", " ").split():
        try:
            number = int(token)
        except ValueError:
            continue
        if number > 0:
            out.append(number)
    return out


def _read_marks(measures: list[ET.Element]) -> list[_Marks]:
    active: Optional[list[int]] = None
    all_marks: list[_Marks] = []
    for measure in measures:
        marks = _Marks()
        closes = False
        for barline in measure.findall("barline"):
            repeat = barline.find("repeat")
            if repeat is not None and repeat.get("direction") == "forward":
                marks.forward = True
            if repeat is not None and repeat.get("direction") == "backward":
                try:
                    marks.backward = int(repeat.get("times") or 2) or 2
                except ValueError:
                    marks.backward = 2
            ending = barline.find("ending")
            if ending is not None:
                if ending.get("type") == "start":
                    active = _ending_numbers(ending.get("number"))
                else:
                    closes = True
        marks.endings = active
        if closes:
            active = None
        for sound in measure.iter("sound"):
            if sound.get("segno") is not None:
                marks.segno = True
            if sound.get("coda") is not None:
                marks.coda = True
            if sound.get("dacapo") == "yes":
                marks.dc = True
            if sound.get("dalsegno") is not None:
                marks.ds = True
            if sound.get("fine") is not None:
                marks.fine = True
            if sound.get("tocoda") is not None:
                marks.to_coda = True
        all_marks.append(marks)

    # Cụm nhà = các ô nhà liền nhau; khi quay lại bằng D.C./D.S. chỉ phát nhà cuối của cụm
    start = 0
    while start < len(all_marks):
        if all_marks[start].endings is None:
            start += 1
            continue
        end = start
        while end < len(all_marks) and all_marks[end].endings is not None:
            end += 1
        last = max([0] + [n for m in all_marks[start:end] for n in (m.endings or [])])
        for k in range(start, end):
            all_marks[k].group_last = last
        start = end
    return all_marks


def play_order(part: ET.Element) -> list[int]:
    """Chỉ số các ô nhịp theo thứ tự phát (một ô có thể xuất hiện nhiều lần); port từ ``playOrder.ts``."""
    marks = _read_marks(part.findall("measure"))
    n = len(marks)
    order: list[int] = []
    i = 0
    pass_no = 1
    repeat_start = 0
    jumped = False
    segno_at = next((idx for idx, m in enumerate(marks) if m.segno), -1)
    coda_at = next((idx for idx, m in enumerate(marks) if m.coda and idx > 0), -1)

    guard = 0
    while i < n and guard < n * 12:
        guard += 1
        m = marks[i]
        if m.endings is not None:
            wanted = m.group_last if jumped else pass_no
            if wanted not in m.endings:
                i += 1  # ô thuộc nhà của lần chơi khác
                continue
        if m.forward and not jumped:
            repeat_start = i
        order.append(i)
        if jumped and m.fine:
            break
        if jumped and m.to_coda and coda_at >= 0:
            i = coda_at
            jumped = False
            pass_no = 1
            repeat_start = i
            for x in marks:  # sau khi nhảy tới Coda không còn quay lại nữa
                x.dc = x.ds = False
            continue
        if not jumped and m.backward > 0:
            if pass_no < m.backward:
                pass_no += 1
                i = repeat_start
                continue
            pass_no = 1
            repeat_start = i + 1
        if not jumped and (m.dc or m.ds):
            target = segno_at if m.ds else 0
            if target >= 0:
                jumped = True
                pass_no = 1
                i = target
                continue
        i += 1
    return order if order else list(range(n))


# ============================================================================ đọc ô nhịp


@dataclass
class _Note:
    """Một ``<note>`` có cao độ, vị trí tương đối trong ô (phách đen)."""

    element: ET.Element
    staff: int
    start: Fraction
    length: Fraction
    midi: int
    is_chord: bool
    is_grace: bool
    slash: bool


@dataclass
class _Dyn:
    kind: str  # level | accent | wedge
    at: Fraction
    velocity: Optional[int] = None
    peak: Optional[int] = None
    after: Optional[int] = None
    wedge: str = ""
    number: str = "1"


@dataclass
class _Measure:
    length: Fraction
    notes: list[_Note]
    dynamics: list[_Dyn]
    fifths: int


def _scan_measures(part: ET.Element) -> list[_Measure]:
    result: list[_Measure] = []
    divisions = 1
    fifths = 0
    for measure in part.findall("measure"):
        pos = Fraction(0)
        farthest = Fraction(0)
        last_start = Fraction(0)
        notes: list[_Note] = []
        dynamics: list[_Dyn] = []
        for element in measure:
            tag = element.tag
            if tag == "attributes":
                divisions = current_divisions(element, divisions)
                key = element.find("key")
                if key is not None:
                    value = child_int(key, "fifths")
                    if value is not None:
                        fifths = value
            elif tag == "forward":
                pos += Fraction(child_int(element, "duration") or 0, divisions)
            elif tag == "backup":
                pos -= Fraction(child_int(element, "duration") or 0, divisions)
            elif tag == "direction":
                offset = Fraction(child_int(element, "offset") or 0, divisions)
                _read_direction(element, max(Fraction(0), pos + offset), dynamics)
            elif tag == "sound":
                level = _sound_level(element)
                if level is not None:
                    dynamics.append(_Dyn("level", pos, velocity=level))
            elif tag == "note":
                is_grace = element.find("grace") is not None
                is_chord = element.find("chord") is not None
                length = Fraction(child_int(element, "duration") or 0, divisions)
                start = last_start if is_chord else pos
                if not is_chord:
                    last_start = start
                    if not is_grace:
                        pos = start + length
                farthest = max(farthest, pos)
                pitch = element.find("pitch")
                midi = pitch_to_midi(pitch) if pitch is not None else None
                if midi is None or (not is_grace and length <= 0):
                    continue
                grace = element.find("grace")
                notes.append(
                    _Note(
                        element=element,
                        staff=child_int(element, "staff") or 1,
                        start=start,
                        length=length,
                        midi=midi,
                        is_chord=is_chord,
                        is_grace=is_grace,
                        slash=grace is not None and grace.get("slash") == "yes",
                    )
                )
            farthest = max(farthest, pos)
        result.append(_Measure(length=farthest, notes=notes, dynamics=dynamics, fifths=fifths))
    return result


def _sound_level(sound: ET.Element) -> Optional[int]:
    """``<sound dynamics="N">`` -> vận tốc MIDI N (giống trình phát web), None nếu không có."""
    raw = sound.get("dynamics")
    try:
        value = float(raw) if raw is not None else 0.0
    except ValueError:
        value = 0.0
    return _clamp_velocity(value) if value > 0 else None


def _read_direction(direction: ET.Element, at: Fraction, out: list[_Dyn]) -> None:
    sound_level: Optional[int] = None
    for sound in direction.iter("sound"):
        level = _sound_level(sound)
        if level is not None:
            sound_level = level
    names = [child.tag for d in direction.iter("dynamics") for child in d]
    level_name = next((n for n in names if n in LEVEL_VELOCITY), None)
    accent_name = next((n for n in names if n in ACCENT_DYNAMICS), None)
    velocity = sound_level if sound_level is not None else (LEVEL_VELOCITY[level_name] if level_name else None)
    if velocity is not None:
        out.append(_Dyn("level", at, velocity=velocity))
    if accent_name:
        peak, after = ACCENT_DYNAMICS[accent_name]
        out.append(_Dyn("accent", at, peak=peak, after=after))
    for wedge in direction.iter("wedge"):
        kind = wedge.get("type")
        if kind in ("crescendo", "diminuendo", "stop"):
            out.append(_Dyn("wedge", at, wedge=kind, number=wedge.get("number") or "1"))


# ============================================================================ khai triển nốt


@dataclass
class _Step:
    midi: int
    offset: float  # giây
    length: float  # giây


def _key_alter(fifths: int, step: str) -> int:
    if fifths > 0 and step in SHARP_ORDER[:fifths]:
        return 1
    if fifths < 0 and step in FLAT_ORDER[: -fifths]:
        return -1
    return 0


def _neighbors(note: ET.Element, fifths: int) -> Optional[tuple[int, int]]:
    """``(kề trên, kề dưới)`` theo bậc của khóa nhạc đang có hiệu lực."""
    pitch = note.find("pitch")
    if pitch is None:
        return None
    step_text = (pitch.findtext("step") or "").strip().upper()
    octave = child_int(pitch, "octave")
    if step_text not in STEPS or octave is None:
        return None
    at = STEPS.index(step_text)

    def spell(index: int, octave_: int) -> int:
        target = STEPS[index % 7]
        return 12 * (octave_ + 1) + STEP_SEMITONE[target] + _key_alter(fifths, target)

    return (
        spell(at + 1, octave + (1 if at == 6 else 0)),
        spell(at - 1, octave - (1 if at == 0 else 0)),
    )


def _ornament_of(note: ET.Element) -> Optional[str]:
    def has(tag: str) -> bool:
        return next(note.iter(tag), None) is not None

    if has("trill-mark"):
        return "trill"
    if has("inverted-mordent"):
        return "invMordent"
    if has("mordent"):
        return "mordent"
    if has("turn"):
        return "turn"
    return None


def expand_ornament(kind: str, main: int, neighbors: Optional[tuple[int, int]], span: float) -> list[_Step]:
    """Khai triển láy thành nốt nhỏ trong ``span`` giây; mảng rỗng nếu nốt quá ngắn (phát nguyên nốt gốc)."""
    if neighbors is None or span <= 0:
        return []
    upper, lower = neighbors
    if kind == "trill":
        count = min(int(span // TRILL_STEP_S), int(span // TRILL_MIN_STEP_S))
        if count < 3:
            return []
        if count % 2 == 0:
            count -= 1  # kết thúc bằng nốt gốc
        length = span / count
        return [_Step(main if i % 2 == 0 else upper, i * length, length) for i in range(count)]
    if kind == "mordent":
        pattern = [main, lower, main]
    elif kind == "invMordent":
        pattern = [main, upper, main]
    else:
        pattern = [upper, main, lower, main]
    quick = len(pattern) - 1
    length = min(ORNAMENT_MAX_S, max(ORNAMENT_MIN_S, span * (0.15 if kind == "turn" else 0.12)))
    if quick * length > span * 0.6:
        return []
    return [_Step(m, i * length, span - quick * length if i == quick else length) for i, m in enumerate(pattern)]


def expand_gliss(start: int, target: int, span: float) -> list[_Step]:
    """Giữ cao độ gốc một lúc rồi trượt từng nửa cung tới sát nốt đích (nốt đích do nốt kế tiếp phát)."""
    between = abs(target - start) - 1
    if between < 1 or span <= 0:
        return []
    direction = 1 if target > start else -1
    run_span = span * (1 - GLISS_HOLD)
    stride = max(1, int(-(-(GLISS_STEP_MIN_S * between) // run_span)))
    middles = [start + direction * k for k in range(stride, between + 1, stride)]
    if not middles:
        return []
    length = min(GLISS_STEP_MAX_S, run_span / len(middles))
    run_start = span - length * len(middles)
    return [_Step(start, 0.0, run_start)] + [_Step(m, run_start + i * length, length) for i, m in enumerate(middles)]


def _line_keys(note: ET.Element, staff: int, kind: str) -> list[str]:
    keys = []
    for tag in ("glissando", "slide"):
        for el in note.iter(tag):
            if el.get("type") == kind:
                keys.append(f"{staff}|{tag}|{el.get('number') or '1'}")
    return keys


# ============================================================================ dựng nốt


@dataclass
class _Raw:
    staff: int
    start: Fraction
    length: Fraction
    midi: int
    tie_start: bool = False
    tie_stop: bool = False
    accent: bool = False
    expandable: bool = False  # nốt chính không nối: được phép trượt (glissando)
    gl_start: list[str] = field(default_factory=list)
    gl_stop: list[str] = field(default_factory=list)
    gl_target: Optional[int] = None
    reset_ties: bool = False  # nốt đầu tiên sau một lần nhảy: cắt mọi nốt nối đang mở


def parse_part_performance(part: ET.Element, tempo_bpm: float) -> tuple[list[NoteEvent], Fraction]:
    """Các nốt của ``part`` theo thứ tự phát, đã gộp nốt nối, kèm vận tốc. Trả ``(nốt, tổng_độ_dài_phách_đen)``."""
    measures = _scan_measures(part)
    order = play_order(part)
    q_per_s = tempo_bpm / 60.0

    raws: list[_Raw] = []
    dynamics: list[tuple[Fraction, _Dyn]] = []
    base = Fraction(0)
    previous: Optional[int] = None
    pending_reset = False
    for index in order:
        measure = measures[index]
        if previous is not None and index != previous + 1:
            pending_reset = True
        first = len(raws)
        _emit_measure(measure, base, q_per_s, raws)
        if pending_reset and len(raws) > first:
            raws[first].reset_ties = True
            pending_reset = False
        dynamics.extend((base + d.at, d) for d in measure.dynamics)
        base += measure.length
        previous = index

    _link_glissandi(raws, q_per_s)
    events, accents = _merge_ties(raws)
    _apply_dynamics(events, accents, dynamics)
    events.sort(key=lambda e: (e.start, e.staff, e.midi))
    return events, base


def _emit_measure(measure: _Measure, base: Fraction, q_per_s: float, out: list[_Raw]) -> None:
    graces: list[list[_Note]] = []
    notes = measure.notes
    i = 0
    while i < len(notes):
        note = notes[i]
        if note.is_grace:
            if note.is_chord and graces:
                graces[-1].append(note)
            else:
                graces.append([note])
            i += 1
            continue
        group = [note]  # nốt chính đầu + các nốt <chord/> theo sau
        j = i + 1
        while j < len(notes) and notes[j].is_chord and not notes[j].is_grace:
            group.append(notes[j])
            j += 1
        i = j
        start = group[0].start
        length = group[0].length
        if graces:
            plain = sum(1 for g in graces if not g[0].slash)
            lengths = [GRACE_QUARTERS if g[0].slash else length / 2 / plain for g in graces]
            total = sum(lengths, Fraction(0))
            if total > length / 2:
                lengths = [x * (length / 2) / total for x in lengths]
            offset = start
            for gi, grace_group in enumerate(graces):
                for g in grace_group:
                    out.append(_Raw(staff=g.staff, start=base + offset, length=lengths[gi], midi=g.midi))
                offset += lengths[gi]
            length = start + length - offset
            start = offset
            graces = []
        _emit_group(group, measure.fifths, base, start, length, q_per_s, out)


def _emit_group(
    group: list[_Note], fifths: int, base: Fraction, start: Fraction, length: Fraction, q_per_s: float, out: list[_Raw]
) -> None:
    arpeggio = None
    for n in group:
        el = next(n.element.iter("arpeggiate"), None)
        if el is not None:
            arpeggio = "down" if el.get("direction") == "down" else "up"
    shifts: dict[int, Fraction] = {}
    if arpeggio and len(group) > 1:
        ordered = sorted(range(len(group)), key=lambda k: group[k].midi, reverse=arpeggio == "down")
        count = len(group)
        span_s = float(length) / q_per_s
        step_s = min(ARPEGGIO_STEP_S, ARPEGGIO_MAX_S / (count - 1), span_s * 0.5 / (count - 1))
        for rank, k in enumerate(ordered):
            shifts[k] = _q(step_s * rank * q_per_s)

    for k, n in enumerate(group):
        shift = shifts.get(k, Fraction(0))
        n_start = start + shift
        n_length = length - shift
        if n_length <= 0:
            continue
        element = n.element
        ties = {t.get("type") for t in element.findall("tie")}
        tie_start, tie_stop = "start" in ties, "stop" in ties
        accent = (
            next(element.iter("accent"), None) is not None or next(element.iter("strong-accent"), None) is not None
        )
        kind = _ornament_of(element)
        if kind and not tie_start and not tie_stop:
            steps = expand_ornament(kind, n.midi, _neighbors(element, fifths), float(n_length) / q_per_s)
            if steps:
                end = n_start + n_length
                for idx, step in enumerate(steps):
                    last = idx == len(steps) - 1
                    step_start = n_start + _q(step.offset * q_per_s)
                    step_len = (end - step_start) if last else _q(step.length * q_per_s)
                    out.append(
                        _Raw(staff=n.staff, start=base + step_start, length=step_len, midi=step.midi, accent=accent and idx == 0)
                    )
                continue
        out.append(
            _Raw(
                staff=n.staff,
                start=base + n_start,
                length=n_length,
                midi=n.midi,
                tie_start=tie_start,
                tie_stop=tie_stop,
                accent=accent,
                expandable=not tie_start and not tie_stop,
                gl_start=_line_keys(element, n.staff, "start"),
                gl_stop=_line_keys(element, n.staff, "stop"),
            )
        )


def _link_glissandi(raws: list[_Raw], q_per_s: float) -> None:
    """Ghép nốt bắt đầu với nốt kết thúc của glissando/slide rồi thay nốt đầu bằng các nốt trượt."""
    open_lines: dict[str, _Raw] = {}
    for raw in sorted(raws, key=lambda r: (r.start, r.midi)):
        for key in raw.gl_stop:
            source = open_lines.pop(key, None)
            if source is not None:
                source.gl_target = raw.midi
        for key in raw.gl_start:
            open_lines[key] = raw
    extra: list[_Raw] = []
    for raw in raws:
        if raw.gl_target is None or not raw.expandable:
            continue
        steps = expand_gliss(raw.midi, raw.gl_target, float(raw.length) / q_per_s)
        if not steps:
            continue
        end = raw.start + raw.length
        first_start = raw.start
        for idx, step in enumerate(steps):
            step_start = first_start + _q(step.offset * q_per_s)
            step_len = (end - step_start) if idx == len(steps) - 1 else _q(step.length * q_per_s)
            if idx == 0:
                raw.length = step_len
                continue
            extra.append(_Raw(staff=raw.staff, start=step_start, length=step_len, midi=step.midi))
    raws.extend(extra)


def _merge_ties(raws: list[_Raw]) -> tuple[list[NoteEvent], set[int]]:
    """Gộp nốt nối theo thứ tự phát. Trả ``(nốt, tập id() của các nốt có accent)``."""
    events: list[NoteEvent] = []
    accents: set[int] = set()
    open_ties: dict[tuple[int, int], NoteEvent] = {}
    for raw in raws:
        if raw.reset_ties:
            open_ties.clear()
        key = (raw.staff, raw.midi)
        if raw.tie_stop and key in open_ties:
            open_ties[key].length += raw.length
            if not raw.tie_start:
                del open_ties[key]
            continue
        event = NoteEvent(staff=raw.staff, start=raw.start, length=raw.length, midi=raw.midi)
        events.append(event)
        if raw.accent:
            accents.add(id(event))
        if raw.tie_start:
            open_ties[key] = event
    return events, accents


# ============================================================================ vận tốc


def _apply_dynamics(events: list[NoteEvent], accents: set[int], dynamics: list[tuple[Fraction, _Dyn]]) -> None:
    """Gán vận tốc theo mức to nhỏ, dấu nhấn và cresc./dim.; không có ký hiệu nào thì giữ vận tốc mặc định."""
    if not dynamics and not accents:
        return
    timeline = sorted(dynamics, key=lambda item: item[0])
    starts = sorted({e.start for e in events})

    levels: list[tuple[Fraction, int, int]] = []  # (thời điểm, độ ưu tiên, vận tốc); ưu tiên cao đè lên khi cùng lúc
    boosts: dict[Fraction, Optional[int]] = {}
    wedges: list[tuple[Fraction, Fraction, int, int]] = []  # (bắt đầu, kết thúc, từ, đến)

    def next_start(at: Fraction) -> Optional[Fraction]:
        k = bisect.bisect_left(starts, at - EPS)
        return starts[k] if k < len(starts) else None

    def level_at(at: Fraction) -> int:
        current = DEFAULT_VELOCITY
        for time, _, velocity in sorted(levels, key=lambda lv: (lv[0], lv[1])):
            if time > at + EPS:
                break
            current = velocity
        return current

    for time, item in timeline:
        if item.kind == "level" and item.velocity is not None:
            levels.append((time, 1, item.velocity))
        elif item.kind == "accent":
            target = next_start(time)
            if target is None:
                continue
            boosts[target] = item.peak
            if item.after is not None:
                after = next_start(target + 2 * EPS)
                if after is not None:
                    levels.append((after, 1, item.after))

    for index, (time, item) in enumerate(timeline):
        if item.kind != "wedge" or item.wedge == "stop":
            continue
        rest = timeline[index + 1 :]
        end = next((t for t, o in rest if o.kind == "wedge" and o.wedge == "stop" and o.number == item.number), None)
        if end is None or end <= time:
            continue
        following = next_start(end)
        limit = following + EPS if following is not None else None
        target_level: Optional[int] = None
        for t, other in rest:
            if other.kind == "level" and other.velocity is not None and t >= end - EPS and (limit is None or t <= limit):
                target_level = other.velocity
                break
        start_level = level_at(time)
        if target_level is None:
            factor = 1 + HAIRPIN_STEP if item.wedge == "crescendo" else 1 - HAIRPIN_STEP
            target_level = _clamp_velocity(start_level * factor)
        wedges.append((time, end, start_level, target_level))
        levels.append((end, 0, target_level))  # sau vạch mức đích được giữ; mức tường minh cùng lúc đè lên

    for event in events:
        value = float(level_at(event.start))
        for begin, end, source, target in wedges:
            if begin - EPS <= event.start < end - EPS:
                value = source + (target - source) * float((event.start - begin) / (end - begin))
                break
        if event.start in boosts:
            peak = boosts[event.start]
            value = float(peak) if peak is not None else value * ACCENT_BOOST
        if id(event) in accents:
            value *= ACCENT_BOOST
        event.velocity = _clamp_velocity(value)
