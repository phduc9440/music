"""Gợi ý hợp âm tự động (R3, Module AI 3): đọc giai điệu, model AutoHarmonizer lấy mẫu 3 phương án, chèn ``<harmony>``.

Xem ``doc/duc-r3-goi-y-hop-am.md``.
"""

from __future__ import annotations

from app.convert.errors import ConversionError


class ChordError(ConversionError):
    """Không sinh được hợp âm. ``code`` là mã máy đọc được (``NO_MELODY``, ``ALREADY_HARMONIZED``, ``NO_CHORDS``,
    ``TOO_LONG``, ``PARSE_ERROR``),
    Java đọc mã này từ ``detail.code`` của phản hồi 422."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
