"""kern -> MusicXML bằng music21 thật. Tự bỏ qua khi chưa cài music21 (cloud/CI); hãy chạy trên máy đã cài đủ gói."""

import pytest

pytest.importorskip("music21")

import xml.etree.ElementTree as ET  # noqa: E402

from app.convert.kern import kern_file_to_musicxml_file  # noqa: E402
from app.convert.midi import musicxml_file_to_midi_file  # noqa: E402
from app.convert.score_xml import parse_part_events  # noqa: E402
from app.omr import merge  # noqa: E402
from tests.kern_samples import PAGE_1, PAGE_2_BARE, kern  # noqa: E402


@pytest.fixture()
def merged_kern(tmp_path):
    p1, _ = merge.clean_page(1, PAGE_1)
    p2, _ = merge.clean_page(2, PAGE_2_BARE)
    path = tmp_path / "merged.krn"
    path.write_text(merge.merge_pages([p1, p2]).text, encoding="utf-8")
    return path


def test_kern_to_normalized_musicxml(merged_kern, tmp_path):
    out = tmp_path / "musicxml" / "v1.musicxml"
    result = kern_file_to_musicxml_file(merged_kern, out, 96)

    root = ET.fromstring(out.read_bytes())
    assert len(root.findall("part")) == 1
    assert root.find("part-list/score-part/part-name").text == "Piano"
    assert (result.staff_count, result.key_signature, result.time_signature, result.tempo_bpm) == (2, "G", "3/4", 96)
    assert result.measure_count >= 3
    assert root.find("part/measure[1]//sound").get("tempo") == "96"
    assert [m.get("number") for m in root.findall("part/measure")][:3] == ["1", "2", "3"]

    # Staff 1 phải là tay phải (spine phải của kern: 4g = G4 = 67); staff 2 là tay trái (4G = G3 = 55)
    events, _ = parse_part_events(root.find("part"))
    assert 67 in {e.midi for e in events if e.staff == 1}
    assert 55 in {e.midi for e in events if e.staff == 2}
    assert not {e.midi for e in events if e.staff == 1} & {55}


def test_kern_to_midi_chain(merged_kern, tmp_path):
    xml = tmp_path / "v1.musicxml"
    kern_file_to_musicxml_file(merged_kern, xml, None)
    stats = musicxml_file_to_midi_file(xml, tmp_path / "v1.mid", 96)
    assert stats.tracks == 2 and stats.notes >= 10


def test_kern_with_voice_code_exports_voice_and_piano_parts(tmp_path):
    """Kern ghép có ``*Ivox``/``*Ipiano`` (bước MERGE thêm theo bố cục) -> MusicXML 2 part bằng music21 thật."""
    from tests.kern_samples import SYSTEM_3

    page, _ = merge.clean_page(1, SYSTEM_3)
    merged = merge.annotate_roles(merge.merge_pages([page]), ["SINGLE", "PIANO", "PIANO"])
    kern_path = tmp_path / "merged.krn"
    kern_path.write_text(merged.text, encoding="utf-8")
    result = kern_file_to_musicxml_file(kern_path, tmp_path / "v1.musicxml", 90)
    assert result.parts == ["Giọng hát", "Piano"] and result.staff_count == 3
    root = ET.parse(tmp_path / "v1.musicxml").getroot()
    voice, piano = root.findall("part")
    assert [n.findtext("pitch/step") for n in voice.iter("note")] == ["B", "C", "D"]  # khuông giọng = cột phải
    assert piano.findtext("measure/attributes/staves") == "2"
    stats = musicxml_file_to_midi_file(tmp_path / "v1.musicxml", tmp_path / "v1.mid", 90)
    assert stats.tracks == 3


def test_kern_slurs_reach_musicxml(tmp_path):
    # music21 tự nó bỏ qua dấu luyến của kern; bản xuất phải còn đủ, kể cả luyến trong bè tách và luyến lồng nhau
    text = kern(
        "**kern|**kern",
        "*clefF4|*clefG2",
        "*M2/4|*M2/4",
        "=1|=1",
        "4C|(8e",
        ".|8f)",
        "*^|*",
        "8F(|4F|((8g",
        "8G)|.|8a)",
        "*v|*v|*",
        "=2|=2",
        "2C|2b)",
        "==|==",
        "*-|*-",
    )
    page, _ = merge.clean_page(1, text)
    source = tmp_path / "merged.krn"
    source.write_text(merge.merge_pages([page]).text, encoding="utf-8")
    out = tmp_path / "v1.musicxml"
    kern_file_to_musicxml_file(source, out, 60)
    root = ET.fromstring(out.read_bytes())
    slurs = []
    for note in root.iter("note"):
        for slur in note.iter("slur"):
            pitch = note.find("pitch")
            slurs.append((pitch.find("step").text + pitch.find("octave").text, note.find("staff").text, slur.get("type")))
    assert ("E4", "1", "start") in slurs and ("F4", "1", "stop") in slurs
    assert ("F3", "2", "start") in slurs and ("G3", "2", "stop") in slurs
    assert ("G4", "1", "start") in slurs and ("A4", "1", "stop") in slurs and ("B4", "1", "stop") in slurs
    assert len(slurs) == 8  # 4 dấu luyến, mỗi dấu một đầu mở một đầu đóng


def _staff_events(measure, staff: str) -> list[tuple[float, str, str]]:
    """``(phách bắt đầu, tên nốt hoặc "r", voice)`` của một staff trong một ô MusicXML (đơn vị nốt đen)."""
    divisions = 1
    out, position, last = [], 0, 0
    for element in measure:
        if element.tag == "attributes" and element.find("divisions") is not None:
            divisions = int(element.find("divisions").text)
        elif element.tag == "backup":
            position -= int(element.find("duration").text)
        elif element.tag == "forward":
            position += int(element.find("duration").text)
        elif element.tag == "note":
            start = last if element.find("chord") is not None else position
            if element.find("chord") is None:
                last = position
                position += int(element.find("duration").text)
            pitch = element.find("pitch")
            name = pitch.find("step").text + pitch.find("octave").text if pitch is not None else "r"
            if element.find("staff").text == staff:
                out.append((start / divisions, name, element.find("voice").text))
    return out


def test_voices_split_in_the_middle_of_a_measure_keep_their_beat(tmp_path):
    # Bè dưới tách đôi ở phách 3 rồi gộp lại ở phách 4: music21 ghi nốt của hai bè lên phách 1 nếu không đặt lại
    text = kern(
        "**kern|**kern",
        "*clefF4|*clefG2",
        "*M4/4|*M4/4",
        "=1|=1",
        "4E|4e",
        "4E|4e",
        "*^|*",
        "8F|4F|4f",
        "8G|.|.",
        "*v|*v|*",
        "4A|4a",
        "==|==",
        "*-|*-",
    )
    page, _ = merge.clean_page(1, text)
    source = tmp_path / "merged.krn"
    source.write_text(merge.merge_pages([page]).text, encoding="utf-8")
    out = tmp_path / "v1.musicxml"
    kern_file_to_musicxml_file(source, out, 60)
    measure = ET.fromstring(out.read_bytes()).find("part/measure")
    bass = [(beat, name) for beat, name, _voice in _staff_events(measure, "2") if name != "r"]
    assert sorted(bass) == [(0.0, "E3"), (1.0, "E3"), (2.0, "F3"), (2.0, "F3"), (2.5, "G3"), (3.0, "A3")]
    voices = {voice for _beat, _name, voice in _staff_events(measure, "2")}
    assert len(voices) == 2  # bè trái tiếp nối spine (cùng một voice), bè phải là voice riêng
