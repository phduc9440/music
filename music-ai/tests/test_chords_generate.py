"""Sinh và ghi hợp âm vào MusicXML (``app/chords/writer.py``, ``app/chords/generate.py``)."""

import copy
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from app.chords import ChordError
from app.chords.generate import generate_file
from app.chords.hmm import load_model
from app.chords.melody import load_melody
from app.chords.theory import VOCAB, Key
from app.chords.writer import write_harmonies
from tests.chord_samples import backup, harm, n, r, single

TINY = Path(__file__).parent / "fixtures" / "chords_tiny_model.json"


@pytest.fixture()
def model():
    return load_model("POP", TINY)


def quarters(*notes: tuple[str, int]) -> str:
    return "".join(n(step, octave, 1) for step, octave in notes)


C_MAJOR_TUNE = [
    quarters(("C", 4), ("E", 4), ("G", 4), ("E", 4)),
    quarters(("F", 4), ("A", 4), ("C", 5), ("A", 4)),
    quarters(("G", 4), ("B", 4), ("D", 5), ("B", 4)),
    quarters(("C", 5), ("G", 4), ("E", 4), ("C", 4)),
]


def run(tmp_path, data: bytes, model) -> tuple[ET.Element, object, bytes]:
    src, out = tmp_path / "in.musicxml", tmp_path / "out.musicxml"
    src.write_bytes(data)
    result = generate_file(src, out, "POP", model=model)
    raw = out.read_bytes()
    return ET.fromstring(raw), result, raw


def measures(root: ET.Element) -> list[ET.Element]:
    return root.findall("part/measure")


def strip_harmony(root: ET.Element) -> ET.Element:
    clone = copy.deepcopy(root)
    for measure in clone.iter("measure"):
        for h in measure.findall("harmony"):
            measure.remove(h)
    return clone


def test_generate_writes_harmony_on_melody_staff(tmp_path, model):
    data = single([m + backup(4) + n("C", 3, 4, staff=2) for m in C_MAJOR_TUNE], staves=2)
    root, result, _ = run(tmp_path, data, model)

    assert result.key == "C major"
    assert result.filled >= 4
    assert result.filled == len(root.findall(".//harmony"))
    for measure in measures(root):
        harmonies = measure.findall("harmony")
        assert harmonies, measure.get("number")
        assert all(h.findtext("root/root-step") for h in harmonies)
        assert all(h.findtext("staff") == "1" for h in harmonies)


def test_generate_picks_obvious_chords(tmp_path, model):
    root, _, _ = run(tmp_path, single(C_MAJOR_TUNE), model)
    firsts = [m.find("harmony") for m in measures(root)]
    assert [h.findtext("root/root-step") for h in firsts] == ["C", "F", "G", "C"]
    assert firsts[0].find("kind").get("text") == ""


def test_generate_merges_equal_half_steps(tmp_path, model):
    root, _, _ = run(tmp_path, single([quarters(("C", 4), ("E", 4), ("G", 4), ("C", 5))]), model)
    assert len(measures(root)[0].findall("harmony")) == 1


def _harmony_before_each_note(measure: ET.Element) -> list[int]:
    """Số <harmony> đứng liền trước mỗi <note> (editor chỉ giữ một hợp âm cho mỗi nốt)."""
    counts, pending = [], 0
    for child in measure:
        if child.tag == "harmony":
            pending += 1
        elif child.tag == "note":
            counts.append(pending)
            pending = 0
    return counts


POP = {c.label: c for c in VOCAB["POP"]["major"]}


def test_write_anchors_mid_measure_chord_on_note_sounding_before_it():
    # Đen C – trắng D – đen E (divisions 2): không nốt nào bắt đầu ở phách 3, nốt D đang vang
    src = load_melody(single([n("C", 4, 2) + n("D", 4, 4) + n("E", 4, 2)], divisions=2))
    out = ET.fromstring(write_harmonies(src, [(src.steps[0], POP["I"]), (src.steps[1], POP["IV"])], Key(0, "major", 0)))

    measure = out.find("part/measure")
    assert _harmony_before_each_note(measure) == [1, 1, 0]
    first, second = measure.findall("harmony")
    assert first.find("offset") is None
    assert second.findtext("root/root-step") == "F"
    assert second.findtext("offset") == "2"  # nốt D ở phách 2, hợp âm ở phách 3: lệch 1 phách đen = 2 divisions
    children = list(measure)
    assert children[children.index(second) + 1].findtext("pitch/step") == "D"


def test_write_uses_negative_offset_on_next_note_when_sounding_note_has_chord():
    # Trắng chấm C (phách 1–3) đã mang hợp âm đầu ô, nốt E ở phách 4: hợp âm phách 3 gắn vào E với offset âm
    src = load_melody(single([n("C", 4, 6) + n("E", 4, 2)], divisions=2))
    out = ET.fromstring(write_harmonies(src, [(src.steps[0], POP["I"]), (src.steps[1], POP["IV"])], Key(0, "major", 0)))

    measure = out.find("part/measure")
    assert _harmony_before_each_note(measure) == [1, 1]
    second = measure.findall("harmony")[1]
    assert second.findtext("offset") == "-2"


def test_write_drops_mid_measure_chord_without_free_note():
    # Nốt tròn mang hợp âm đầu ô, không còn nốt nào để gắn hợp âm nửa ô sau: bỏ, giữ một hợp âm cho cả ô
    src = load_melody(single([n("C", 4, 8)], divisions=2))
    out = ET.fromstring(write_harmonies(src, [(src.steps[0], POP["I"]), (src.steps[1], POP["IV"])], Key(0, "major", 0)))

    assert len(out.find("part/measure").findall("harmony")) == 1


