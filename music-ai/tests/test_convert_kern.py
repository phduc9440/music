"""kern -> MusicXML bằng music21 thật. Tự bỏ qua khi chưa cài music21 (cloud/CI); hãy chạy trên máy đã cài đủ gói."""

import pytest

pytest.importorskip("music21")

import xml.etree.ElementTree as ET  # noqa: E402

from app.convert.kern import kern_file_to_musicxml_file  # noqa: E402
from app.convert.midi import musicxml_file_to_midi_file  # noqa: E402
from app.convert.score_xml import parse_part_events  # noqa: E402
from app.omr import merge  # noqa: E402
from tests.kern_samples import PAGE_1, PAGE_2_BARE  # noqa: E402


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
