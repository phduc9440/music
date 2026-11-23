"""``/convert/prepare``: dịch giọng, tempo, chọn tay, tiêu đề, bỏ hợp âm (đặc tả mục 5.2)."""

import xml.etree.ElementTree as ET

import pytest

from app.convert.errors import ConversionError
from app.convert.musicxml import normalize_musicxml
from app.convert.prepare import prepare_musicxml
from tests.xml_samples import note, part, piano_grand_staff, score


def piano_xml(tmp_path, tempo=96):
    path = tmp_path / "in.musicxml"
    path.write_bytes(normalize_musicxml(piano_grand_staff(tempo=tempo)).xml)
    return path


def run(tmp_path, source, **kwargs):
    out = tmp_path / "out.musicxml"
    prepare_musicxml(source, out, **kwargs)
    return ET.fromstring(out.read_text(encoding="utf-8"))


def pitched_staves(root):
    return [(n.findtext("staff") or "1") for n in root.iter("note") if n.find("pitch") is not None]


def test_tempo_percent_halves_every_tempo(tmp_path):
    root = run(tmp_path, piano_xml(tmp_path, tempo=96), tempo_percent=50)
    assert [s.get("tempo") for s in root.iter("sound")] == ["48"]
    assert [p.text for p in root.iter("per-minute")] == ["48"]


def test_tempo_without_any_tempo_adds_one(tmp_path):
    source = tmp_path / "in.musicxml"
    source.write_bytes(score(part("P1", 1, ("G", 2), [[note("C", 4, 1)]])))
    root = run(tmp_path, source, tempo_percent=50)
    assert [s.get("tempo") for s in root.iter("sound")] == ["60"]


def test_hands_left_silences_the_right_hand(tmp_path):
    source = piano_xml(tmp_path)
    before = ET.fromstring(source.read_bytes())
    count_before = len(list(before.iter("note")))
    root = run(tmp_path, source, hands="LEFT")
    assert set(pitched_staves(root)) == {"2"}
    # Mỗi nốt tay phải thành một dấu lặng nên số <note> không tăng; nốt chồng (chord) thì bị bỏ
    assert len(list(root.iter("note"))) <= count_before
    # Dấu lặng giữ nguyên trường độ
    assert all(n.find("duration") is not None for n in root.iter("note") if n.find("rest") is not None)


def test_hands_right_silences_the_left_hand(tmp_path):
    root = run(tmp_path, piano_xml(tmp_path), hands="RIGHT")
    assert set(pitched_staves(root)) == {"1"}


def test_hands_on_single_staff_score_fails(tmp_path):
    source = tmp_path / "in.musicxml"
    source.write_bytes(score(part("P1", 1, ("G", 2), [[note("C", 4, 1)]])))
    with pytest.raises(ConversionError):
        prepare_musicxml(source, tmp_path / "out.musicxml", hands="LEFT")


def test_title_composer_and_hidden_title(tmp_path):
    source = piano_xml(tmp_path)
    root = run(tmp_path, source, title="Bài <thử> & ca", composer="Tác giả")
    assert root.findtext("movement-title") == "Bài <thử> & ca"
    assert root.findtext("work/work-title") == "Bài <thử> & ca"
    assert root.find("identification/creator[@type='composer']").text == "Tác giả"
    assert [c.tag for c in root][:3] == ["work", "movement-title", "identification"]

    hidden = run(tmp_path, source, title="Không hiện", show_title=False)
    assert hidden.find("movement-title") is None and hidden.find("work") is None


def test_strip_harmony(tmp_path):
    source = piano_xml(tmp_path)
    text = source.read_text(encoding="utf-8").replace(
        "<note>", "<harmony><root><root-step>C</root-step></root></harmony><note>", 1
    )
    source.write_text(text, encoding="utf-8")
    assert list(run(tmp_path, source, strip_harmony=False).iter("harmony"))
    assert not list(run(tmp_path, source, strip_harmony=True).iter("harmony"))


def test_transpose_g_major_up_two_is_a_major(tmp_path):
    pytest.importorskip("music21")
    root = run(tmp_path, piano_xml(tmp_path), transpose=2)
    assert {k.text for k in root.iter("fifths")} == {"3"}


def test_invalid_arguments_and_broken_xml(tmp_path):
    source = piano_xml(tmp_path)
    for kwargs in ({"transpose": 13}, {"tempo_percent": 10}, {"hands": "ALL"}):
        with pytest.raises(ConversionError):
            prepare_musicxml(source, tmp_path / "o.musicxml", **kwargs)
    broken = tmp_path / "broken.musicxml"
    broken.write_text("không phải xml", encoding="utf-8")
    with pytest.raises(ConversionError):
        prepare_musicxml(broken, tmp_path / "o.musicxml")
