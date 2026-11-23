"""``/convert/normalize``: chuẩn hóa một file MusicXML đã có trong storage (đặc tả mục 6.2).

Dùng cho MusicXML không do music21 sinh ra: bản nhạc nhập từ file (nhánh nhập của Phân hệ khác) và MusicXML do
MuseScore sinh từ MIDI (chuyển bản nhạc nhập từ MIDI ở nhánh export-formats). Bản thân phép chuẩn hóa là
:func:`app.convert.musicxml.normalize_musicxml` (gộp nhiều part thành piano nhiều staff, đánh lại số ô nhịp, đặt tempo).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from app.convert.errors import ConversionError
from app.convert.musicxml import NormalizeResult, normalize_musicxml

log = logging.getLogger(__name__)


def normalize_musicxml_file(in_path: Path, out_path: Path, tempo_bpm: Optional[int] = None) -> NormalizeResult:
    """Đọc ``in_path``, chuẩn hóa rồi ghi ``out_path`` (ghi qua file tạm rồi đổi tên). Trả metadata và cảnh báo.

    Từ chối XML có khai báo ``<!ENTITY``: đầu vào có thể do người dùng nhập vào, mà ``xml.etree`` sẽ mở rộng entity nội
    bộ (nguy cơ "billion laughs"). MusicXML thật chỉ dùng ``<!DOCTYPE>`` công khai, không khai báo entity.
    Ném :class:`ConversionError` nếu không đọc được file, XML hỏng, không phải score-partwise hoặc không có ô nhịp.
    """
    try:
        data = in_path.read_bytes()
    except OSError as exc:
        raise ConversionError(f"Không đọc được file MusicXML: {exc}") from exc
    if b"<!ENTITY" in data:
        raise ConversionError("MusicXML có khai báo ENTITY nên không được chấp nhận")

    result = normalize_musicxml(data, tempo_bpm)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    temp = out_path.with_name(out_path.name + ".tmp")
    temp.write_bytes(result.xml)
    os.replace(temp, out_path)
    log.info("Đã chuẩn hóa %s: %s ô nhịp, %s staff", out_path.name, result.measure_count, result.staff_count)
    return result
