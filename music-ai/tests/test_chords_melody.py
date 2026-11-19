"""Tách giai điệu thành các bước cho HMM gợi ý hợp âm (``app/chords/melody.py``)."""

from fractions import Fraction

import pytest

from app.chords import ChordError
from app.chords.melody import load_melody
from tests.chord_samples import backup, harm, n, part_xml, r, score_xml, single, unpitched


def test_extract_steps_takes_top_note_of_staff_one():
    # Khuông 1: hợp âm C4+E4+G4 dài 4 phách; khuông 2: C3
    measure = (
        n("C", 4, 4, staff=1)
        + n("E", 4, 4, staff=1, chord=True)
        + n("G", 4, 4, staff=1, chord=True)
        + backup(4)
        + n("C", 3, 4, staff=2)
    )
    src = load_melody(single([measure], staves=2))

    assert src.staff == 1
    assert src.staves == 2
    assert src.steps[0].notes[0].midi == 67
    assert all(note.midi >= 60 for step in src.steps for note in step.notes)


def test_steps_split_half_measure_in_4_4_and_6_8():
    four = load_melody(single([n("C", 4, 4)]))
    assert [s.length for s in four.steps] == [2, 2]
    assert [s.offset_in_measure for s in four.steps] == [0, 2]

    # 6/8, divisions=2: một ô dài 3 phách đen
    six = load_melody(single([n("C", 4, 6)], beats=6, beat_type=8, divisions=2))
    assert [s.length for s in six.steps] == [Fraction(3, 2), Fraction(3, 2)]

    three = load_melody(single([n("C", 4, 3), n("D", 4, 3)], beats=3))
    assert [s.length for s in three.steps] == [3, 3]
    assert [s.measure_index for s in three.steps] == [0, 1]
    assert three.steps[1].start == 3


def test_tied_note_is_cut_at_step_boundary():
    # 4/4: nốt đen C, nốt trắng E nối sang nốt đen E (E kéo từ phách 2 đến hết phách 4)
    measure = n("C", 4, 1) + n("E", 4, 2, ties=("start",)) + n("E", 4, 1, ties=("stop",))
    src = load_melody(single([measure]))

    first, second = src.steps
    assert [(x.midi, x.start, x.length) for x in first.notes] == [(60, 0, 1), (64, 1, 1)]
    assert [(x.midi, x.start, x.length) for x in second.notes] == [(64, 2, 2)]


def test_existing_harmony_marks_measure_locked():
    src = load_melody(single([n("C", 4, 4), harm("A", "minor", text="m") + n("A", 4, 4)]))

    first_measure = [s for s in src.steps if s.measure_index == 0]
    second_measure = [s for s in src.steps if s.measure_index == 1]
    assert all(not s.locked and s.existing is None for s in first_measure)
    assert all(s.locked for s in second_measure)
    assert all(s.existing.findtext("root/root-step") == "A" for s in second_measure)


def test_melody_part_skips_percussion():
    drums = part_xml("P1", [unpitched(4)])
    melody = part_xml("P2", [n("G", 4, 4)])
    src = load_melody(score_xml(drums, melody))

    assert src.part.get("id") == "P2"
    assert src.steps[0].notes[0].midi == 67


def test_rest_only_step_has_no_notes():
    src = load_melody(single([n("C", 4, 2) + r(2)]))
    assert src.steps[1].notes == []


def test_fifths_read_from_first_measure():
    assert load_melody(single([n("G", 4, 4)], fifths=-3)).fifths == -3


def test_entity_rejected():
    data = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><score-partwise/>'
    with pytest.raises(ChordError) as info:
        load_melody(data)
    assert info.value.code == "PARSE_ERROR"


def test_broken_xml_rejected():
    with pytest.raises(ChordError) as info:
        load_melody(b"<score-partwise><part>")
    assert info.value.code == "PARSE_ERROR"
