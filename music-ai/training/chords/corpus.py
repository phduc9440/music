"""Đọc dữ liệu huấn luyện HMM gợi ý hợp âm thành ``Song`` trên cùng lưới bước với lúc chạy (spec R3 mục 5.4–5.5).

Lưới bước: ô 4 phách chia đôi ở phách 3, ô khác lấy cả ô (giống ``app/chords/melody.py``), để xác suất "ở lại cùng hợp âm"
học được khớp với lúc suy luận.

- POP909 (MIT): ``POP909/{số}/`` có ``{số}.mid`` (track MELODY), ``beat_midi.txt`` (giây, cờ nửa ô, cờ đầu ô),
  ``chord_midi.txt`` (giây bắt đầu, giây kết thúc, nhãn Harte), ``key_audio.txt`` (giọng theo đoạn).
- iRb / iRealPro (CC BY 4.0): file Humdrum ``**jazz`` chỉ có hợp âm (``2G:min7``, ``1B-:maj7``, ``=`` là vạch nhịp).

Nhãn hợp âm được rút về 7 loại của ``app/chords/theory.QUALITIES``; loại không rút được (dim, aug, N) thành ``None`` và
làm đứt dãy khi đếm.
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional

from app.chords.theory import STEP_PC, ChordDef, Key, fifths_of, nearest_state

Parsed = tuple[int, str, Optional[int]]  # (gốc tuyệt đối 0–11, loại, bass tuyệt đối hoặc None)


@dataclass
class Song:
    name: str
    key: Key
    chords: list[Optional[str]]
    melody: Optional[list[list[tuple[int, float]]]]  # melody[t] = [(cao độ tuyệt đối 0–11, trọng số phách)]


# ------------------------------------------------------------------------------------------------ nhãn hợp âm

_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Bậc trong ký hiệu Harte (bass "/3", "/b7") → số bán cung từ gốc
_DEGREE = {"1": 0, "b2": 1, "2": 2, "#2": 3, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8, "b6": 8,
           "6": 9, "bb7": 9, "b7": 10, "7": 11, "9": 2, "b9": 1, "11": 5, "#11": 6, "13": 9}

_HARTE_QUALITY = {
    "maj": "maj", "maj6": "maj", "sus2": "maj", "": "maj",
    "min": "min", "min6": "min", "minmaj7": "min",
    "7": "7", "9": "7", "13": "7",
    "maj7": "maj7", "maj9": "maj7",
    "min7": "min7", "min9": "min7", "min11": "min7",
    "hdim7": "hdim7",
    "sus4": "sus4",
}


def _root_pc(text: str) -> Optional[int]:
    if not text or text[0] not in STEP_PC:
        return None
    pc = STEP_PC[text[0]]
    for ch in text[1:]:
        pc += 1 if ch == "#" else -1 if ch in "b-" else 0
    return pc % 12


def parse_harte(label: str) -> Optional[Parsed]:
    """``"C:maj/3"`` → ``(0, "maj", 4)``; ``"N"``, dim, aug → None."""
    label = label.strip()
    match = re.match(r"^([A-G][#b]*)(?::([^/(]*))?(\([^)]*\))?(?:/(.+))?$", label)
    if not match:
        return None
    root = _root_pc(match.group(1))
    quality = _HARTE_QUALITY.get((match.group(2) or "maj").strip())
    if root is None or quality is None:
        return None
    bass = None
    if match.group(4):
        interval = _DEGREE.get(match.group(4).strip())
        if interval is None:
            return None
        bass = (root + interval) % 12
    return root, quality, bass


def _irb_quality(text: str) -> Optional[str]:
    text = text.split("/")[0]
    if text.startswith(":min"):
        rest = text[4:]
        if rest.startswith(":maj7") or rest in ("", "6"):
            return "min"
        return "min7" if any(x in rest for x in ("7", "9", "11", "13")) else "min"
    if text.startswith(":maj7"):
        return "maj7"
    if text in ("", ":maj", "6", "69"):
        return "maj"
    if text.startswith("h"):
        return "hdim7"
    if text.startswith("o") or text.startswith("+") or text.startswith(":aug"):
        return None
    if text in ("sus", "sus4"):
        return "sus4"
    if text[:1] in ("7", "9") or text.startswith("13"):
        return "7"
    return None


def parse_irb_token(token: str) -> Optional[tuple[float, Optional[Parsed]]]:
    """``"2G:min7"`` → ``(2.0 phách, (7, "min7", None))``; dòng không phải hợp âm → None."""
    match = re.match(r"^(\d+)(\.*)([A-G][-#]*)(.*)$", token.strip())
    if not match:
        return None
    beats = 4 / int(match.group(1)) * (1.5 if match.group(2) else 1.0) if int(match.group(1)) else 0.0
    root = _root_pc(match.group(3))
    quality = _irb_quality(match.group(4).strip())
    if root is None or quality is None:
        return beats, None
    return beats, (root, quality, None)


def to_harte(parsed: Optional[Parsed]) -> Optional[str]:
    if parsed is None:
        return None
    root, quality, bass = parsed
    text = f"{_NAMES[root]}:{quality}"
    if bass is not None:
        text += f"/{_NAMES[bass]}"
    return text


def label_to_state(parsed: Optional[Parsed], key: Key, states: list[ChordDef]) -> Optional[int]:
    """Trạng thái của nhãn trong từ vựng: khớp cả bass nếu từ vựng có hợp âm đảo đó, không thì ``nearest_state``."""
    if parsed is None:
        return None
    root, quality, bass = parsed
    rel_root = (root - key.tonic) % 12
    if bass is not None:
        rel_bass = (bass - key.tonic) % 12
        for index, c in enumerate(states):
            if c.root == rel_root and c.bass == rel_bass and c.quality == quality:
                return index
    return nearest_state(rel_root, quality, states)


def parse_label(label: Optional[str]) -> Optional[Parsed]:
    """Nhãn trong ``Song.chords``: Harte (POP909) hoặc dạng ``to_harte`` (iRb, bass ghi bằng tên nốt)."""
    if label is None:
        return None
    if "/" in label and label.split("/")[1][:1] in STEP_PC:
        head, bass_name = label.split("/", 1)
        parsed = parse_harte(head)
        bass = _root_pc(bass_name)
        return None if parsed is None or bass is None else (parsed[0], parsed[1], bass)
    return parse_harte(label)


# ------------------------------------------------------------------------------------------------ MIDI tối giản


def _read_varlen(data: bytes, pos: int) -> tuple[int, int]:
    value = 0
    while True:
        byte = data[pos]
        pos += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, pos


def _read_tracks(data: bytes) -> tuple[int, list[list[tuple[int, int, bytes]]]]:
    """``(ticks mỗi phách đen, các track)``; mỗi track là danh sách ``(tick tuyệt đối, loại, dữ liệu)``.

    Loại: byte trạng thái MIDI (0x80–0xEF) hoặc 0xFF00 | kiểu meta. Bỏ qua SysEx."""
    if data[:4] != b"MThd":
        raise ValueError("Không phải file MIDI")
    header_len, _fmt, count, division = struct.unpack(">IHHH", data[4:14])
    if division & 0x8000:
        raise ValueError("Không hỗ trợ MIDI dạng SMPTE")
    pos = 8 + header_len
    tracks = []
    for _ in range(count):
        if data[pos : pos + 4] != b"MTrk":
            break
        length = struct.unpack(">I", data[pos + 4 : pos + 8])[0]
        chunk, pos = data[pos + 8 : pos + 8 + length], pos + 8 + length
        events, i, tick, status = [], 0, 0, 0
        while i < len(chunk):
            delta, i = _read_varlen(chunk, i)
            tick += delta
            byte = chunk[i]
            if byte == 0xFF:
                kind = chunk[i + 1]
                size, i = _read_varlen(chunk, i + 2)
                events.append((tick, 0xFF00 | kind, chunk[i : i + size]))
                i += size
                continue
            if byte in (0xF0, 0xF7):
                size, i = _read_varlen(chunk, i + 1)
                i += size
                continue
            if byte & 0x80:
                status, i = byte, i + 1
            size = 1 if (status & 0xF0) in (0xC0, 0xD0) else 2
            events.append((tick, status, chunk[i : i + size]))
            i += size
        tracks.append(events)
    return division, tracks


def read_midi_notes(path: Path, track_name: str) -> list[tuple[float, float, int]]:
    """Nốt ``(giây bắt đầu, giây kết thúc, cao độ)`` của track có tên ``track_name``, đổi tick sang giây theo tempo."""
    division, tracks = _read_tracks(path.read_bytes())
    tempos = sorted(
        (tick, int.from_bytes(payload, "big")) for track in tracks for tick, kind, payload in track if kind == 0xFF51
    ) or [(0, 500000)]
    if tempos[0][0] != 0:
        tempos.insert(0, (0, 500000))

    def seconds(tick: int) -> float:
        total, last_tick, tempo = 0.0, 0, tempos[0][1]
        for change_tick, change_tempo in tempos[1:]:
            if change_tick >= tick:
                break
            total += (change_tick - last_tick) * tempo / division / 1e6
            last_tick, tempo = change_tick, change_tempo
        return total + (tick - last_tick) * tempo / division / 1e6

    for track in tracks:
        names = [payload.decode("latin-1").strip() for _, kind, payload in track if kind == 0xFF03]
        if track_name not in names:
            continue
        notes, open_notes = [], {}
        for tick, status, payload in track:
            kind = status & 0xF0 if status < 0xFF00 else None
            if kind == 0x90 and payload[1] > 0:
                open_notes[payload[0]] = tick
            elif kind == 0x80 or (kind == 0x90 and payload[1] == 0):
                start = open_notes.pop(payload[0], None)
                if start is not None:
                    notes.append((round(seconds(start), 6), round(seconds(tick), 6), payload[0]))
        return sorted(notes)
    return []


# ------------------------------------------------------------------------------------------------ POP909


def _steps_from_bars(bars: list[tuple[float, list[float]]]) -> list[tuple[float, float]]:
    """Các bước ``(giây bắt đầu, giây kết thúc)`` từ danh sách ô ``(giây đầu ô, các phách trong ô)``."""
    out = []
    for (start, beats), (next_start, _) in zip(bars, bars[1:]):
        if len(beats) == 4:
            out += [(start, beats[2]), (beats[2], next_start)]
        else:
            out.append((start, next_start))
    return out


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def _key_from_label(label: str) -> Optional[Key]:
    match = re.match(r"^([A-G][#b]*):(maj|min)", label.strip())
    if not match:
        return None
    tonic = _root_pc(match.group(1))
    mode = "major" if match.group(2) == "maj" else "minor"
    return Key(tonic, mode, fifths_of(tonic, mode))


def read_pop909(root: Path) -> Iterator[Song]:
    base = root / "POP909" if (root / "POP909").is_dir() else root
    for song_dir in sorted(p for p in base.iterdir() if p.is_dir() and p.name.isdigit()):
        number = song_dir.name
        try:
            yield _read_pop909_song(song_dir, number)
        except (OSError, ValueError, IndexError):
            continue


def _read_pop909_song(song_dir: Path, number: str) -> Song:
    keys = []
    for line in (song_dir / "key_audio.txt").read_text().splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and (key := _key_from_label(parts[2])):
            keys.append((float(parts[1]) - float(parts[0]), key))
    if not keys:
        raise ValueError("thiếu giọng")
    key = max(keys, key=lambda item: item[0])[1]

    beat_rows = [list(map(float, line.split())) for line in (song_dir / "beat_midi.txt").read_text().splitlines() if line.strip()]
    bars: list[tuple[float, list[float]]] = []
    for time, _half, bar in beat_rows:
        if bar == 1.0 or not bars:
            bars.append((time, [time]))
        else:
            bars[-1][1].append(time)
    steps = _steps_from_bars(bars)
    beat_seconds = (beat_rows[-1][0] - beat_rows[0][0]) / max(1, len(beat_rows) - 1)

    chords = []
    for line in (song_dir / "chord_midi.txt").read_text().splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            chords.append((float(parts[0]), float(parts[1]), parts[2].strip()))

    notes = read_midi_notes(song_dir / f"{number}.mid", "MELODY")

    step_chords: list[Optional[str]] = []
    melody: list[list[tuple[int, float]]] = []
    for s0, s1 in steps:
        best = max(chords, key=lambda c: _overlap(s0, s1, c[0], c[1]), default=None)
        label = best[2] if best and _overlap(s0, s1, best[0], best[1]) > 0 else None
        step_chords.append(label if label and parse_harte(label) else None)
        melody.append(
            [(pitch % 12, round(_overlap(s0, s1, n0, n1) / beat_seconds, 4)) for n0, n1, pitch in notes
             if _overlap(s0, s1, n0, n1) > 1e-6]
        )
    return Song(name=f"pop909/{number}", key=key, chords=step_chords, melody=melody)


# ------------------------------------------------------------------------------------------------ iRb


def read_irb(root: Path) -> Iterator[Song]:
    for path in sorted(root.rglob("*.jazz")):
        if "__MACOSX" in path.parts:
            continue
        song = _read_irb_file(path)
        if song is not None and any(song.chords):
            yield song


def _read_irb_file(path: Path) -> Optional[Song]:
    key: Optional[Key] = None
    bar_beats = 4.0
    events: list[tuple[float, Optional[Parsed]]] = []  # (phách bắt đầu, hợp âm)
    bars: list[tuple[float, float]] = []  # (phách đầu ô, độ dài ô theo nhịp)
    pos, bar_start = 0.0, 0.0
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("!"):
            continue
        if line.startswith("*M") and "/" in line:
            num, den = line[2:].split("/", 1)
            if num.isdigit() and den.isdigit():
                bar_beats = int(num) * 4 / int(den)
            continue
        if re.match(r"^\*[A-Ga-g][-#]*:$", line):
            name = line[1:-1]
            tonic = _root_pc(name[0].upper() + name[1:])
            mode = "major" if name[0].isupper() else "minor"
            key = Key(tonic, mode, fifths_of(tonic, mode))
            continue
        if line.startswith("="):
            if pos > bar_start:
                bars.append((bar_start, bar_beats))
            bar_start = pos
            continue
        token = parse_irb_token(line)
        if token is not None:
            beats, parsed = token
            events.append((pos, parsed))
            pos += beats
    if pos > bar_start:
        bars.append((bar_start, bar_beats))
    if key is None or not events:
        return None

    def active(at: float) -> Optional[Parsed]:
        current = None
        for start, parsed in events:
            if start > at + 1e-9:
                break
            current = parsed
        return current

    chords: list[Optional[str]] = []
    for start, beats in bars:
        offsets = [0.0, 2.0] if abs(beats - 4.0) < 1e-9 else [0.0]
        chords += [to_harte(active(start + o)) for o in offsets]
    return Song(name=f"irb/{path.stem}", key=key, chords=chords, melody=None)
