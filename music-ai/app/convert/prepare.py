"""Chuẩn bị MusicXML trước khi xuất file bằng MuseScore (đặc tả mục 5.2, bước PREPARE).

Một lần gọi có thể làm các việc sau, theo đúng thứ tự này:

1. dịch giọng ``transpose`` nửa cung (music21, đổi cả khóa nhạc ``<key>``);
2. nhân mọi tempo với ``tempo_percent / 100`` (``<sound tempo>`` và ``<per-minute>``);
3. giữ lại một tay (``hands`` = RIGHT/LEFT): các nốt của khuông còn lại đổi thành dấu lặng cùng trường độ, giữ nguyên
   ô nhịp. Chỉ áp dụng cho part có đúng 2 khuông;
4. bỏ hợp âm ``<harmony>`` (``strip_harmony``), đặt hoặc ẩn tiêu đề/tác giả (dùng cho xuất PDF).

Chỉ bước 1 dùng music21; các bước còn lại dùng ``xml.etree`` của thư viện chuẩn nên kiểm thử được khi thiếu music21.
File đầu vào là MusicXML đã lưu trong storage (do hệ thống tự sinh hoặc đã qua ``/convert/normalize``).
"""

from __future__ import annotations

import copy
import os
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.convert.errors import ConversionError
from app.convert.musicxml import XML_HEADER
from app.convert.score_xml import child_text

HANDS = ("BOTH", "RIGHT", "LEFT")

# MuseScore dùng tempo mặc định này khi MusicXML không ghi tempo nào
MUSESCORE_DEFAULT_TEMPO = 120

_AFTER_WORK = {"movement-number", "movement-title", "identification", "defaults", "credit", "part-list", "part"}
_AFTER_MOVEMENT_TITLE = {"identification", "defaults", "credit", "part-list", "part"}
_AFTER_IDENTIFICATION = {"defaults", "credit", "part-list", "part"}


@dataclass
class PrepareResult:
    """Kết quả chuẩn bị; ``warnings`` là các lưu ý không làm hỏng file (hiện chưa dùng, để dành cho Java ghi vào task)."""

    out_path: Path
    warnings: list[str] = field(default_factory=list)


def prepare_musicxml(
    in_path: Path,
    out_path: Path,
    transpose: int = 0,
    tempo_percent: int = 100,
    hands: str = "BOTH",
    title: Optional[str] = None,
    composer: Optional[str] = None,
    show_title: bool = True,
    strip_harmony: bool = False,
) -> PrepareResult:
    """Đọc ``in_path``, áp dụng các biến đổi rồi ghi ``out_path``. Ném :class:`ConversionError` nếu không làm được."""
    if hands not in HANDS:
        raise ConversionError(f"Giá trị hands không hợp lệ: {hands!r}")
    if not -12 <= transpose <= 12:
        raise ConversionError("transpose phải từ -12 đến 12")
    if not 20 <= tempo_percent <= 200:
        raise ConversionError("tempoPercent phải từ 20 đến 200")

    try:
        data = in_path.read_bytes()
    except OSError as exc:
        raise ConversionError(f"Không đọc được file MusicXML: {exc}") from exc

    if transpose != 0:
        data = _transpose_with_music21(in_path, transpose, out_path.parent)

    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ConversionError(f"MusicXML không đọc được: {exc}") from exc
    if root.tag != "score-partwise" or root.find("part") is None:
        raise ConversionError("MusicXML phải là score-partwise và có ít nhất một <part>")

    if tempo_percent != 100:
        scale_tempo(root, tempo_percent)
    if hands != "BOTH":
        keep_one_hand(root, hands)
    if strip_harmony:
        _remove_all(root, "harmony")
    apply_titles(root, title, composer, show_title)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(XML_HEADER + ET.tostring(root, encoding="unicode"), encoding="utf-8")
    return PrepareResult(out_path=out_path)


# ---------------------------------------------------------------------------------------------------- transpose


def _transpose_with_music21(in_path: Path, semitones: int, tmp_dir: Path) -> bytes:
    """Dịch giọng bằng music21 rồi trả bytes MusicXML mới (music21 tự đổi ``<key>`` và cách viết dấu hóa)."""
    try:
        from music21 import converter  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - phụ thuộc môi trường
        raise ConversionError("Chưa cài music21 nên không dịch giọng được") from exc

    tmp_dir.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(suffix=".musicxml", dir=tmp_dir)
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        parsed = converter.parse(str(in_path))
        moved = parsed.transpose(semitones)
        moved.write("musicxml", fp=str(tmp_path))
        return tmp_path.read_bytes()
    except ConversionError:
        raise
    except Exception as exc:  # noqa: BLE001 - music21 ném nhiều loại lỗi khác nhau
        raise ConversionError(f"Không dịch giọng được: {exc}") from exc
    finally:
        tmp_path.unlink(missing_ok=True)


# ------------------------------------------------------------------------------------------------------ tempo


def _format_tempo(value: float) -> str:
    return f"{max(1.0, value):.2f}".rstrip("0").rstrip(".")


