"""Kiểm tra bản kern đã ghép có đọc được không bằng music21 (đặc tả mục 2.3, "Validate": ``KERN_PARSE_ERROR``).

``music21`` được import khi dùng để dịch vụ vẫn chạy được (chỉ bỏ qua bước kiểm tra này) khi chưa cài.
"""

from __future__ import annotations

import logging
from typing import Literal

log = logging.getLogger(__name__)

CheckStatus = Literal["ok", "error", "unavailable"]


def parse_check(path) -> tuple[CheckStatus, str]:
    """Thử đọc file kern bằng ``music21.converter``.

    Trả ``("ok", "")`` nếu đọc được, ``("error", thông_báo)`` nếu music21 không đọc được, ``("unavailable", lý_do)``
    nếu chưa cài music21.
    """
    try:
        from music21 import converter  # noqa: PLC0415
    except ImportError:
        return "unavailable", "chưa cài music21 (pip install music21)"
    try:
        score = converter.parseFile(str(path), format="humdrum")
    except Exception as exc:  # noqa: BLE001 - music21 ném nhiều loại lỗi khác nhau khi gặp kern sai
        return "error", f"{type(exc).__name__}: {exc}"
    try:
        has_notes = len(list(score.recurse().notesAndRests)) > 0
    except Exception as exc:  # noqa: BLE001
        return "error", f"{type(exc).__name__}: {exc}"
    if not has_notes:
        return "error", "đọc được nhưng không có nốt nào"
    return "ok", ""
