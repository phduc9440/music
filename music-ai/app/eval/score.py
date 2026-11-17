"""Đọc ``**kern`` và MusicXML thành một dạng chung để so sánh (không cần music21).

Mỗi bản nhạc là một :class:`ScoreData`: danh sách ô nhịp (theo thứ tự xuất hiện, không theo số ô ghi trong file), mỗi ô
có các :class:`NoteEvent` (nốt hoặc dấu lặng) với thời điểm tính từ đầu ô (đơn vị: phách đen, ``Fraction``).

Quy ước khuông: đánh số **từ trên xuống**, bắt đầu từ 1, qua mọi part (MusicXML) hoặc mọi spine ``**kern`` (spine bên
phải nhất là khuông trên cùng, theo quy ước Humdrum). Nhờ vậy kern của model và MusicXML ground truth so được với nhau.
"""

from __future__ import annotations

import re
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Optional

_STEP_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


@dataclass(frozen=True)
class NoteEvent:
    """Một nốt (hoặc dấu lặng) trong một ô nhịp."""

    measure: int
    """Thứ tự ô nhịp, bắt đầu từ 1."""

    onset: Fraction
    """Thời điểm tính từ đầu ô, đơn vị phách đen."""

    staff: int
    """Khuông, đánh số từ trên xuống, bắt đầu từ 1."""

    duration: Fraction
    """Trường độ, đơn vị phách đen (nốt chấm đã cộng)."""

    midi: Optional[int] = None
    """Số MIDI của cao độ; None nếu là dấu lặng."""

    tie_stop: bool = False
    """Nốt là phần nối tiếp của một dấu nối (không phải lần đánh mới)."""

    @property
    def is_rest(self) -> bool:
        return self.midi is None


@dataclass
class Lyric:
    """Một âm tiết lời ca gắn với một lần đánh nốt."""

    measure: int
    attack: int
    """Thứ tự lần đánh nốt trong ô (trên khuông của lời ca), bắt đầu từ 1; hợp âm tính là một lần đánh."""

    number: int
    """Số lời (verse / dòng lời ca), bắt đầu từ 1."""

    text: str
    staff: int = 1


@dataclass
class ScoreData:
    """Bản nhạc đã đọc."""

    measures: int
    staves: int
    events: list[NoteEvent] = field(default_factory=list)
    key_fifths: Optional[int] = None
    time_signature: Optional[str] = None
    lyrics: list[Lyric] = field(default_factory=list)

    def measure_events(self, measure: int) -> list[NoteEvent]:
        return [e for e in self.events if e.measure == measure]

    def by_measure(self) -> dict[int, list[NoteEvent]]:
        out: dict[int, list[NoteEvent]] = {m: [] for m in range(1, self.measures + 1)}
        for e in self.events:
            out.setdefault(e.measure, []).append(e)
        return out


def attacks(events: list[NoteEvent], staff: int) -> list[Fraction]:
    """Các thời điểm đánh nốt mới (không tính dấu lặng, không tính phần nối tiếp của dấu nối) trên một khuông, tăng dần."""
    onsets = sorted({e.onset for e in events if e.staff == staff and not e.is_rest and not e.tie_stop})
    return onsets


# ====================================================================== kern


_DUR_RE = re.compile(r"(\d+)(%\d+)?(\.*)")
_PITCH_RE = re.compile(r"([a-gA-G])\1*")


def kern_duration(token: str) -> Optional[Fraction]:
    """Trường độ (phách đen) của một token kern, ví dụ ``4.`` -> 3/2, ``2`` -> 2, ``0`` -> 8 (breve)."""
    match = _DUR_RE.search(token)
    if not match:
        return None
    recip = int(match.group(1))
    if match.group(2):  # dạng hữu tỉ "3%2": trường độ = 4 * 2 / 3
        base = Fraction(4 * int(match.group(2)[1:]), recip)
    elif recip == 0:
        base = Fraction(8)
    else:
        base = Fraction(4, recip)
    total, add = base, base
    for _ in match.group(3):
        add /= 2
        total += add
    return total


def kern_midi(token: str) -> Optional[int]:
    """Số MIDI của token nốt kern (``c`` = C4 = 60, ``cc`` = C5, ``C`` = C3, ``b-`` = B♭4)."""
    match = _PITCH_RE.search(token)
    if not match:
        return None
    letters = match.group(0)
    step = letters[0].upper()
    if letters[0].islower():
        octave = 4 + len(letters) - 1
    else:
        octave = 3 - (len(letters) - 1)
    rest = token[match.end():]
    # Dấu hóa đứng ngay sau tên nốt (kern: "b-", "f#", "cn")
    alter = 0
    for ch in rest:
        if ch == "#":
            alter += 1
        elif ch == "-":
            alter -= 1
        elif ch == "n":
            continue
        else:
            break
    return 12 * (octave + 1) + _STEP_SEMITONE[step] + alter