def scale_tempo(root: ET.Element, percent: int) -> None:
    """Nhân mọi tempo với ``percent / 100``. Không có tempo nào thì thêm một tempo theo mặc định của MuseScore."""
    factor = percent / 100
    found = False
    for sound in root.iter("sound"):
        raw = sound.get("tempo")
        if raw is None:
            continue
        try:
            sound.set("tempo", _format_tempo(float(raw) * factor))
            found = True
        except ValueError:
            continue
    for per_minute in root.iter("per-minute"):
        try:
            per_minute.text = _format_tempo(float((per_minute.text or "").strip()) * factor)
            found = True
        except ValueError:
            continue
    if found:
        return

    first_part = root.find("part")
    first_measure = first_part.find("measure") if first_part is not None else None
    if first_measure is None:
        return
    tempo = _format_tempo(MUSESCORE_DEFAULT_TEMPO * factor)
    direction = ET.Element("direction", {"placement": "above"})
    direction_type = ET.SubElement(direction, "direction-type")
    metronome = ET.SubElement(direction_type, "metronome")
    ET.SubElement(metronome, "beat-unit").text = "quarter"
    ET.SubElement(metronome, "per-minute").text = tempo
    ET.SubElement(direction, "sound", {"tempo": tempo})
    index = 0
    for i, child in enumerate(list(first_measure)):
        if child.tag == "attributes":
            index = i + 1
            break
    first_measure.insert(index, direction)


# ------------------------------------------------------------------------------------------------------ hands


def _staves_of(part: ET.Element) -> int:
    for measure in part.findall("measure"):
        staves = measure.find("attributes/staves")
        if staves is not None and staves.text and staves.text.strip().isdigit():
            return int(staves.text.strip())
    return 1


def keep_one_hand(root: ET.Element, hands: str) -> None:
    """RIGHT giữ khuông 1, LEFT giữ khuông 2 của part 2 khuông; nốt khuông còn lại thành dấu lặng cùng trường độ."""
    keep = "1" if hands == "RIGHT" else "2"
    targets = [part for part in root.findall("part") if _staves_of(part) == 2]
    if not targets:
        raise ConversionError("Bản nhạc không có part 2 khuông nên không chọn tay được")
    for part in targets:
        for measure in part.findall("measure"):
            for note in list(measure.findall("note")):
                if (child_text(note, "staff") or "1") == keep:
                    continue
                _silence(measure, note)


def _silence(measure: ET.Element, note: ET.Element) -> None:
    """Đổi một nốt thành dấu lặng. Nốt thuộc hợp âm (``<chord/>``) và nốt trang trí (không có trường độ) bị bỏ hẳn."""
    if note.find("rest") is not None:
        return
    if note.find("chord") is not None or note.find("grace") is not None or note.find("duration") is None:
        measure.remove(note)
        return
    silent = ET.Element("note")
    ET.SubElement(silent, "rest")
    # Thứ tự phần tử con của <note> theo lược đồ MusicXML
    for tag in ("duration", "voice", "type", "dot", "time-modification", "staff"):
        for child in note.findall(tag):
            silent.append(copy.deepcopy(child))
    index = list(measure).index(note)
    measure.remove(note)
    measure.insert(index, silent)


# ------------------------------------------------------------------------------------------- harmony, titles


def _remove_all(root: ET.Element, tag: str) -> None:
    for parent in list(root.iter()):
        for child in list(parent):
            if child.tag == tag:
                parent.remove(child)


def _insert_before(root: ET.Element, element: ET.Element, successors: set[str]) -> None:
    for index, child in enumerate(list(root)):
        if child.tag in successors:
            root.insert(index, element)
            return
    root.append(element)


def apply_titles(root: ET.Element, title: Optional[str], composer: Optional[str], show_title: bool) -> None:
    """``show_title`` false: bỏ tiêu đề và tác giả. Ngược lại: ghi đè tiêu đề/tác giả nếu được truyền vào.

    MuseScore 3 dựng khung tiêu đề từ ``<credit>`` nếu có, nên khi đặt tiêu đề mới phải bỏ ``<credit>`` cũ để khỏi
    hiện tiêu đề lẫn; khi đó nó lấy ``<movement-title>`` (hoặc ``<work-title>``) làm tiêu đề.
    """
    if not show_title:
        _remove_all(root, "credit")
        _remove_all(root, "work")
        _remove_all(root, "movement-title")
        identification = root.find("identification")
        if identification is not None:
            for creator in identification.findall("creator"):
                identification.remove(creator)
        return

    if title is not None:
        _remove_all(root, "credit")
        _remove_all(root, "work")
        _remove_all(root, "movement-title")
        work = ET.Element("work")
        ET.SubElement(work, "work-title").text = title
        _insert_before(root, work, _AFTER_WORK)
        movement = ET.Element("movement-title")
        movement.text = title
        _insert_before(root, movement, _AFTER_MOVEMENT_TITLE)

    if composer is not None:
        _remove_all(root, "credit")
        identification = root.find("identification")
        if identification is None:
            identification = ET.Element("identification")
            _insert_before(root, identification, _AFTER_IDENTIFICATION)
        for creator in identification.findall("creator"):
            if creator.get("type") == "composer":
                identification.remove(creator)
        creator = ET.Element("creator", {"type": "composer"})
        creator.text = composer
        identification.insert(0, creator)
