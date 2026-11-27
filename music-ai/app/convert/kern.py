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
    ``musicxml._order_parts``). Ô nhịp thiếu hợp lệ được giữ ngắn (:func:`mark_incomplete_measures`); dấu luyến của kern
    được đưa sang MusicXML (:func:`add_kern_slurs`, music21 tự nó bỏ qua). Ném
    :class:`ConversionError` nếu thiếu music21, music21 không đọc/ghi được, hoặc MusicXML sinh ra không có ô nhịp nào.
    """
    try:
        from music21 import converter  # noqa: PLC0415
    except ImportError as exc:
        raise ConversionError("chưa cài music21 (pip install music21)") from exc
    _remember_kern_slurs()

    try:
        # Không dùng bản pickle music21 lưu sẵn: bản cũ được đọc trước khi có dấu luyến (:func:`_remember_kern_slurs`)
        score = converter.parseFile(str(kern_path), format="humdrum", forceSource=True, storePickle=False)
    except Exception as exc:  # noqa: BLE001 - music21 ném nhiều loại lỗi khi gặp kern sai
        raise ConversionError(f"music21 không đọc được kern: {type(exc).__name__}: {exc}") from exc
    align_split_voices(score)
    mark_incomplete_measures(score)
    add_kern_slurs(score)

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


_SLUR_MARK = "kernSlurs"
"""Khóa trong ``editorial`` của nốt/hợp âm music21: ``(số dấu mở luyến, số dấu đóng luyến)`` của token kern."""


def _remember_kern_slurs() -> None:
    """Cho bộ đọc Humdrum của music21 ghi lại dấu luyến ``(``/``)`` của từng token vào nốt nó tạo ra.

    music21 đọc dấu nối ``[``/``]`` nhưng bỏ qua dấu luyến (chỉ có ``pass`` trong ``hdStringToNote``), nên mọi dấu luyến
    của bản nhạc mất khi xuất MusicXML. Ở đây bọc hai hàm tạo nốt/hợp âm của ``KernSpine`` (một lần cho cả tiến trình,
    chỉ thêm thông tin, không đổi cách đọc); :func:`add_kern_slurs` dựng dấu luyến từ thông tin đó."""
    try:
        from music21.humdrum import spineParser  # noqa: PLC0415
    except ImportError:
        return
    spine = getattr(spineParser, "KernSpine", None)
    if spine is None or getattr(spine, "_kern_slurs_hooked", False):
        return
    if not hasattr(spine, "processNoteEvent") or not hasattr(spine, "processChordEvent"):
        return  # phiên bản music21 khác: giữ cách cũ (không có dấu luyến)

    def wrap(original: Any) -> Any:
        def process(self: Any, event: str) -> Any:
            made = original(self, event)
            opens, closes = event.count("("), event.count(")")
            if opens or closes:
                try:
                    made.editorial[_SLUR_MARK] = (opens, closes)
                except Exception:  # noqa: BLE001 - không ghi được thì chỉ mất dấu luyến của nốt này
                    pass
            return made

        return process

    spine.processNoteEvent = wrap(spine.processNoteEvent)
    spine.processChordEvent = wrap(spine.processChordEvent)
    spine._kern_slurs_hooked = True


def add_kern_slurs(score: Any) -> int:
    """Dựng dấu luyến music21 (``spanner.Slur``) từ dấu ``(``/``)`` của kern đã ghi trên nốt (:func:`_remember_kern_slurs`).

    Mỗi part (spine kern) ghép theo từng bè: nốt nằm thẳng trong ô và bè đầu tiên của ô tách bè là cùng một bè (bè trái
    của kern là phần tiếp nối của spine). Dấu đóng ghép với dấu mở gần nhất chưa đóng của cùng bè; dấu thừa bị bỏ. Trả số
    dấu luyến đã thêm."""
    from music21 import spanner, stream  # noqa: PLC0415

    added = 0
    for part in score.parts:
        events: list[tuple[Any, int, int, Any]] = []
        order = 0
        for measure_index, measure in enumerate(part.getElementsByClass(stream.Measure)):
            voices = list(measure.voices)
            holders = [(0, measure)] + [(k, voice) for k, voice in enumerate(voices)]
            for voice_key, holder in holders:
                for element in holder.getElementsByClass(("Note", "Chord")):
                    marks = element.editorial.get(_SLUR_MARK) if hasattr(element, "editorial") else None
                    if marks:
                        events.append(((measure_index, element.offset, order), voice_key, marks, element))
                    order += 1
        events.sort(key=lambda item: item[0][:2])
        open_by_voice: dict[int, list[Any]] = {}
        for _key, voice_key, (opens, closes), element in events:
            stack = open_by_voice.setdefault(voice_key, [])
            for _ in range(closes):
                if stack:
                    part.insert(0, spanner.Slur(stack.pop(), element))
                    added += 1
            stack.extend([element] * opens)
    return added


def align_split_voices(score: Any) -> int:
    """Đặt lại các bè của ô có spine tách đôi giữa ô (``*^`` sau vài nốt) cho MusicXML đọc đúng thời điểm.

    music21 dựng mỗi spine con thành một ``Voice`` đặt *giữa* ô (offset bằng chỗ tách), còn nốt trước chỗ tách và sau
    chỗ gộp nằm thẳng trong ô. Khi ghi MusicXML, nốt của ``Voice`` lại được tính từ đầu ô: nốt bè bị dời lên phách 1, ô
    vừa sai vừa dài quá số chỉ nhịp (trình sửa tô đỏ, phát lệch). Theo kern, spine con bên trái là phần tiếp nối của
    spine: ở đây gom nốt thẳng trong ô và bè đầu thành bè 1, các bè sau giữ nguyên, mọi bè đặt từ đầu ô với nốt ở đúng
    thời điểm (chỗ trống được music21 lấp bằng dấu lặng ẩn khi ghi). Ô có nốt chồng lên nhau giữa hai phần thì để nguyên.
    Trả số ô đã sửa."""
    from music21 import note, stream  # noqa: PLC0415

    fixed = 0
    for part in score.parts:
        for measure in part.getElementsByClass(stream.Measure):
            voices = list(measure.voices)
            if not voices:
                continue
            direct = list(measure.getElementsByClass(note.GeneralNote))
            starts = [voice.getOffsetBySite(measure) for voice in voices]
            if not direct and not any(starts):
                continue
            moved = [[(start + element.offset, element) for element in voice.notesAndRests] for voice, start in zip(voices, starts)]
            first = [(element.offset, element) for element in direct] + moved[0]
            spans = sorted((at, at + element.quarterLength) for at, element in first)
            if any(later[0] < earlier[1] for earlier, later in zip(spans, spans[1:])):
                continue  # nốt thẳng trong ô chồng lên bè đầu: không đoán
            for voice in voices:
                measure.remove(voice)
            for element in direct:
                measure.remove(element)
            for number, items in enumerate([first] + moved[1:], start=1):
                voice = stream.Voice(id=str(number))
                for at, element in items:
                    voice.insert(at, element)
                measure.insert(0, voice)
            fixed += 1
    return fixed