def _key_fifths(token: str) -> Optional[int]:
    match = re.fullmatch(r"\*k\[([a-g#\-]*)\]", token)
    if not match:
        return None
    body = match.group(1)
    sharps, flats = body.count("#"), body.count("-")
    return sharps if sharps else -flats


def read_kern(text: str) -> ScoreData:
    """Đọc một file ``**kern`` (có thể nhiều spine, có ``*^``/``*v``). Bỏ qua spine không phải ``**kern``."""
    lines = [ln.rstrip("\r") for ln in text.replace("\\n", "\n").split("\n")]
    # Mỗi cột: (loại spine, chỉ số spine kern từ trái sang, con trỏ thời gian)
    kinds: list[str] = []
    spine_ids: list[int] = []
    cursors: list[Fraction] = []
    tie_open: list[set[int]] = []
    kern_spines = 0
    measure = 1
    seen_content = False
    events_raw: list[tuple[int, Fraction, int, Fraction, Optional[int], bool]] = []
    key_fifths: Optional[int] = None
    meter: Optional[str] = None

    def reset_cursors() -> None:
        for i in range(len(cursors)):
            cursors[i] = Fraction(0)

    for line in lines:
        if not line or line.startswith("!"):
            continue
        tokens = line.split("\t")
        if line.startswith("**"):
            kinds = [t.strip() for t in tokens]
            spine_ids = []
            for kind in kinds:
                if kind == "**kern":
                    spine_ids.append(kern_spines)
                    kern_spines += 1
                else:
                    spine_ids.append(-1)
            cursors = [Fraction(0)] * len(kinds)
            tie_open = [set() for _ in kinds]
            continue
        if not kinds:  # kern không có header (ví dụ một trang model sinh): coi là một spine **kern
            kinds = ["**kern"] * len(tokens)
            spine_ids = list(range(len(tokens)))
            kern_spines = len(tokens)
            cursors = [Fraction(0)] * len(tokens)
            tie_open = [set() for _ in tokens]
        if len(tokens) != len(kinds):
            # Dòng hỏng (số cột sai): bỏ, giống cách bộ đọc khoan dung
            continue
        if tokens[0].startswith("="):
            if seen_content:
                measure += 1
                seen_content = False
            reset_cursors()
            continue
        if tokens[0].startswith("*"):
            if any(t == "*^" or t == "*v" for t in tokens):
                new_kinds, new_ids, new_cursors, new_ties = [], [], [], []
                i = 0
                while i < len(tokens):
                    tok = tokens[i]
                    if tok == "*^":
                        for _ in range(2):
                            new_kinds.append(kinds[i])
                            new_ids.append(spine_ids[i])
                            new_cursors.append(cursors[i])
                            new_ties.append(set(tie_open[i]))
                        i += 1
                    elif tok == "*v":
                        j = i
                        while j < len(tokens) and tokens[j] == "*v":
                            j += 1
                        new_kinds.append(kinds[i])
                        new_ids.append(spine_ids[i])
                        new_cursors.append(max(cursors[i:j]))
                        new_ties.append(set().union(*tie_open[i:j]))
                        i = j
                    else:
                        new_kinds.append(kinds[i])
                        new_ids.append(spine_ids[i])
                        new_cursors.append(cursors[i])
                        new_ties.append(tie_open[i])
                        i += 1
                kinds, spine_ids, cursors, tie_open = new_kinds, new_ids, new_cursors, new_ties
                continue
            for tok, kind in zip(tokens, kinds):
                if kind != "**kern":
                    continue
                if key_fifths is None:
                    fifths = _key_fifths(tok)
                    if fifths is not None:
                        key_fifths = fifths
                if meter is None and re.fullmatch(r"\*M\d+/\d+", tok):
                    meter = tok[2:]
            continue
        # Dòng dữ liệu
        for col, tok in enumerate(tokens):
            if kinds[col] != "**kern" or tok == "." or not tok:
                continue
            onset = cursors[col]
            step: Optional[Fraction] = None
            for sub in tok.split(" "):
                if not sub or sub == ".":
                    continue
                if "q" in sub or "Q" in sub:
                    continue  # nốt hoa mỹ (grace): không có trường độ
                dur = kern_duration(sub)
                if dur is None:
                    continue
                step = dur if step is None else min(step, dur)
                staff_top_down = kern_spines - spine_ids[col]
                if "r" in sub:
                    events_raw.append((measure, onset, staff_top_down, dur, None, False))
                else:
                    midi = kern_midi(sub)
                    if midi is None:
                        continue
                    tie_stop = ("]" in sub or "_" in sub) and midi in tie_open[col]
                    if "[" in sub or "_" in sub:
                        tie_open[col].add(midi)
                    if "]" in sub:
                        tie_open[col].discard(midi)
                    events_raw.append((measure, onset, staff_top_down, dur, midi, tie_stop))
                seen_content = True
            if step is not None:
                cursors[col] = onset + step

    last_measure = measure if seen_content else max(1, measure - 1)
    events = [
        NoteEvent(measure=m, onset=o, staff=s, duration=d, midi=p, tie_stop=t) for m, o, s, d, p, t in events_raw
    ]
    return ScoreData(
        measures=last_measure if events else 0,
        staves=max(1, kern_spines),
        events=events,
        key_fifths=key_fifths,
        time_signature=meter,
    )


