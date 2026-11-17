"""Tách dòng lời ca (từ OCR) thành âm tiết gắn được vào nốt, giữ quan hệ gạch nối và dấu kéo dài (melisma).

* Tiếng Việt: mỗi âm tiết viết rời nên mỗi từ OCR là một âm tiết (``single``).
* Gạch nối giữa âm tiết của một từ (``Đa - vit``, ``ho-ly``, ``Al - le - lu - ia``): âm tiết đầu ``begin``, giữa
  ``middle``, cuối ``end`` (đúng ``<syllabic>`` của MusicXML). Gạch nối đứng riêng hoặc dính trong từ đều được hiểu.
* Dấu kéo dài ``___`` (một âm tiết hát qua nhiều nốt): đánh dấu ``extend`` cho âm tiết đứng trước.
* Dấu câu đứng riêng (``,`` ``.``) gộp vào âm tiết trước.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from app.omr.lyrics.ocr import OcrWord

SINGLE, BEGIN, MIDDLE, END = "single", "begin", "middle", "end"

_HYPHENS = {"-", "–", "—", "‐", "‑", "−"}
_EXTENDER_RE = re.compile(r"^[_‗﹍﹎]{1,}$|^_{2,}.*$")
_PUNCT_ONLY_RE = re.compile(r"^[^\w]+$", re.UNICODE)


@dataclass
class Syllable:
    text: str
    x: float
    """Tâm ngang (tọa độ ảnh trang)."""

    left: float
    right: float
    syllabic: str = SINGLE
    extend: bool = False
    confidence: float = -1.0


def split_line(words: list[OcrWord]) -> list[Syllable]:
    """Âm tiết của một dòng lời ca (từ trái sang phải)."""
    syllables: list[Syllable] = []
    join_next = False  # gặp gạch nối đứng riêng: âm tiết kế tiếp nối với âm tiết trước
    for word in sorted(words, key=lambda w: w.left):
        text = word.text.strip()
        if not text:
            continue
        if text in _HYPHENS or re.fullmatch(r"[-–—‐‑−]{1,3}", text):
            if syllables:
                join_next = True
            continue
        if _EXTENDER_RE.match(text):
            if syllables:
                syllables[-1].extend = True
            continue
        if _PUNCT_ONLY_RE.match(text):
            if syllables:
                syllables[-1].text += text
            continue
        parts = _split_hyphenated(word)
        for position, part in enumerate(parts):
            if (position == 0 and join_next and syllables) or position > 0:
                _link(syllables[-1], part)
            syllables.append(part)
        join_next = text[-1] in _HYPHENS and len(text) > 1
        if join_next:
            syllables[-1].text = syllables[-1].text.rstrip("".join(_HYPHENS)) or syllables[-1].text
    return syllables


def _link(previous: Syllable, current: Syllable) -> None:
    previous.syllabic = MIDDLE if previous.syllabic in (MIDDLE, END) else BEGIN
    current.syllabic = END


def _split_hyphenated(word: OcrWord) -> list[Syllable]:
    """``Da-vit`` -> 2 âm tiết, vị trí chia theo tỉ lệ số ký tự trong khung từ."""
    text = word.text.strip()
    core = text.strip("".join(_HYPHENS))
    pieces = [p for p in re.split(r"[-–—‐‑−]+", core) if p] if core else [text]
    if len(pieces) <= 1:
        return [
            Syllable(
                text=core or text,
                x=word.center_x,
                left=word.left,
                right=word.right,
                confidence=word.confidence,
            )
        ]
    total = sum(len(p) for p in pieces) + (len(pieces) - 1)
    out: list[Syllable] = []
    cursor = 0
    for piece in pieces:
        start = word.left + word.width * cursor / total
        end = word.left + word.width * (cursor + len(piece)) / total
        out.append(Syllable(text=piece, x=(start + end) / 2, left=start, right=end, confidence=word.confidence))
        cursor += len(piece) + 1
    for a, b in zip(out, out[1:]):
        _link(a, b)
    return out


def finalize(syllables: list[Syllable]) -> list[Syllable]:
    """Sửa chuỗi ``syllabic`` cho nhất quán (``begin`` ... ``middle`` ... ``end``)."""
    for i, s in enumerate(syllables):
        prev_open = i > 0 and syllables[i - 1].syllabic in (BEGIN, MIDDLE)
        nxt: Optional[Syllable] = syllables[i + 1] if i + 1 < len(syllables) else None
        next_closes = nxt is not None and nxt.syllabic in (MIDDLE, END)
        if prev_open and next_closes:
            s.syllabic = MIDDLE
        elif prev_open:
            s.syllabic = END
        elif next_closes:
            s.syllabic = BEGIN
        else:
            s.syllabic = SINGLE
    return syllables
