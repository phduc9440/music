"""Gợi ý hợp âm bằng AutoHarmonizer (``app/chords/autoharmonizer``, ``app/chords/generate.py``, ``app/chords/writer.py``)."""

import copy
import xml.etree.ElementTree as ET
from fractions import Fraction
from pathlib import Path

import numpy as np
import pytest

from app.chords import ChordError
from app.chords.autoharmonizer.harmonize import build_grid, chord_table, harmony_element
from app.chords.autoharmonizer.model import load_net
from app.chords.generate import generate_file, option_path
from app.chords.melody import load_melody
from app.chords.writer import insert_harmony
from tests.chord_samples import backup, harm, n, single

REFERENCE = Path(__file__).parent / "fixtures" / "autoharmonizer_reference.npz"


def quarters(*notes: tuple[str, int]) -> str:
    return "".join(n(step, octave, 1) for step, octave in notes)


TWINKLE = [
    quarters(("C", 4), ("C", 4), ("G", 4), ("G", 4)),
    quarters(("A", 4), ("A", 4)) + n("G", 4, 2),
    quarters(("F", 4), ("F", 4), ("E", 4), ("E", 4)),
    quarters(("D", 4), ("D", 4), ("C", 4), ("C", 4)),
]


def run(tmp_path, data: bytes, **kwargs):
    src, out = tmp_path / "in.musicxml", tmp_path / "out.musicxml"
    src.write_bytes(data)
    result = generate_file(src, out, **kwargs)
    return result, [ET.fromstring(o.out_path.read_bytes()) for o in result.options]


def measures(root: ET.Element) -> list[ET.Element]:
    return root.findall("part/measure")


def strip_harmony(root: ET.Element) -> ET.Element:
    clone = copy.deepcopy(root)
    for measure in clone.iter("measure"):
        for h in measure.findall("harmony"):
            measure.remove(h)
    return clone


def chord_names(root: ET.Element) -> list[str]:
    return [h.findtext("root/root-step") + (h.find("kind").get("text") or "") for h in root.iter("harmony")]


# ------------------------------------------------------------------------------------------------ mạng


def test_numpy_network_matches_original_keras_model():
    """Xác suất của mạng dựng lại bằng numpy trùng với model Keras gốc (tính sẵn bằng TensorFlow trên cùng đầu vào)."""
    ref = np.load(REFERENCE)
    net = load_net()

    def onehot(idx, classes):
        out = np.zeros(idx.shape + (classes,), dtype=np.float32)
        np.put_along_axis(out, idx[..., None], 1.0, axis=-1)
        return out

    cond_left = np.concatenate([onehot(ref["beat_left"], 5), onehot(ref["key_left"], 16)], axis=-1)
    cond_right = np.concatenate([onehot(ref["beat_right"], 5), onehot(ref["key_right"], 16)], axis=-1)
    probs = net.head([
        net.branch("melody_left", onehot(ref["melody_left"], 128)),
        net.branch("melody_right", onehot(ref["melody_right"], 128)),
        net.branch("condition_left", cond_left),
        net.branch("condition_right", cond_right),
        net.branch("chord_left", onehot(ref["chord_left"], len(net.chord_types))),
    ])
    assert np.abs(probs - ref["keras_probs"]).max() < 1e-5
    assert (probs.argmax(-1) == ref["keras_probs"].argmax(-1)).all()


def test_chord_table_is_readable_by_editor():
    table = chord_table()
    assert len(table) == 1450 and table[0]["rest"]
    readable = [c for c in table if not c["rest"]]
    assert len(readable) > 1400
    assert all(c["root"][0] in "CDEFGAB" and c["kind"] for c in readable)


# ------------------------------------------------------------------------------------------------ lưới đầu vào


def test_grid_reads_melody_beats_and_key():
    src = load_melody(single([quarters(("C", 4), ("E", 4), ("G", 4), ("C", 5))]))
    grid = build_grid(src)
    assert len(grid.melody) == 16  # 4 phách × 4 nốt móc kép
    assert grid.melody[:4].tolist() == [60] * 4 and grid.melody[12] == 72
    assert grid.beat[:4].tolist() == [4] * 4  # mọi bước của nốt đầu ô mang độ mạnh phách 4 như music21
    assert grid.beat[8] == 2 and grid.beat[4] == 1
    assert (grid.key == 8).all()
    assert (grid.forced == -1).all()


def test_grid_locks_measures_that_already_have_chords():
    src = load_melody(single([harm("C") + TWINKLE[0], TWINKLE[1]]))
    grid = build_grid(src)
    assert (grid.forced[:16] >= 0).all() and (grid.forced[16:] == -1).all()
    assert chord_table()[grid.forced[0]]["root"] == ["C", 0]


# ------------------------------------------------------------------------------------------------ gợi ý


def test_generate_writes_three_distinct_options(tmp_path):
    result, roots = run(tmp_path, single(TWINKLE * 2), seed=7)
    assert 1 <= len(result.options) <= 3
    assert result.options[0].out_path == tmp_path / "out.musicxml"
    assert [o.out_path for o in result.options] == [option_path(tmp_path / "out.musicxml", i) for i in range(len(roots))]
    assert len({tuple(chord_names(r)) for r in roots}) == len(roots)  # các phương án khác nhau
    scores = [o.score for o in result.options]
    assert scores == sorted(scores, reverse=True)  # A hợp tai nhất
    for root, option in zip(roots, result.options):
        assert option.filled == len(root.findall(".//harmony")) > 0


def test_generate_only_adds_harmony_elements(tmp_path):
    data = single(TWINKLE)
    _, roots = run(tmp_path, data, seed=3)
    original = strip_harmony(ET.fromstring(data))
    for root in roots:
        assert ET.tostring(strip_harmony(root)) == ET.tostring(original)


