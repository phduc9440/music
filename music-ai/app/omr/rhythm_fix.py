"""Sửa hai lỗi trường độ Transcoda hay sinh trên bản nhạc có lời (không model, không tốn quota).

1. **Nhịp ba lạc chỗ**: model đọc móc đơn thành ``12`` (móc đơn nhịp ba), ``4`` thành ``6``... Nếu một spine của ô sai tổng
   trường độ và đổi các trường độ nhịp ba về trường độ thường (``12``->``8``, ``6``->``4``, ``24``->``16``, ``3``->``2``)
   thì ô đủ đúng số chỉ nhịp, ta đổi.
2. **Nốt thừa trong hợp âm**: một nốt con của hợp âm dài hơn cả ô nhịp (``2c 1a`` trong 2/4) là nốt model bịa ra, bỏ nó
   nếu hợp âm còn nốt khác.

Chỉ sửa khi kết quả chắc chắn đúng hơn (ô thành đúng trường độ); ô đúng sẵn thì không đụng tới.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional

from app.omr import merge
from app.omr.review import slice_measures

TAB = "\t"
_TRIPLET = {"3": "2", "6": "4", "12": "8", "24": "16", "48": "32"}
_RE_LEAD = re.compile(r"^(\d+)")


@dataclass
class RhythmReport:
    triplets: int = 0
    """Số ô (theo spine) đã đổi nhịp ba về trường độ thường."""
    dropped: int = 0
    """Số nốt thừa trong hợp âm đã bỏ."""
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"triplets": self.triplets, "dropped": self.dropped}


def _sub_duration(sub: str) -> Optional[Fraction]:
    return merge.token_duration(sub)


def _straighten(token: str) -> str:
    subs = token.split(" ")
    out = []
    for sub in subs:
        match = _RE_LEAD.match(sub)
        if match and match.group(1) in _TRIPLET:
            sub = _TRIPLET[match.group(1)] + sub[match.end():]
        out.append(sub)
    return " ".join(out)


def _is_triplet(token: str) -> bool:
    match = _RE_LEAD.match(token.split(" ")[0])
    return bool(match and match.group(1) in _TRIPLET)


def _spine_total(cells: list[str]) -> Fraction:
    total = Fraction(0)
    for cell in cells:
        duration = merge.token_duration(cell)
        if duration is not None:
            total += duration
    return total


def _drop_long_subs(token: str, meter: Fraction) -> tuple[str, int]:
    subs = token.split(" ")
    if len(subs) < 2:
        return token, 0
    keep = [s for s in subs if (_sub_duration(s) or Fraction(0)) <= meter]
    if not keep or len(keep) == len(subs):
        return token, 0
    return " ".join(keep), len(subs) - len(keep)


def fix_lines(lines: list[str], spines: int) -> tuple[list[str], int, int, list[int]]:
    """``(dòng mới, số spine-ô đổi nhịp ba, số nốt bỏ, số thứ tự ô đã sửa)``."""
    fake = merge.MergeResult(text="", spines=spines, lines=list(lines), line_pages=[1] * len(lines))
    out = list(lines)
    triplets = dropped = 0
    touched: list[int] = []
    for measure in slice_measures(fake):
        meter = measure.meter
        if meter is None or not measure.regular:
            continue
        changed = False
        for index in measure.data_lines:  # quy tắc 2 trước: nó không đổi tổng trường độ (token_duration lấy nốt đầu)
            cells = out[index].split(TAB)
            for column, cell in enumerate(cells):
                new, count = _drop_long_subs(cell, meter)
                if count:
                    cells[column] = new
                    dropped += count
                    changed = True
            out[index] = TAB.join(cells)
        for column in range(spines):
            cells = [out[i].split(TAB)[column] for i in measure.data_lines]
            if _spine_total(cells) in (Fraction(0), meter) or not any(_is_triplet(c) for c in cells if c != "."):
                continue
            straight = [_straighten(c) if c != "." else c for c in cells]
            if _spine_total(straight) != meter:
                continue
            for i, new in zip(measure.data_lines, straight):
                row = out[i].split(TAB)
                row[column] = new
                out[i] = TAB.join(row)
            triplets += 1
            changed = True
        if changed:
            touched.append(measure.ordinal)
    return out, triplets, dropped, touched


def apply(result: merge.MergeResult) -> tuple[merge.MergeResult, RhythmReport]:
    report = RhythmReport()
    lines, report.triplets, report.dropped, touched = fix_lines(result.lines, result.spines)
    if not touched:
        return result, report
    report.notes.append(
        f"Sửa trường độ ở ô {', '.join(map(str, touched))}: "
        f"{report.triplets} chỗ nhịp ba đọc nhầm, bỏ {report.dropped} nốt thừa trong hợp âm"
    )
    return merge.with_lines(result, lines), report
