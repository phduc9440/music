"""kern -> MusicXML (đặc tả mục 2.4): music21 đọc kern, sau đó :mod:`app.convert.musicxml` chuẩn hóa.

``music21`` được import khi dùng để dịch vụ vẫn chạy được (chỉ bước xuất báo lỗi) khi chưa cài đặt.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

from app.convert.errors import ConversionError
from app.convert.musicxml import NormalizeResult, normalize_musicxml

log = logging.getLogger(__name__)


def kern_file_to_musicxml_file(kern_path: Path, out_path: Path, tempo_bpm: Optional[int]) -> NormalizeResult:
    """Đọc ``kern_path`` bằng music21, chuẩn hóa rồi ghi ``out_path``. Trả kết quả chuẩn hóa (metadata + cảnh báo).

    Thứ tự part music21 trả về không được dùng: staff trên/dưới được xác định lại từ khóa nhạc và cao độ (xem
    ``musicxml._order_parts``). Ném :class:`ConversionError` nếu thiếu music21, music21 không đọc/ghi được, hoặc MusicXML
    sinh ra không có ô nhịp nào.
    """
    try:
        from music21 import converter  # noqa: PLC0415
    except ImportError as exc:
        raise ConversionError("chưa cài music21 (pip install music21)") from exc

    try:
        score = converter.parseFile(str(kern_path), format="humdrum")
    except Exception as exc:  # noqa: BLE001 - music21 ném nhiều loại lỗi khi gặp kern sai
        raise ConversionError(f"music21 không đọc được kern: {type(exc).__name__}: {exc}") from exc

    with tempfile.TemporaryDirectory(prefix="music-ai-") as workdir:
        raw_path = Path(workdir) / "raw.musicxml"
        try:
            written = score.write("musicxml", fp=str(raw_path))
            raw = Path(written).read_bytes()
        except Exception as exc:  # noqa: BLE001
            raise ConversionError(f"music21 không ghi được MusicXML: {type(exc).__name__}: {exc}") from exc

    result = normalize_musicxml(raw, tempo_bpm)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    temp = out_path.with_name(out_path.name + ".tmp")
    temp.write_bytes(result.xml)
    os.replace(temp, out_path)
    log.info("Đã ghi %s: %s ô nhịp, %s staff", out_path.name, result.measure_count, result.staff_count)
    return result
