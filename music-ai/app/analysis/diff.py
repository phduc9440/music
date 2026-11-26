"""So sánh hai MusicXML của cùng một bản nhạc: bản OMR sinh ra (``base``) và bản người dùng đã sửa (``target``).

Dùng để đo người dùng phải sửa bao nhiêu sau khi số hóa: tỉ lệ ô giữ nguyên, ô OMR sinh thừa (lỗi lặp ô nhịp), ô OMR bỏ
sót, và lỗi nốt theo loại. Chỉ dùng thư viện chuẩn (``xml.etree``), đọc partwise như :mod:`app.convert.score_xml`.

Cách làm:

1. Mỗi ô nhịp -> "chữ ký" là tập nốt ``(khuông, thời điểm, bậc, dấu, độ dài)``; nốt nối (tie) được cộng dồn vào nốt đầu.
2. Căn hai dãy ô bằng ``difflib.SequenceMatcher`` trên chữ ký (tìm dãy con chung dài nhất): ô khớp là ``same``; đoạn
   khác nhau ghép lần lượt từng ô là ``edited``, dư ở ``base`` là ``deleted`` (OMR thừa), dư ở ``target`` là ``added`` (OMR thiếu).
3. Ô ``edited``: ghép nốt theo (khuông, thời điểm) rồi phân loại lỗi.
"""

from __future__ import annotations

import difflib
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Optional

from app.convert.errors import ConversionError
from app.convert.score_xml import child_int, child_text, current_divisions

STATUS_SAME = "same"
STATUS_EDITED = "edited"
STATUS_DELETED = "deleted"  # có ở bản OMR, người dùng đã xóa (OMR sinh thừa)
STATUS_ADDED = "added"  # không có ở bản OMR, người dùng thêm (OMR bỏ sót)

ERR_PITCH = "PITCH"  # sai cao độ (khác bậc)
ERR_ACCIDENTAL = "ACCIDENTAL"  # đúng bậc, sai dấu hóa
ERR_DURATION = "DURATION"  # đúng cao độ, sai trường độ
ERR_TIMING = "TIMING"  # đúng nốt, lệch vị trí trong ô
ERR_EXTRA = "EXTRA"  # nốt OMR sinh thừa
ERR_MISSING = "MISSING"  # nốt OMR bỏ sót
ERROR_TYPES = (ERR_PITCH, ERR_ACCIDENTAL, ERR_DURATION, ERR_TIMING, ERR_EXTRA, ERR_MISSING)

_STEP_INDEX = {"C": 0, "D": 1, "E": 2, "F": 3, "G": 4, "A": 5, "B": 6}

MAX_BYTES = 20 * 1024 * 1024


@dataclass(frozen=True)
class Note:
    staff: tuple[int, int]  # (chỉ số part, staff trong part)
    onset: Fraction  # phách đen kể từ đầu ô
    diatonic: int  # 7 * quãng tám + bậc
    alter: int
    length: Fraction  # phách đen (đã cộng các nốt nối)

    def label(self) -> str:
        names = "CDEFGAB"
        mark = {-2: "bb", -1: "b", 0: "", 1: "#", 2: "x"}.get(self.alter, f"({self.alter:+d})")
        return f"{names[self.diatonic % 7]}{mark}{self.diatonic // 7}"


@dataclass
class _Mutable:
    """Nốt đang đọc: độ dài có thể tăng khi gặp nốt nối ở ô sau."""

    staff: tuple[int, int]
    measure: int
    onset: Fraction
    diatonic: int
    alter: int
    length: Fraction


@dataclass
class MeasureDiff:
    base: Optional[int]  # số ô (từ 1) ở bản OMR, None nếu thêm mới
    target: Optional[int]  # số ô (từ 1) ở bản đã sửa, None nếu bị xóa
    status: str
    errors: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"base": self.base, "target": self.target, "status": self.status, "errors": self.errors}


