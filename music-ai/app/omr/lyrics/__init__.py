"""Nhánh B của pipeline: nhận diện lời ca và gắn vào nốt (tách riêng khỏi nhận diện ký hiệu nhạc).

* :mod:`.ocr`: engine OCR (Tesseract ``vie+eng``), có lớp trừu tượng để thay engine.
* :mod:`.regions`: vùng chữ giữa các hệ (dùng chung mặt nạ chữ với bước xóa chữ trước Transcoda), phân loại dòng.
* :mod:`.syllables`: âm tiết, gạch nối, dấu kéo dài.
* :mod:`.noteheads`: cột đầu nốt trên khuông giọng hát (tọa độ x các lần đánh nốt).
* :mod:`.align`: gắn âm tiết vào nốt bằng quy hoạch động đơn điệu, có độ tin cậy.
* :mod:`.musicxml_lyrics`: đọc lần đánh nốt và chèn ``<lyric>`` vào MusicXML.
* :mod:`.step`: điều phối, báo cáo ``result_data.lyrics``.
"""

from __future__ import annotations

import threading
from typing import Optional

from app.config import get_settings

_engine_cache: dict[tuple[str, str], tuple[Optional[object], Optional[str]]] = {}
_lock = threading.Lock()


def get_text_engine() -> tuple[Optional[object], Optional[str]]:
    """Engine OCR theo cấu hình (tạo một lần, vì kiểm tra Tesseract phải gọi tiến trình con)."""
    from app.omr.lyrics.ocr import create_text_engine  # noqa: PLC0415

    settings = get_settings()
    key = (settings.lyrics_ocr, settings.lyrics_lang)
    with _lock:
        if key not in _engine_cache:
            _engine_cache[key] = create_text_engine(settings.lyrics_ocr, settings.lyrics_lang)
        return _engine_cache[key]


def lyrics_ocr_status() -> dict:
    """Cho ``/health``: OCR lời ca có dùng được không."""
    settings = get_settings()
    if settings.lyrics == "off":
        return {"enabled": False, "reason": "OMR_LYRICS=off"}
    engine, reason = get_text_engine()
    if engine is None:
        return {"enabled": False, "reason": reason}
    return {"enabled": True, "engine": getattr(engine, "name", "?"), "lang": getattr(engine, "lang", None)}