# ====================================================================== MusicXML


def _strip_ns(root: ET.Element) -> None:
    for el in root.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]


def read_musicxml(data: bytes | str) -> ScoreData:
    """Đọc MusicXML ``score-partwise`` (không nén). Ô nhịp đếm theo thứ tự, khuông đánh số từ trên xuống qua mọi part."""
    root = ET.fromstring(data if isinstance(data, (bytes, str)) else bytes(data))
    _strip_ns(root)
    if root.tag != "score-partwise":
        raise ValueError(f"Chỉ hỗ trợ score-partwise, gặp {root.tag}")
    events: list[NoteEvent] = []
    lyrics: list[Lyric] = []
    staff_offset = 0
    max_measures = 0
    key_fifths: Optional[int] = None
    meter: Optional[str] = None

    for part in root.findall("part"):
        divisions = 1
        staves = 1
        for el in part.iter("staves"):
            try:
                staves = max(staves, int((el.text or "1").strip()))
            except ValueError:
                pass
        measures = part.findall("measure")
        max_measures = max(max_measures, len(measures))
        for index, measure in enumerate(measures, start=1):
            cursor = Fraction(0)
            last_onset = Fraction(0)
            pending: list[tuple[NoteEvent, list[ET.Element]]] = []
            for el in measure:
                if el.tag == "attributes":
                    div = el.findtext("divisions")
                    if div:
                        divisions = int(div)
                    if key_fifths is None and el.findtext("key/fifths") is not None:
                        key_fifths = int(el.findtext("key/fifths") or 0)
                    if meter is None and el.findtext("time/beats"):
                        meter = f"{el.findtext('time/beats')}/{el.findtext('time/beat-type')}"
                elif el.tag == "backup":
                    cursor -= Fraction(int(el.findtext("duration") or 0), divisions)
                elif el.tag == "forward":
                    cursor += Fraction(int(el.findtext("duration") or 0), divisions)
                elif el.tag == "note":
                    if el.find("grace") is not None or el.find("cue") is not None:
                        continue
                    dur = Fraction(int(el.findtext("duration") or 0), divisions)
                    is_chord = el.find("chord") is not None
                    onset = last_onset if is_chord else cursor
                    staff = int(el.findtext("staff") or 1)
                    midi: Optional[int] = None
                    if el.find("rest") is None:
                        step = (el.findtext("pitch/step") or "C").strip()
                        octave = int(el.findtext("pitch/octave") or 4)
                        alter = round(float(el.findtext("pitch/alter") or 0))
                        midi = 12 * (octave + 1) + _STEP_SEMITONE[step] + alter
                    tie_stop = any(t.get("type") == "stop" for t in el.findall("tie"))
                    event = NoteEvent(
                        measure=index,
                        onset=onset,
                        staff=staff_offset + staff,
                        duration=dur,
                        midi=midi,
                        tie_stop=tie_stop,
                    )
                    events.append(event)
                    pending.append((event, el.findall("lyric")))
                    if not is_chord:
                        last_onset = cursor
                        cursor += dur
            # Lời ca: gắn với lần đánh (thời điểm) của nốt mang lời
            for event, lyric_elements in pending:
                if not lyric_elements or event.is_rest:
                    continue
                onsets = attacks([e for e, _ in pending], event.staff)
                if event.onset not in onsets:
                    continue
                attack = onsets.index(event.onset) + 1
                for lyric in lyric_elements:
                    text = "".join(t.text or "" for t in lyric.findall("text"))
                    if not text.strip():
                        continue
                    lyrics.append(
                        Lyric(
                            measure=index,
                            attack=attack,
                            number=_lyric_number(lyric.get("number")),
                            text=unicodedata.normalize("NFC", text.strip()),
                            staff=event.staff,
                        )
                    )
        staff_offset += staves

    return ScoreData(
        measures=max_measures,
        staves=max(1, staff_offset),
        events=events,
        key_fifths=key_fifths,
        time_signature=meter,
        lyrics=lyrics,
    )


def _lyric_number(raw: Optional[str]) -> int:
    if not raw:
        return 1
    digits = re.findall(r"\d+", raw)
    return int(digits[0]) if digits else 1


def load_score(path: str | Path) -> ScoreData:
    """Đọc theo đuôi file: ``.krn`` -> kern; ``.musicxml``/``.xml`` -> MusicXML."""
    path = Path(path)
    if path.suffix.lower() in (".krn", ".kern"):
        return read_kern(path.read_text(encoding="utf-8"))
    if path.suffix.lower() in (".musicxml", ".xml"):
        return read_musicxml(path.read_bytes())
    raise ValueError(f"Không đọc được định dạng {path.suffix} (chỉ .krn, .musicxml, .xml)")
