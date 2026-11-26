"""Lỗi chuyển đổi dự đoán được (đầu vào hỏng, thiếu music21...)."""

from __future__ import annotations


class ConversionError(Exception):
    """Không chuyển đổi được. Thông điệp (tiếng Việt) được báo về Java dưới dạng ``EXPORT_ERROR: <thông điệp>``
    hoặc trả HTTP 422 ở các endpoint ``/convert/**``."""
