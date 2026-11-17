"""Bước nhận diện lời ca của pipeline (nhánh B), chạy sau khi đã có MusicXML của phần nhạc (nhánh A).

    ảnh trang + bố cục ─► vùng chữ (text_mask) ─► OCR từng vùng giữa các hệ ─► dòng lời / hợp âm / khác
    MusicXML (khuông giọng hát) + measureMap ─► x các lần đánh nốt (cột đầu nốt) ─► gắn âm tiết ─► <lyric>

Không bao giờ làm job thất bại: lỗi ở đây chỉ thành cảnh báo, MusicXML phần nhạc giữ nguyên. Chỗ gắn kém tin cậy được
liệt kê trong ``result_data.lyrics.review`` thay vì âm thầm xuất sai.
"""

from __future__ import annotations

import json
import logging
import os
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from app.convert.musicxml import XML_HEADER
from app.omr.layout import ROLE_SINGLE, PageLayout
from app.omr.lyrics import align as align_mod
from app.omr.lyrics.musicxml_lyrics import MeasureAttacks, add_lyric, clear_lyrics, collect_attacks, select_target
from app.omr.lyrics.noteheads import header_width, notehead_columns
from app.omr.lyrics.ocr import TextEngine
from app.omr.lyrics.regions import KIND_CHORDS, KIND_LYRICS, read_page_text
from app.omr.lyrics.syllables import finalize, split_line

log = logging.getLogger(__name__)

MAX_REVIEW_WARNINGS = 8


@dataclass
class LyricsPage:
    number: int
    page_png: Path
    """Ảnh trang 1050x1485 (``pages/page-NNN.png``)."""

    layout: PageLayout
    ocr_png: Optional[Path] = None
    """Ảnh độ phân giải cao cho OCR (``ocr/page-NNN.png``); None thì OCR trên ảnh trang."""

    scale: float = 1.0


@dataclass
class LyricsReport:
    status: str = "skipped"
    """``done``, ``skipped`` (không có khuông giọng hát / không có lời / tắt) hoặc ``error``."""

    reason: Optional[str] = None
    engine: Optional[str] = None
    lines: list[dict] = field(default_factory=list)
    placements: list[align_mod.Placement] = field(default_factory=list)
    dropped: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    min_confidence: float = 0.5

    def summary(self) -> dict:
        review = [p.to_dict() for p in self.placements if p.confidence < self.min_confidence]
        verses = sorted({p.number for p in self.placements})
        data = {
            "status": self.status,
            "engine": self.engine,
            "syllables": len(self.placements) + len(self.dropped),
            "placed": len(self.placements),
            "dropped": len(self.dropped),
            "verses": verses,
            "lowConfidence": len(review),
            "review": review[:50] + self.dropped[:50],
        }
        if self.reason:
            data["reason"] = self.reason
        return data

    def to_json(self) -> str:
        return json.dumps(
            {
                **self.summary(),
                "lines": self.lines,
                "placements": [p.to_dict() for p in self.placements],
                "droppedSyllables": self.dropped,
            },
            ensure_ascii=False,
            indent=1,
        )