def test_generate_counts_only_written_harmonies(tmp_path, model):
    # Mỗi ô một nốt tròn: dù HMM đổi hợp âm giữa ô, chỉ hợp âm thật sự ghi mới được đếm
    root, result, _ = run(tmp_path, single([n(s, 4, 4) for s in "CFGC"]), model)
    assert result.filled == len(root.findall(".//harmony"))
    for measure in measures(root):
        assert max(_harmony_before_each_note(measure)) <= 1


def test_generate_keeps_xlink_attributes(tmp_path, model):
    tune = list(C_MAJOR_TUNE)
    tune[0] = '<link xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="https://example.com"/>' + tune[0]
    _, _, raw = run(tmp_path, single(tune), model)
    assert b'xlink:href="https://example.com"' in raw
    assert b"ns0" not in raw


def test_write_places_harmony_before_note_at_step_start(model):
    src = load_melody(single([quarters(("C", 4), ("D", 4), ("E", 4), ("F", 4))]))
    states = {c.label: c for c in VOCAB["POP"]["major"]}
    out = ET.fromstring(write_harmonies(src, [(src.steps[1], states["V"])], Key(0, "major", 0)))

    children = list(out.find("part/measure"))
    index = next(i for i, c in enumerate(children) if c.tag == "harmony")
    assert children[index + 1].findtext("pitch/step") == "E"
    assert children[index].find("offset") is None


def test_write_spells_bass_and_flat_roots(model):
    src = load_melody(single([n("C", 4, 4)]))
    states = {c.label: c for c in VOCAB["BALLAD"]["major"]}
    out = ET.fromstring(write_harmonies(src, [(src.steps[0], states["I/3"])], Key(0, "major", 0)))
    h = out.find(".//harmony")
    assert h.findtext("bass/bass-step") == "E"
    assert [c.tag for c in h] == ["root", "kind", "bass"]


def test_generate_keeps_existing_harmony_measures(tmp_path, model):
    tune = list(C_MAJOR_TUNE)
    tune[1] = harm("A", "minor", text="m") + tune[1]
    data = single(tune)
    root, result, _ = run(tmp_path, data, model)

    before = ET.fromstring(data).findall("part/measure")[1]
    assert ET.tostring(measures(root)[1]) == ET.tostring(before)
    assert result.kept_existing == 1


def test_generate_only_touches_harmony(tmp_path, model):
    data = single(C_MAJOR_TUNE + [n("C", 4, 2) + r(2)])
    root, _, _ = run(tmp_path, data, model)
    assert ET.tostring(strip_harmony(root)) == ET.tostring(ET.fromstring(data))


def test_generate_keeps_prolog_and_comments(tmp_path, model):
    data = single(C_MAJOR_TUNE).replace(b"<part-list>", "<!-- giữ ghi chú --><part-list>".encode())
    _, _, raw = run(tmp_path, data, model)
    assert raw.startswith(b'<?xml version="1.0" encoding="utf-8"?>')
    assert "<!-- giữ ghi chú -->".encode() in raw


def test_generate_is_deterministic(tmp_path, model):
    _, _, first = run(tmp_path, single(C_MAJOR_TUNE), model)
    _, _, second = run(tmp_path, single(C_MAJOR_TUNE), model)
    assert first == second


def test_written_symbols_parse_in_music21(tmp_path, model):
    from music21 import converter, harmony

    _, result, raw = run(tmp_path, single(C_MAJOR_TUNE), model)
    parsed = converter.parseData(raw.decode("utf-8"), format="musicxml")
    assert len(list(parsed.recurse().getElementsByClass(harmony.ChordSymbol))) == result.filled


def test_no_melody_raises(tmp_path, model):
    with pytest.raises(ChordError) as info:
        run(tmp_path, single([r(4), r(4)]), model)
    assert info.value.code == "NO_MELODY"


def test_all_measures_harmonized_raises(tmp_path, model):
    with pytest.raises(ChordError) as info:
        run(tmp_path, single([harm("C") + C_MAJOR_TUNE[0], harm("F") + C_MAJOR_TUNE[1]]), model)
    assert info.value.code == "ALREADY_HARMONIZED"


def test_replace_existing_regenerates_every_measure(tmp_path, model):
    # Hợp âm cũ cố tình sai (Bb, Eb): chế độ thay thế bỏ hết rồi gợi ý lại, mỗi ô còn đúng một hợp âm do AI ghi
    data = single([harm("B", alter=-1) + C_MAJOR_TUNE[0], harm("E", alter=-1) + C_MAJOR_TUNE[1]])
    src, out = tmp_path / "in.musicxml", tmp_path / "out.musicxml"
    src.write_bytes(data)
    result = generate_file(src, out, "POP", model=model, replace_existing=True)
    root = ET.fromstring(out.read_bytes())
    assert result.kept_existing == 0
    assert result.skipped == 0
    assert all(m.find("harmony") is not None for m in measures(root))
    assert not any(h.findtext("root/root-alter") == "-1" for h in root.iter("harmony"))
    assert ET.tostring(strip_harmony(root)) == ET.tostring(strip_harmony(ET.fromstring(data)))


def test_minor_tune_uses_minor_model(tmp_path, model):
    tune = [
        quarters(("A", 4), ("C", 5), ("E", 5), ("C", 5)),
        quarters(("D", 5), ("F", 5), ("A", 4), ("F", 5)),
        quarters(("E", 5), ("G", 5), ("B", 4), ("E", 5)).replace("<step>G</step>", "<step>G</step><alter>1</alter>"),
        quarters(("A", 4), ("C", 5), ("E", 5), ("A", 5)),
    ]
    root, result, _ = run(tmp_path, single(tune), model)
    assert result.key == "A minor"
    assert measures(root)[0].find("harmony").findtext("kind") == "minor"
