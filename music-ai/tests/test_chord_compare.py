"""Công cụ so sánh HMM với MelodyT5 (``scripts/chord_compare_melodyt5.py``): ABC và đọc hợp âm đầu ra."""

from app.chords.theory import Key
from scripts.chord_compare_melodyt5 import abc_pitch, bar_to_abc, chords_per_step, legato, parse_symbol_raw

C = Key(0, "major", 0)


def test_abc_pitch_octaves_and_key_signature():
    assert abc_pitch(60, C, {}) == "C"
    assert abc_pitch(72, C, {}) == "c"
    assert abc_pitch(84, C, {}) == "c'"
    assert abc_pitch(48, C, {}) == "C,"
    d_major = Key(2, "major", 2)
    assert abc_pitch(66, d_major, {}) == "F"  # F# có sẵn trong hóa biểu
    assert abc_pitch(65, d_major, {}) == "=F"


def test_accidental_lasts_until_end_of_bar():
    current: dict = {}
    assert abc_pitch(61, C, current) == "^C"
    assert abc_pitch(61, C, current) == "C"  # còn hiệu lực trong ô
    assert abc_pitch(60, C, current) == "=C"


def test_bar_to_abc_uses_eighth_units_and_keeps_repeated_notes():
    # L:1/8: 4 ô móc kép = 2, 1 ô = /2, 3 ô = 3/2
    slots = [(1, 60)] * 4 + [(2, 60)] * 4 + [None] * 4 + [(3, 67)] * 3 + [(4, 69)]
    assert bar_to_abc(slots, C) == "C2 C2 z2 G3/2 A/2"  # mỗi nốt cách nhau như dữ liệu harmonization của MelodyT5


def test_legato_fills_short_gaps_only():
    slots = [(1, 60)] * 2 + [None] * 2 + [(2, 62)] * 2 + [None] * 10
    assert legato(slots) == [(1, 60)] * 4 + [(2, 62)] * 2 + [None] * 10


def test_unbalanced_quote_does_not_swallow_melody():
    # Như đầu ra thật của MelodyT5: một dấu ngoặc kép lẻ trong ô 1
    output = 'L:1/8\nM:4/4\nK:C\n"C"C4" F4|"G"G8|]\n'
    assert chords_per_step(output, 4)[2] == (7, "maj", None)


def test_parse_symbol_raw_reduces_qualities():
    assert parse_symbol_raw("G#m7/B") == (8, "min7", 11)
    assert parse_symbol_raw("F#sus4") == (6, "sus4", None)
    assert parse_symbol_raw("Bdim") == (11, "dim", None)
    assert parse_symbol_raw("C") == (0, "maj", None)
    assert parse_symbol_raw("Xyz") is None


def test_chords_per_step_reads_active_chord_at_each_half_bar():
    output = 'X:1\nL:1/8\nM:4/4\nK:C\n"C"C2E2"Am"A4|"F"F8|G8|]\n'
    steps = chords_per_step(output, 6)
    assert steps == [(0, "maj", None), (9, "min", None), (5, "maj", None), (5, "maj", None),
                     (5, "maj", None), (5, "maj", None)]


def test_transpose_shift_to_c_major_or_a_minor():
    from scripts.chord_compare_melodyt5 import neutral_shift

    assert neutral_shift(Key(7, "major", 1)) == -7 or neutral_shift(Key(7, "major", 1)) == 5
    assert (7 + neutral_shift(Key(7, "major", 1))) % 12 == 0
    assert (8 + neutral_shift(Key(8, "minor", 5))) % 12 == 9  # G#m → Am


def test_shift_back_restores_original_root():
    from scripts.chord_compare_melodyt5 import shift_parsed

    assert shift_parsed((0, "maj", 4), -5) == (7, "maj", 11)
    assert shift_parsed(None, 3) is None


def test_score_reports_accuracy_on_answered_steps():
    from scripts.chord_compare_melodyt5 import score
    from training.chords.corpus import Song

    song = Song(name="t", key=C, chords=["C:maj", "G:maj", "C:maj", "F:maj"], melody=[[(0, 1.0)]] * 4)
    result = score([(song, [(0, "maj", None), None, (0, "maj", None), (7, "maj", None)])])
    assert result["missing"] == 0.25
    assert result["root_raw"] == 0.5  # 2/4 tính cả bước bỏ trống
    assert abs(result["root_answered"] - 2 / 3) < 1e-9  # 2/3 trên các bước có hợp âm
