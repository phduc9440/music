"""Gắn âm tiết lời ca vào đúng lần đánh nốt (ô nhịp, thứ tự nốt trong ô, số lời).

Dữ liệu vào:
* **nhạc** (từ MusicXML đã chuẩn hóa): mỗi ô nhịp có các lần đánh nốt trên khuông giọng hát (thời điểm, trường độ);
* **bố cục** (``measureMap`` + ``layout``): ô nào thuộc hệ nào, khung x của ô trên ảnh trang;
* **ảnh**: cột đầu nốt dò bằng OpenCV (:mod:`noteheads`) cho tọa độ x của từng lần đánh;
* **lời ca** (:mod:`regions`, :mod:`syllables`): âm tiết kèm tâm x, theo từng dòng lời (số lời).

Hai bước, đều là quy hoạch động đơn điệu (thứ tự trái -> phải luôn được giữ):

1. Ước lượng x của mỗi lần đánh: trong mỗi ô, ghép các cột đầu nốt với các lần đánh theo vị trí tương đối (thời điểm /
   độ dài ô so với vị trí trong khung ô). Đủ cột thì dùng đúng tọa độ cột; thiếu cột thì nội suy theo thời gian.
2. Gắn âm tiết: mỗi dòng lời của hệ ghép với dãy lần đánh của hệ, chi phí = khoảng cách ngang (đơn vị khoảng dòng kẻ);
   lần đánh không có lời là bình thường (melisma, dấu nối), âm tiết không ghép được thì bị bỏ và báo cần kiểm tra.

Độ tin cậy mỗi âm tiết (0..1) giảm theo khoảng cách tới nốt, theo việc ô có đủ cột đầu nốt hay không, và theo độ tin
cậy OCR; âm tiết dưới ngưỡng được liệt kê để người dùng kiểm tra (không âm thầm xuất sai).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional

from app.omr.lyrics.syllables import Syllable

SKIP_SYLLABLE_COST = 3.0
"""Bỏ một âm tiết tốn bằng lệch 3 khoảng dòng kẻ: âm tiết lệch xa hơn mọi nốt thì thà bỏ còn hơn gắn sai."""

_SKIP_POSITION_COST = 0.3
"""Bỏ một cột đầu nốt / một lần đánh khi ghép cột với thời điểm (vị trí tương đối trong ô)."""


@dataclass
class Attack:
    measure: int
    index: int
    """Thứ tự lần đánh trong ô, bắt đầu từ 1."""

    onset: Fraction
    x: float = 0.0
    exact: bool = False
    """x lấy đúng từ một cột đầu nốt (không phải nội suy)."""


@dataclass
class Placement:
    measure: int
    attack: int
    number: int
    syllable: Syllable
    confidence: float
    distance: float
    """Khoảng cách ngang âm tiết - nốt, đơn vị khoảng dòng kẻ."""

    def to_dict(self) -> dict:
        return {
            "measure": self.measure,
            "note": self.attack,
            "number": self.number,
            "text": self.syllable.text,
            "syllabic": self.syllable.syllabic,
            "extend": self.syllable.extend,
            "confidence": round(self.confidence, 3),
        }


@dataclass
class SystemAlignment:
    placements: list[Placement] = field(default_factory=list)
    dropped: list[tuple[int, Syllable]] = field(default_factory=list)
    """Âm tiết không gắn được: ``(số lời, âm tiết)``."""


def estimate_attack_x(
    attacks: list[tuple[Fraction, Fraction]],
    measure_length: Fraction,
    x0: float,
    x1: float,
    columns: list[float],
) -> list[tuple[float, bool]]:
    """x của từng lần đánh trong một ô ``[x0, x1)``. ``attacks``: ``(thời điểm, trường độ)`` tăng dần."""
    n = len(attacks)
    if n == 0:
        return []
    width = max(1.0, x1 - x0)
    length = float(measure_length) if measure_length else float(max(o + d for o, d in attacks))
    # Vị trí tương đối kỳ vọng: nốt đầu ô cách vạch nhịp một chút, trải đều theo thời gian
    expected = [0.08 + 0.84 * (float(o) / length if length else i / n) for i, (o, _d) in enumerate(attacks)]
    cols = sorted(c for c in columns if x0 <= c < x1)
    if len(cols) == n:
        return [(c, True) for c in cols]
    if not cols:
        return [(x0 + e * width, False) for e in expected]
    rel = [(c - x0) / width for c in cols]
    pairs = _monotone_match(expected, rel, _SKIP_POSITION_COST, _SKIP_POSITION_COST)
    out: list[Optional[float]] = [None] * n
    for i, j in pairs:
        out[i] = cols[j]
    exact = [v is not None for v in out]
    # Nội suy lần đánh không có cột theo thời gian giữa hai lần đánh đã biết
    for i in range(n):
        if out[i] is not None:
            continue
        left = next(((k, out[k]) for k in range(i - 1, -1, -1) if out[k] is not None), None)
        right = next(((k, out[k]) for k in range(i + 1, n) if out[k] is not None), None)
        if left and right:
            ratio = (expected[i] - expected[left[0]]) / max(1e-6, expected[right[0]] - expected[left[0]])
            out[i] = left[1] + ratio * (right[1] - left[1])
        else:
            out[i] = x0 + expected[i] * width
    return [(float(v), e) for v, e in zip(out, exact)]  # type: ignore[arg-type]


def align_system(
    attacks: list[Attack], lines: list[tuple[int, list[Syllable]]], interline: float
) -> SystemAlignment:
    """Gắn các dòng lời ``(số lời, âm tiết)`` của một hệ vào dãy lần đánh ``attacks`` (đã có x) của hệ đó."""
    result = SystemAlignment()
    if not attacks:
        for number, syllables in lines:
            result.dropped.extend((number, s) for s in syllables)
        return result
    il = max(1.0, interline)
    xs = [a.x for a in attacks]
    for number, syllables in lines:
        if not syllables:
            continue
        sx = [s.x for s in syllables]
        pairs = _monotone_match(sx, xs, SKIP_SYLLABLE_COST * il, 0.0, scale=il)
        matched = {i for i, _ in pairs}
        for i, j in pairs:
            attack, syllable = attacks[j], syllables[i]
            distance = abs(syllable.x - attack.x) / il
            confidence = max(0.0, 1.0 - distance / 2.5) * (1.0 if attack.exact else 0.75)
            if syllable.confidence >= 0:
                confidence *= min(1.0, 0.4 + syllable.confidence / 100.0)
            result.placements.append(
                Placement(attack.measure, attack.index, number, syllable, min(1.0, confidence), distance)
            )
        result.dropped.extend((number, s) for k, s in enumerate(syllables) if k not in matched)
    return result


def _monotone_match(
    a: list[float], b: list[float], skip_a: float, skip_b: float, scale: float = 1.0
) -> list[tuple[int, int]]:
    """Ghép đơn điệu hai dãy số thực tăng dần, chi phí ``|a_i - b_j| / scale`` mỗi cặp; bỏ phần tử tốn ``skip_*``."""
    n, m = len(a), len(b)
    inf = float("inf")
    cost = [[inf] * (m + 1) for _ in range(n + 1)]
    back: list[list[Optional[str]]] = [[None] * (m + 1) for _ in range(n + 1)]
    cost[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            here = cost[i][j]
            if here == inf:
                continue
            if i < n and j < m:
                c = here + abs(a[i] - b[j]) / scale
                if c < cost[i + 1][j + 1]:
                    cost[i + 1][j + 1], back[i + 1][j + 1] = c, "d"
            if i < n:
                c = here + skip_a / scale
                if c < cost[i + 1][j]:
                    cost[i + 1][j], back[i + 1][j] = c, "a"
            if j < m:
                c = here + skip_b / scale
                if c < cost[i][j + 1]:
                    cost[i][j + 1], back[i][j + 1] = c, "b"
    pairs: list[tuple[int, int]] = []
    i, j = n, m
    while i > 0 or j > 0:
        step = back[i][j]
        if step == "d":
            pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif step == "a":
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs
