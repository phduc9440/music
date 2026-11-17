"""CER / WER cho lời ca (và mọi chuỗi văn bản), chuẩn hóa Unicode để tiếng Việt có dấu so được với nhau.

Tiếng Việt có hai cách mã hóa dấu (dựng sẵn NFC và tổ hợp NFD); OCR và file MusicXML có thể dùng cách khác nhau nên mọi
chuỗi được đưa về NFC trước khi so. :func:`strip_diacritics` bỏ dấu thanh/dấu mũ để tách lỗi "sai dấu" khỏi lỗi "sai chữ".
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Sequence

_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)


def normalize(text: str, lower: bool = False, punctuation: bool = True) -> str:
    """NFC, gộp khoảng trắng; tùy chọn chữ thường và bỏ dấu câu."""
    text = unicodedata.normalize("NFC", text)
    if not punctuation:
        text = _PUNCT_RE.sub(" ", text)
    if lower:
        text = text.lower()
    return " ".join(text.split())


def strip_diacritics(text: str) -> str:
    """Bỏ dấu tiếng Việt (``Nguyện`` -> ``Nguyen``), ``đ`` -> ``d``."""
    decomposed = unicodedata.normalize("NFD", text)
    base = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return unicodedata.normalize("NFC", base.replace("đ", "d").replace("Đ", "D"))


def edit_distance(ref: Sequence, hyp: Sequence) -> int:
    """Khoảng cách Levenshtein (chèn/xóa/thay đều tốn 1)."""
    if len(ref) < len(hyp):
        ref, hyp = hyp, ref
    previous = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, start=1):
        current = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, start=1):
            current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (r != h))
        previous = current
    return previous[-1]


@dataclass
class TextScore:
    errors: int
    total: int

    @property
    def rate(self) -> float:
        if self.total == 0:
            return 0.0 if self.errors == 0 else 1.0
        return self.errors / self.total

    def __add__(self, other: "TextScore") -> "TextScore":
        return TextScore(self.errors + other.errors, self.total + other.total)


def cer(ref: str, hyp: str, **norm) -> TextScore:
    """Character Error Rate: số lỗi ký tự / số ký tự của chuỗi đúng (tính cả khoảng trắng)."""
    r, h = normalize(ref, **norm), normalize(hyp, **norm)
    return TextScore(edit_distance(r, h), len(r))


def wer(ref: str, hyp: str, **norm) -> TextScore:
    """Word Error Rate theo từ (tiếng Việt: theo âm tiết, vì mỗi âm tiết viết cách nhau)."""
    r, h = normalize(ref, **norm).split(), normalize(hyp, **norm).split()
    return TextScore(edit_distance(r, h), len(r))