def load_measures(path: Path) -> list[list[Note]]:
    """Đọc MusicXML thành danh sách ô nhịp (mỗi ô là danh sách nốt đã sắp xếp)."""
    try:
        if path.stat().st_size > MAX_BYTES:
            raise ConversionError(f"File MusicXML quá lớn để so sánh: {path.name}")
        data = path.read_bytes()
    except OSError as exc:
        raise ConversionError(f"Không đọc được file: {path.name}") from exc
    if b"<!ENTITY" in data:
        raise ConversionError("MusicXML có khai báo ENTITY nên không được chấp nhận")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ConversionError(f"MusicXML hỏng ({path.name}): {exc}") from exc
    if root.tag != "score-partwise":
        raise ConversionError(f"Chỉ so sánh được MusicXML dạng score-partwise ({path.name})")
    return parse_measures(root)


def parse_measures(root: ET.Element) -> list[list[Note]]:
    per_measure: list[list[_Mutable]] = []
    for part_index, part in enumerate(root.findall("part")):
        _read_part(part, part_index, per_measure)
    return [
        sorted(
            (Note(n.staff, n.onset, n.diatonic, n.alter, n.length) for n in notes),
            key=lambda n: (n.staff, n.onset, n.diatonic, n.alter),
        )
        for notes in per_measure
    ]


def _read_part(part: ET.Element, part_index: int, per_measure: list[list[_Mutable]]) -> None:
    open_ties: dict[tuple, _Mutable] = {}
    divisions = 1
    for index, measure in enumerate(part.findall("measure")):
        while len(per_measure) <= index:
            per_measure.append([])
        pos = Fraction(0)
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
                    continue
                length = Fraction(duration, divisions)
                is_chord = element.find("chord") is not None
                start = last_start if is_chord else pos
                if not is_chord:
                    last_start = start
                    pos = start + length
                pitch = element.find("pitch")
                if pitch is None:
                    continue  # nghỉ hoặc nốt không cao độ
                step = (child_text(pitch, "step") or "").upper()
                octave = child_int(pitch, "octave")
                if step not in _STEP_INDEX or octave is None:
                    continue
                alter_text = child_text(pitch, "alter")
                try:
                    alter = round(float(alter_text)) if alter_text is not None else 0
                except ValueError:
                    alter = 0
                staff = (part_index, child_int(element, "staff") or 1)
                diatonic = 7 * octave + _STEP_INDEX[step]
                ties = {t.get("type") for t in element.findall("tie")}
                key = (staff, diatonic, alter)
                if "stop" in ties and key in open_ties:
                    open_ties[key].length += length
                    if "start" not in ties:
                        del open_ties[key]
                    continue
                note = _Mutable(staff, index, start, diatonic, alter, length)
                per_measure[index].append(note)
                if "start" in ties:
                    open_ties[key] = note


def signature(notes: list[Note]) -> tuple:
    return tuple((n.staff, n.onset, n.diatonic, n.alter, n.length) for n in notes)


def diff_measures(base: list[list[Note]], target: list[list[Note]]) -> list[MeasureDiff]:
    """Căn hai dãy ô và phân loại từng ô."""
    a = [signature(m) for m in base]
    b = [signature(m) for m in target]
    rows: list[MeasureDiff] = []
    matcher = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for offset in range(i2 - i1):
                rows.append(MeasureDiff(i1 + offset + 1, j1 + offset + 1, STATUS_SAME))
            continue
        pairs = min(i2 - i1, j2 - j1)
        for offset in range(pairs):
            i, j = i1 + offset, j1 + offset
            rows.append(MeasureDiff(i + 1, j + 1, STATUS_EDITED, classify(base[i], target[j])))
        for i in range(i1 + pairs, i2):
            rows.append(MeasureDiff(i + 1, None, STATUS_DELETED))
        for j in range(j1 + pairs, j2):
            rows.append(MeasureDiff(None, j + 1, STATUS_ADDED))
    return rows