def recognize_lyrics(
    musicxml_path: Path,
    pages: list[LyricsPage],
    measure_map: list[dict],
    engine: TextEngine,
    min_confidence: float = 0.5,
    write: bool = True,
) -> LyricsReport:
    """Nhận diện lời ca của mọi trang và ghi ``<lyric>`` vào ``musicxml_path`` (khi ``write``)."""
    report = LyricsReport(engine=getattr(engine, "name", None), min_confidence=min_confidence)
    root = ET.fromstring(musicxml_path.read_bytes())
    part, staff, reason = select_target(root)
    if part is None:
        report.reason = reason
        return report
    measures = collect_attacks(part, staff)
    by_ordinal = {m.ordinal: m for m in measures}
    entries_by_page: dict[int, list[dict]] = defaultdict(list)
    for entry in measure_map:
        entries_by_page[int(entry["page"])].append(entry)

    unplaced_pages: list[int] = []
    for page in pages:
        page_gray = cv2.imread(str(page.page_png), cv2.IMREAD_GRAYSCALE)
        if page_gray is None:
            continue
        ocr_gray = cv2.imread(str(page.ocr_png), cv2.IMREAD_GRAYSCALE) if page.ocr_png else None
        scale = page.scale if ocr_gray is not None else 1.0
        text = read_page_text(page_gray, ocr_gray if ocr_gray is not None else page_gray, scale, page.layout, engine)
        for line in text.lines:
            if line.kind in (KIND_LYRICS, KIND_CHORDS):
                report.lines.append({"page": page.number, **line.to_dict()})
        lyric_lines = [ln for ln in text.lines if ln.kind == KIND_LYRICS]
        if not lyric_lines:
            continue
        entries = entries_by_page.get(page.number, [])
        systems: dict[int, list[dict]] = defaultdict(list)
        for entry in entries:
            if entry.get("system"):
                systems[int(entry["system"]) - 1].append(entry)
        if not systems:
            unplaced_pages.append(page.number)
            for ln in lyric_lines:
                report.dropped.extend(
                    {"page": page.number, "system": ln.system + 1, "number": ln.number, "text": s.text}
                    for s in finalize(split_line(ln.words))
                )
            continue
        for index, system in enumerate(page.layout.systems):
            lines = [(ln.number, finalize(split_line(ln.words))) for ln in text.lyrics_of(index)]
            if not lines:
                continue
            attacks = _system_attacks(page_gray, page.layout, index, systems.get(index, []), by_ordinal)
            result = align_mod.align_system(attacks, lines, page.layout.interline)
            report.placements.extend(result.placements)
            report.dropped.extend(
                {"page": page.number, "system": index + 1, "number": n, "text": s.text} for n, s in result.dropped
            )

    if unplaced_pages:
        report.warnings.append(
            "Chưa gắn được lời ca ở trang "
            + ", ".join(map(str, unplaced_pages))
            + " vì chưa xác định được ô nhịp nào thuộc hệ nào (số ô đọc được khác số ô trên ảnh)"
        )
    if not report.placements and not report.dropped:
        report.reason = "không tìm thấy dòng lời ca"
        return report

    report.status = "done"
    _dedupe(report)
    if write:
        clear_lyrics(measures)
        for p in report.placements:
            measure = by_ordinal.get(p.measure)
            if measure is None or p.attack > len(measure.attacks):
                continue
            note = measure.attacks[p.attack - 1][2]
            add_lyric(note, p.number, p.syllable.text, p.syllable.syllabic, p.syllable.extend)
        _write_xml(musicxml_path, root)

    low = [p for p in report.placements if p.confidence < min_confidence]
    for p in low[:MAX_REVIEW_WARNINGS]:
        page_no = next((e["page"] for e in measure_map if e["measure"] == p.measure), None)
        prefix = f"Trang {page_no}, " if page_no else ""
        report.warnings.append(
            f"{prefix}ô nhịp {p.measure}: lời {p.number} “{p.syllable.text}” gắn vào nốt {p.attack} "
            f"chưa chắc chắn (độ tin cậy {p.confidence:.2f}), cần kiểm tra"
        )
    if report.dropped:
        report.warnings.append(f"Có {len(report.dropped)} âm tiết lời ca chưa gắn được vào nốt nào (xem lyrics.review)")
    return report


def _system_attacks(
    page_gray: np.ndarray,
    layout: PageLayout,
    index: int,
    entries: list[dict],
    by_ordinal: dict[int, MeasureAttacks],
) -> list[align_mod.Attack]:
    """Dãy lần đánh nốt (có x) của khuông giọng hát trong hệ ``index``."""
    system = layout.systems[index]
    il = layout.interline
    staff = next((st for st in system.staves if st.role == ROLE_SINGLE), system.staves[0])
    entries = sorted(entries, key=lambda e: e["measure"])
    if not entries:
        return []
    first = by_ordinal.get(int(entries[0]["measure"]))
    header = header_width(il, first.key_fifths if first else 0, bool(first and first.shows_time))
    start = system.left + header
    columns = notehead_columns(page_gray, staff.top, staff.bottom, start, system.right, il)

    boxes = [e.get("box") for e in entries]
    if all(boxes):
        ranges = [(float(b[0]), float(b[2])) for b in boxes]  # type: ignore[index]
        ranges[0] = (max(ranges[0][0], start), ranges[0][1])
    else:
        # Không có khung từng ô: chia đều phần nhạc của hệ (kém tin cậy hơn, đánh dấu exact=False)
        width = (system.right - start) / len(entries)
        ranges = [(start + k * width, start + (k + 1) * width) for k in range(len(entries))]
        columns = []

    out: list[align_mod.Attack] = []
    for entry, (x0, x1) in zip(entries, ranges):
        measure = by_ordinal.get(int(entry["measure"]))
        if measure is None or not measure.attacks:
            continue
        timing = [(o, d) for o, d, _ in measure.attacks]
        positions = align_mod.estimate_attack_x(timing, measure.length, x0, x1, columns)
        for k, ((onset, _d), (x, exact)) in enumerate(zip(timing, positions), start=1):
            out.append(align_mod.Attack(measure=measure.ordinal, index=k, onset=onset, x=x, exact=exact))
    return out


def _dedupe(report: LyricsReport) -> None:
    """Hai dòng cùng số lời gắn vào cùng một nốt (OCR đánh số nhầm): giữ âm tiết tin cậy hơn."""
    best: dict[tuple, align_mod.Placement] = {}
    for p in report.placements:
        key = (p.measure, p.attack, p.number)
        if key not in best or p.confidence > best[key].confidence:
            best[key] = p
    if len(best) != len(report.placements):
        kept = set(map(id, best.values()))
        for p in report.placements:
            if id(p) not in kept:
                report.dropped.append({"measure": p.measure, "number": p.number, "text": p.syllable.text})
        report.placements = sorted(best.values(), key=lambda p: (p.measure, p.attack, p.number))


def _write_xml(path: Path, root: ET.Element) -> None:
    data = (XML_HEADER + ET.tostring(root, encoding="unicode")).encode("utf-8")
    temp = path.with_name(path.name + ".tmp")
    temp.write_bytes(data)
    os.replace(temp, path)
