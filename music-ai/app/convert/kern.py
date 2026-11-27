"""kern -> MusicXML (đặc tả mục 2.4): music21 đọc kern, sau đó :mod:`app.convert.musicxml` chuẩn hóa.

``music21`` được import khi dùng để dịch vụ vẫn chạy được (chỉ bước xuất báo lỗi) khi chưa cài đặt.
"""

from __future__ import annotations

import logging
import os
import tempfile
from fractions import Fraction
from pathlib import Path
from typing import Any, Optional

from app.convert import incomplete_measures
from app.convert.errors import ConversionError
from app.convert.musicxml import NormalizeResult, normalize_musicxml

log = logging.getLogger(__name__)


def kern_file_to_musicxml_file(
    kern_path: Path,
    out_path: Path,
    tempo_bpm: Optional[int],
    title: Optional[str] = None,
    composer: Optional[str] = None,
) -> NormalizeResult:
    """Đọc ``kern_path`` bằng music21, chuẩn hóa rồi ghi ``out_path``. Trả kết quả chuẩn hóa (metadata + cảnh báo).

    Thứ tự part music21 trả về không được dùng: staff trên/dưới được xác định lại từ khóa nhạc và cao độ (xem
    ``musicxml._order_parts``). Ô nhịp thiếu hợp lệ được giữ ngắn (:func:`mark_incomplete_measures`). Ném
    :class:`ConversionError` nếu thiếu music21, music21 không đọc/ghi được, hoặc MusicXML sinh ra không có ô nhịp nào.
    """
    try:
        from music21 import converter  # noqa: PLC0415
    except ImportError as exc:
        raise ConversionError("chưa cài music21 (pip install music21)") from exc

    try:
        score = converter.parseFile(str(kern_path), format="humdrum")
    except Exception as exc:  # noqa: BLE001 - music21 ném nhiều loại lỗi khi gặp kern sai
        raise ConversionError(f"music21 không đọc được kern: {type(exc).__name__}: {exc}") from exc
    mark_incomplete_measures(score)

    with tempfile.TemporaryDirectory(prefix="music-ai-") as workdir:
        raw_path = Path(workdir) / "raw.musicxml"
        try:
            written = score.write("musicxml", fp=str(raw_path))
            raw = Path(written).read_bytes()
        except Exception as exc:  # noqa: BLE001
            raise ConversionError(f"music21 không ghi được MusicXML: {type(exc).__name__}: {exc}") from exc

    result = normalize_musicxml(raw, tempo_bpm, title=title, composer=composer)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    temp = out_path.with_name(out_path.name + ".tmp")
    temp.write_bytes(result.xml)
    os.replace(temp, out_path)
    log.info("Đã ghi %s: %s ô nhịp, %s staff", out_path.name, result.measure_count, result.staff_count)
    return result


def _quarters(value: Any) -> Fraction:
    """Độ dài music21 (float hoặc Fraction, đơn vị nốt đen) thành Fraction chính xác."""
    return value if isinstance(value, Fraction) else Fraction(value).limit_denominator(1 << 16)


def _repeat(barline: Any, direction: str) -> bool:
    """Vạch nhịp music21 là dấu lặp theo hướng ``direction`` (``start`` = ``|:``, ``end`` = ``:|``)."""
    return barline is not None and getattr(barline, "direction", None) == direction


def mark_incomplete_measures(score: Any) -> dict[int, str]:
    """Giữ nguyên độ dài các ô nhịp thiếu hợp lệ (:mod:`app.convert.incomplete_measures`) khi ghi MusicXML.

    Mặc định music21 lấp ô ngắn hơn số chỉ nhịp bằng dấu lặng ẩn cho đủ ô. Với ô lấy đà nó đã biết (``paddingLeft``),
    nhưng hai phần của ô bị vạch nhịp chia đôi (cuối phiên khúc + đầu điệp khúc) hay cặp ô bù nhau qua dấu lặp thì mỗi
    phần bị lấp thêm, nên khi phát có một khoảng lặng giữa hai đoạn. Ở đây đặt ``paddingLeft``/``paddingRight`` cho các ô đó (music21 không lấp nữa) và
    ``showNumber`` = NEVER để MusicXML ghi ``implicit="yes"``: trình sửa của web hiểu đó là ô ngắn hợp lệ, không tô đỏ.

    Chỉ áp dụng khi mọi part có cùng số ô; độ dài một ô là độ dài chung của các part có nội dung (part lệch nhau thì ô đó
    không được coi là ô thiếu hợp lệ). Trả ``{chỉ số ô (từ 0): vai trò}`` đã áp dụng.
    """
    from music21 import stream  # noqa: PLC0415
    from music21.common.numberTools import opFrac  # noqa: PLC0415

    parts = list(score.parts)
    measures = [list(part.getElementsByClass(stream.Measure)) for part in parts]
    if not measures or len({len(m) for m in measures}) != 1 or not measures[0]:
        return {}
    lengths: list[Optional[Fraction]] = []
    meters: list[Optional[Fraction]] = []
    repeats: list[tuple[bool, bool]] = []
    for index in range(len(measures[0])):
        values = {_quarters(m[index].duration.quarterLength) for m in measures}
        values.discard(Fraction(0))
        lengths.append(values.pop() if len(values) == 1 else None)
        try:
            meters.append(_quarters(measures[0][index].barDuration.quarterLength))
        except Exception:  # noqa: BLE001 - ô không tìm được số chỉ nhịp
            meters.append(None)
        repeats.append((_repeat(measures[0][index].leftBarline, "start"), _repeat(measures[0][index].rightBarline, "end")))
    roles = incomplete_measures.classify(lengths, meters, repeats)
    for index, role in roles.items():
        gap = meters[index] - lengths[index]  # type: ignore[operator]
        for part_measures in measures:
            measure = part_measures[index]
            if role in incomplete_measures.MISSING_AT_START:
                measure.paddingLeft, measure.paddingRight = opFrac(gap), 0.0  # phần thiếu nằm ở đầu ô
            else:
                measure.paddingLeft, measure.paddingRight = 0.0, opFrac(gap)  # phần thiếu nằm ở cuối ô
            measure.showNumber = stream.enums.ShowNumber.NEVER
    return roles
