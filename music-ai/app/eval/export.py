"""Ghi :class:`ScoreData` ra MusicXML tối giản (chỉ dùng cho đánh giá, không thay ``app/convert``).

Dùng khi cần MusicXML từ ground truth ``**kern`` mà máy không có music21, ví dụ để đo riêng nhánh lời ca trên phần nhạc
đúng. Mỗi khuông thành một part một staff (part đầu = khuông trên cùng); nốt cùng thời điểm thành hợp âm; khoảng trống
được lấp bằng ``<forward>``. Không ghi dấu nối, dùi, luyến: đánh giá không cần.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from fractions import Fraction
from math import lcm

from app.eval.score import ScoreData

_STEPS = [("C", 0), ("C", 1), ("D", 0), ("E", -1), ("E", 0), ("F", 0), ("F", 1), ("G", 0), ("G", 1), ("A", 0), ("B", -1), ("B", 0)]


def to_musicxml(score: ScoreData, voice_staff: int = 1) -> bytes:
    denominators = [e.duration.denominator for e in score.events] + [e.onset.denominator for e in score.events] + [1]
    divisions = 1
    for d in denominators:
        divisions = lcm(divisions, d)
    root = ET.Element("score-partwise", {"version": "4.0"})
    part_list = ET.SubElement(root, "part-list")
    beats, beat_type = (score.time_signature or "4/4").split("/")
    for staff in range(1, score.staves + 1):
        pid = f"P{staff}"
        sp = ET.SubElement(part_list, "score-part", {"id": pid})
        ET.SubElement(sp, "part-name").text = "Voice" if staff == voice_staff else f"Staff {staff}"
        part = ET.SubElement(root, "part", {"id": pid})
        by_measure = score.by_measure()
        for measure in range(1, score.measures + 1):
            m = ET.SubElement(part, "measure", {"number": str(measure)})
            if measure == 1:
                attrs = ET.SubElement(m, "attributes")
                ET.SubElement(attrs, "divisions").text = str(divisions)
                key = ET.SubElement(attrs, "key")
                ET.SubElement(key, "fifths").text = str(score.key_fifths or 0)
                time = ET.SubElement(attrs, "time")
                ET.SubElement(time, "beats").text = beats
                ET.SubElement(time, "beat-type").text = beat_type
                clef = ET.SubElement(attrs, "clef")
                ET.SubElement(clef, "sign").text = "G"
                ET.SubElement(clef, "line").text = "2"
            events = sorted(
                (e for e in by_measure.get(measure, []) if e.staff == staff),
                key=lambda e: (e.onset, e.midi if e.midi is not None else -1),
            )
            cursor = Fraction(0)
            last_onset = None
            for e in events:
                if last_onset is not None and e.onset == last_onset:
                    chord = True
                else:
                    chord = False
                    if e.onset > cursor:
                        fw = ET.SubElement(m, "forward")
                        ET.SubElement(fw, "duration").text = str(int((e.onset - cursor) * divisions))
                        cursor = e.onset
                    elif e.onset < cursor:
                        bk = ET.SubElement(m, "backup")
                        ET.SubElement(bk, "duration").text = str(int((cursor - e.onset) * divisions))
                        cursor = e.onset
                n = ET.SubElement(m, "note")
                if chord:
                    ET.SubElement(n, "chord")
                if e.is_rest:
                    ET.SubElement(n, "rest")
                else:
                    step, alter = _STEPS[e.midi % 12]
                    pitch = ET.SubElement(n, "pitch")
                    ET.SubElement(pitch, "step").text = step
                    if alter:
                        ET.SubElement(pitch, "alter").text = str(alter)
                    ET.SubElement(pitch, "octave").text = str(e.midi // 12 - 1)
                ET.SubElement(n, "duration").text = str(int(e.duration * divisions))
                if e.tie_stop:
                    ET.SubElement(n, "tie", {"type": "stop"})
                if not chord:
                    cursor = e.onset + e.duration
                    last_onset = e.onset
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="utf-8").split(b"?>", 1)[-1].lstrip()
