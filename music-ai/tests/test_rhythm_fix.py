"""Sửa nhịp ba đọc nhầm và nốt thừa trong hợp âm (app/omr/rhythm_fix.py)."""

from app.omr import rhythm_fix


def test_straightens_stray_triplets_when_measure_becomes_full():
    lines = ["*M2/4", "12fL", "8fJ", "8eL", "8aJ", "=", "12aL", "12fJ", "16fLL", "16b-JJ", "8a", "="]
    out, triplets, dropped, touched = rhythm_fix.fix_lines(lines, 1)
    assert out[1] == "8fL" and out[6] == "8aL" and out[7] == "8fJ"
    assert (triplets, dropped, touched) == (2, 0, [1, 2])


def test_keeps_real_triplets_and_correct_measures():
    lines = ["*M2/4", "12c", "12d", "12e", "4f", "=", "8c", "8d", "4e", "="]
    out, triplets, dropped, touched = rhythm_fix.fix_lines(lines, 1)
    assert out == lines and touched == []


def test_does_not_straighten_when_it_would_not_fix_the_measure():
    lines = ["*M2/4", "12c", "4d", "="]
    out, _t, _d, touched = rhythm_fix.fix_lines(lines, 1)
    assert out == lines and touched == []


def test_drops_chord_note_longer_than_measure():
    lines = ["*M2/4", "2c 1a", "=="]
    out, triplets, dropped, touched = rhythm_fix.fix_lines(lines, 1)
    assert out[1] == "2c" and dropped == 1 and touched == [1]


def test_multi_spine_fixes_only_the_wrong_spine():
    lines = ["*M2/4\t*M2/4", "12c\t4C", "8d\t4D", "4e\t.", "="]
    out, triplets, _d, _t = rhythm_fix.fix_lines(lines, 2)
    assert out[1] == "8c\t4C" and triplets == 1


def test_restores_lost_triplet_marks_when_whole_measure_is_triplets():
    lines = ["*M2/4", "8cL", "8d", "8eJ", "12fL", "12g", "12aJ", "="]
    out, triplets, _d, touched = rhythm_fix.fix_lines(lines, 1)
    assert out[1:4] == ["12cL", "12d", "12eJ"] and triplets == 1 and touched == [1]


def test_adds_missing_dot_inside_the_piece_only():
    lines = ["*M4/4", "4c", "4d", "4e", "4f", "=", "4d", "8d", "4e", "4f", "=", "1c", "=="]
    out, dots, touched = rhythm_fix.fix_dots(lines, 1)
    assert out[6] == "4.d" and dots == 1 and touched == [2]


def test_missing_dot_ambiguous_is_left_alone():
    lines = ["*M4/4", "1c", "=", "4d", "8d", "4e", "8f", "8g", "=", "1c", "=="]
    out, dots, _t = rhythm_fix.fix_dots(lines, 1)
    assert out == lines and dots == 0