def test_same_seed_reproduces_and_other_seeds_vary(tmp_path):
    data = single(TWINKLE * 2)
    first, roots_a = run(tmp_path, data, seed=11)
    again, roots_b = run(tmp_path, data, seed=11)
    assert [chord_names(r) for r in roots_a] == [chord_names(r) for r in roots_b]
    assert first.seed == again.seed == 11
    seen = {tuple(chord_names(run(tmp_path, data, seed=s)[1][0])) for s in range(6)}
    assert len(seen) > 1  # mỗi lần chạy (hạt giống khác) ra cách đệm khác


def test_random_seed_is_reported(tmp_path):
    result, _ = run(tmp_path, single(TWINKLE))
    assert 0 <= result.seed <= 0xFFFFFFFF


def test_generate_writes_on_melody_staff_of_piano_score(tmp_path):
    data = single([m + backup(4) + n("C", 3, 4, staff=2) for m in TWINKLE], staves=2)
    result, roots = run(tmp_path, data, seed=5)
    assert result.key == "C major"
    for root in roots:
        assert all(h.findtext("staff") == "1" for h in root.iter("harmony"))


def test_generate_keeps_existing_chords_and_skips_locked_measures(tmp_path):
    data = single([harm("A", "minor") + TWINKLE[0], TWINKLE[1], TWINKLE[2], TWINKLE[3]])
    result, roots = run(tmp_path, data, seed=2)
    assert result.kept_existing == 1
    for root in roots:
        first = measures(root)[0].findall("harmony")
        assert len(first) == 1 and first[0].findtext("root/root-step") == "A"


def test_all_measures_harmonized_raises_unless_replacing(tmp_path):
    data = single([harm("C") + TWINKLE[0], harm("F") + TWINKLE[1]])
    with pytest.raises(ChordError) as info:
        run(tmp_path, data, seed=1)
    assert info.value.code == "ALREADY_HARMONIZED"
    result, roots = run(tmp_path, data, seed=1, replace_existing=True)
    assert result.kept_existing == 0
    assert all(root.findall(".//harmony") for root in roots)


def test_no_melody_raises(tmp_path):
    with pytest.raises(ChordError) as info:
        run(tmp_path, single(['<note><rest/><duration>4</duration><voice>1</voice><type>whole</type></note>']))
    assert info.value.code == "NO_MELODY"


def test_rejects_unknown_style(tmp_path):
    with pytest.raises(ChordError):
        run(tmp_path, single(TWINKLE), style="ROCK")


def _share(names: list[str], suffixes: tuple[str, ...]) -> float:
    return sum(any(name.endswith(s) for s in suffixes) for name in names) / max(len(names), 1)


def test_style_changes_chord_colour(tmp_path):
    data = single(TWINKLE * 2)
    jazz, folk = [], []
    for seed in range(4):
        jazz += [c for r in run(tmp_path, data, seed=seed, style="JAZZ")[1] for c in chord_names(r)]
        folk += [c for r in run(tmp_path, data, seed=seed, style="FOLK")[1] for c in chord_names(r)]
    sevenths = ("7", "maj7", "m7", "9", "m9", "maj9", "13", "11", "m7b5")
    assert _share(jazz, sevenths) > _share(folk, sevenths)


def test_density_changes_number_of_chords(tmp_path):
    data = single(TWINKLE * 2)
    sparse = sum(run(tmp_path, data, seed=s, density="SPARSE")[0].filled for s in range(4))
    dense = sum(run(tmp_path, data, seed=s, density="DENSE")[0].filled for s in range(4))
    assert sparse < dense


# ------------------------------------------------------------------------------------------------ chèn <harmony>


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


def _token(root: str, kind: str = "major") -> int:
    return next(i for i, c in enumerate(chord_table()) if not c["rest"] and c["root"] == [root, 0]
                and c["kind"] == kind and "bass" not in c and not c["added"])


def test_insert_anchors_mid_measure_chord_on_note_sounding_before_it():
    # Đen C – trắng D – đen E (divisions 2): không nốt nào bắt đầu ở phách 3, nốt D đang vang
    root = ET.fromstring(single([n("C", 4, 2) + n("D", 4, 4) + n("E", 4, 2)], divisions=2))
    measure = root.find("part/measure")
    assert insert_harmony(measure, 2, Fraction(0), harmony_element(_token("C"), 1, 1), 1)
    assert insert_harmony(measure, 2, Fraction(2), harmony_element(_token("F"), 1, 1), 1)
    assert _harmony_before_each_note(measure) == [1, 1, 0]
    second = measure.findall("harmony")[1]
    assert second.findtext("root/root-step") == "F"
    assert second.findtext("offset") == "2"  # nốt D ở phách 2, hợp âm ở phách 3: lệch 1 phách đen = 2 divisions


def test_insert_drops_chord_without_free_note():
    root = ET.fromstring(single([n("C", 4, 8)], divisions=2))
    measure = root.find("part/measure")
    assert insert_harmony(measure, 2, Fraction(0), harmony_element(_token("C"), 1, 1), 1)
    assert not insert_harmony(measure, 2, Fraction(2), harmony_element(_token("F"), 1, 1), 1)


def test_harmony_element_uses_editor_suffix_and_bass():
    table = chord_table()
    slash = next(i for i, c in enumerate(table) if not c["rest"] and c.get("bass") and c["kind"] == "minor-seventh")
    el = harmony_element(slash, 2, 1)
    assert el.find("kind").get("text") == "m7" and el.findtext("kind") == "minor-seventh"
    assert el.findtext("bass/bass-step") and el.findtext("staff") == "1"
