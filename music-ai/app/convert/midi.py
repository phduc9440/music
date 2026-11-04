"""MusicXML -> MIDI (đặc tả mục 2.4): mỗi staff một track và một kênh để Player tắt/bật từng tay (mục 4.4).

Tự ghi file MIDI chuẩn (SMF định dạng 1) thay vì ``music21 ... write('midi')``: cách gán track/kênh của music21 cho bản
nhiều staff thay đổi theo phiên bản và không kiểm thử được khi thiếu music21, trong khi Player cần đúng quy ước:

* track ``i`` (đếm từ 0) là staff ``i + 1`` và dùng kênh ``i`` (bỏ qua kênh 9 dành cho trống);
* tempo và số chỉ nhịp nằm ở track đầu (staff 1); mỗi track có chương trình 0 (Acoustic Grand Piano);
* nốt nối (tie) được gộp thành một nốt dài; nốt trang trí, dấu lặp và biểu cảm (dynamics) được bỏ qua, vận tốc cố định.
"""

from __future__ import annotations

import os
import struct
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Optional

from app.convert.errors import ConversionError
from app.convert.score_xml import NoteEvent, child_int, child_text, parse_part_events

TICKS_PER_QUARTER = 480
VELOCITY = 80
DRUM_CHANNEL = 9


@dataclass
class MidiStats:
    """Thống kê file MIDI đã ghi, trả về cho Java/log."""

    notes: int
    tracks: int
    seconds: float


def musicxml_to_midi_bytes(data: bytes, tempo_bpm: int) -> tuple[bytes, MidiStats]:
    """Đổi MusicXML partwise (đã chuẩn hóa hoặc chưa) thành bytes của file MIDI.

    Nhiều ``<part>`` thì mỗi part là một track (bản chưa gộp staff); một part nhiều staff thì mỗi staff là một track.
    Ném :class:`ConversionError` nếu XML hỏng hoặc không có nốt nào.
    """
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ConversionError(f"MusicXML không đọc được: {exc}") from exc
    parts = root.findall("part")
    if root.tag != "score-partwise" or not parts:
        raise ConversionError("MusicXML phải là score-partwise và có ít nhất một <part>")

    events: list[tuple[int, NoteEvent]] = []  # (chỉ số track, nốt)
    for part_index, part in enumerate(parts):
        part_events, _ = parse_part_events(part)
        for event in part_events:
            track = part_index if len(parts) > 1 else event.staff - 1
            events.append((max(0, track), event))
    if not events:
        raise ConversionError("Bản nhạc không có nốt nào để ghi MIDI")

    track_count = max(track for track, _ in events) + 1
    time_signature = _first_time_signature(parts[0])
    tracks = [
        _build_track(index, [e for t, e in events if t == index], tempo_bpm if index == 0 else None, time_signature)
        for index in range(track_count)
    ]
    header = b"MThd" + struct.pack(">IHHH", 6, 1, track_count, TICKS_PER_QUARTER)
    body = b"".join(b"MTrk" + struct.pack(">I", len(t)) + t for t in tracks)

    end_quarter = max(e.start + e.length for _, e in events)
    seconds = float(end_quarter) * 60.0 / tempo_bpm
    return header + body, MidiStats(notes=len(events), tracks=track_count, seconds=round(seconds, 2))


def musicxml_file_to_midi_file(xml_path: Path, out_path: Path, tempo_bpm: int) -> MidiStats:
    """Đọc ``xml_path``, ghi ``out_path`` (ghi file tạm rồi đổi tên để Java không đọc phải file dở)."""
    data, stats = musicxml_to_midi_bytes(xml_path.read_bytes(), tempo_bpm)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    temp = out_path.with_name(out_path.name + ".tmp")
    temp.write_bytes(data)
    os.replace(temp, out_path)
    return stats


# ====================================================================== dựng track


def _channel(track_index: int) -> int:
    channel = track_index if track_index < DRUM_CHANNEL else track_index + 1
    return min(channel, 15)


def _ticks(quarters: Fraction) -> int:
    return int(round(quarters * TICKS_PER_QUARTER))


def _build_track(
    index: int, notes: list[NoteEvent], tempo_bpm: Optional[int], time_signature: Optional[tuple[int, int]]
) -> bytes:
    channel = _channel(index)
    messages: list[tuple[int, int, bytes]] = []  # (tick, thứ tự ưu tiên, dữ liệu); nốt tắt (0) đứng trước nốt bật (1)
    for note in notes:
        start = _ticks(note.start)
        end = max(start + 1, _ticks(note.start + note.length))
        messages.append((start, 1, bytes([0x90 | channel, note.midi, VELOCITY])))
        messages.append((end, 0, bytes([0x80 | channel, note.midi, 0])))
    messages.sort(key=lambda m: (m[0], m[1]))

    meta = bytearray()
    meta += _event(0, _meta(0x03, f"Staff {index + 1}".encode("ascii")))
    if tempo_bpm is not None:
        meta += _event(0, _meta(0x51, round(60_000_000 / tempo_bpm).to_bytes(3, "big")))
    if time_signature is not None and index == 0:
        beats, beat_type = time_signature
        meta += _event(0, _meta(0x58, bytes([beats, beat_type.bit_length() - 1, 24, 8])))
    meta += _event(0, bytes([0xC0 | channel, 0]))  # chương trình 0 = Acoustic Grand Piano

    data = bytearray(meta)
    previous = 0
    for tick, _, message in messages:
        data += _event(tick - previous, message)
        previous = tick
    data += _event(0, _meta(0x2F, b""))
    return bytes(data)


def _first_time_signature(part: ET.Element) -> Optional[tuple[int, int]]:
    """Số chỉ nhịp đầu tiên dạng ``(beats, beat_type)``; bỏ qua nhịp ghép như ``3+2`` hoặc ``beat_type`` không phải 2^n."""
    for time in part.iter("time"):
        beats_text, type_text = child_text(time, "beats"), child_text(time, "beat-type")
        if beats_text and type_text and beats_text.isdigit():
            beats, beat_type = int(beats_text), child_int(time, "beat-type") or 0
            if 1 <= beats <= 255 and beat_type > 0 and beat_type & (beat_type - 1) == 0:
                return beats, beat_type
        return None
    return None


def _meta(kind: int, payload: bytes) -> bytes:
    return bytes([0xFF, kind]) + _vlq(len(payload)) + payload


def _event(delta: int, message: bytes) -> bytes:
    return _vlq(delta) + message


def _vlq(value: int) -> bytes:
    """Số nguyên không âm -> độ dài biến đổi (variable-length quantity) của MIDI."""
    if value < 0:
        raise ValueError("delta time âm")
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))