def classify(base: list[Note], target: list[Note]) -> list[dict]:
    """Lỗi nốt của một ô đã sửa. Mỗi lỗi: ``{type, staff, onset, base, target}`` (nốt ghi dạng chữ, vd. ``F#4``)."""
    errors: list[dict] = []
    left = list(base)
    right = list(target)

    def take(match) -> tuple[Optional[Note], Optional[Note]]:
        for x in left:
            for y in right:
                if match(x, y):
                    left.remove(x)
                    right.remove(y)
                    return x, y
        return None, None

    def add(kind: str, x: Optional[Note], y: Optional[Note]) -> None:
        ref = x or y
        assert ref is not None
        errors.append(
            {
                "type": kind,
                "staff": ref.staff[1],
                "part": ref.staff[0],
                "onset": float(ref.onset),
                "base": x.label() if x else None,
                "target": y.label() if y else None,
            }
        )

    # 1) nốt giống hệt: không phải lỗi
    while take(lambda x, y: x == y)[0] is not None:
        pass
    # 2) cùng khuông và thời điểm
    rules = (
        (ERR_DURATION, lambda x, y: x.staff == y.staff and x.onset == y.onset and x.diatonic == y.diatonic and x.alter == y.alter),
        (ERR_ACCIDENTAL, lambda x, y: x.staff == y.staff and x.onset == y.onset and x.diatonic == y.diatonic),
        (ERR_PITCH, lambda x, y: x.staff == y.staff and x.onset == y.onset and x.length == y.length),
        (ERR_PITCH, lambda x, y: x.staff == y.staff and x.onset == y.onset),
        # 3) đúng nốt nhưng lệch vị trí
        (ERR_TIMING, lambda x, y: x.staff == y.staff and x.diatonic == y.diatonic and x.alter == y.alter),
    )
    for kind, match in rules:
        while True:
            x, y = take(match)
            if x is None:
                break
            add(kind, x, y)
    for x in left:
        add(ERR_EXTRA, x, None)
    for y in right:
        add(ERR_MISSING, None, y)
    errors.sort(key=lambda e: (e["part"], e["staff"], e["onset"], e["type"]))
    return errors


def summarize(rows: list[MeasureDiff], base: list[list[Note]], target: list[list[Note]]) -> dict:
    counts = {s: 0 for s in (STATUS_SAME, STATUS_EDITED, STATUS_DELETED, STATUS_ADDED)}
    by_type = {t: 0 for t in ERROR_TYPES}
    for row in rows:
        counts[row.status] += 1
        for error in row.errors:
            by_type[error["type"]] += 1
    total = len(rows)
    changed = total - counts[STATUS_SAME]
    base_notes = sum(len(m) for m in base)
    note_errors = sum(by_type.values())
    # ô bị xóa/thêm cũng tính lỗi nốt (mỗi nốt của ô thừa/thiếu là một lỗi) để noteErrorRate đo đủ công sửa
    for row in rows:
        if row.status == STATUS_DELETED and row.base is not None:
            note_errors += len(base[row.base - 1])
        elif row.status == STATUS_ADDED and row.target is not None:
            note_errors += len(target[row.target - 1])
    return {
        "baseMeasures": len(base),
        "targetMeasures": len(target),
        "same": counts[STATUS_SAME],
        "edited": counts[STATUS_EDITED],
        "deleted": counts[STATUS_DELETED],
        "added": counts[STATUS_ADDED],
        "measureEditRate": round(changed / total, 4) if total else 0.0,
        "baseNotes": base_notes,
        "noteErrors": note_errors,
        "noteErrorRate": round(note_errors / base_notes, 4) if base_notes else 0.0,
        "byType": by_type,
    }


def diff_files(base_path: Path, target_path: Path) -> dict:
    """Kết quả ``POST /analysis/diff``: ``{measures: [...], summary: {...}}``."""
    base = load_measures(base_path)
    target = load_measures(target_path)
    rows = diff_measures(base, target)
    return {"measures": [r.to_dict() for r in rows], "summary": summarize(rows, base, target)}
