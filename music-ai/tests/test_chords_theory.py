"""Nhạc lý cho gợi ý hợp âm: đoán giọng, từ vựng, viết tên hợp âm (``app/chords/theory.py``)."""

import xml.etree.ElementTree as ET
from fractions import Fraction

from app.chords.melody import MelodyNote
from app.chords.theory import (
    VOCAB,
    Key,
    chord_symbol,
    detect_key,
    nearest_state,
    parse_harmony,
    parse_symbol,
    spell_root,
)


def melody(*midis: int, lengths=None) -> list[MelodyNote]:
    lengths = lengths or [1] * len(midis)
    out, pos = [], Fraction(0)
    for midi, length in zip(midis, lengths):
        out.append(MelodyNote(midi, pos, Fraction(length)))
        pos += Fraction(length)
    return out


def state(style: str, mode: str, label: str):
    return next(c for c in VOCAB[style][mode] if c.label == label)


def test_detect_key_c_major_scale():
    notes = melody(60, 62, 64, 65, 67, 69, 71, 72, lengths=[2, 1, 1, 1, 2, 1, 1, 4])
    assert detect_key(notes, 0) == Key(0, "major", 0)


def test_detect_key_a_minor_with_leading_tone():
    notes = melody(69, 71, 72, 74, 76, 77, 80, 81, lengths=[3, 1, 1, 1, 2, 1, 1, 4])
    key = detect_key(notes, 0)
    assert key.tonic == 9
    assert key.mode == "minor"
    assert key.fifths == 0


def test_detect_key_respects_signature():
    notes = melody(67, 71, 64, 66, 67, 64)  # G B E F# G E
    key = detect_key(notes, 1)
    assert key.tonic in (7, 4)
    assert key.fifths == 1


def test_detect_key_without_signature_infers_fifths():
    notes = melody(62, 66, 69, 74, 73, 71, 69, 62, lengths=[2, 1, 1, 2, 1, 1, 1, 4])  # D trưởng
    key = detect_key(notes, None)
    assert key == Key(2, "major", 2)


def test_spell_root_uses_flats_for_flat_keys():
    assert spell_root(1, Key(3, "major", -3)) == ("D", -1)
    assert spell_root(2, Key(7, "major", 1)) == ("D", 0)
    assert spell_root(6, Key(2, "major", 2)) == ("F", 1)
    assert spell_root(10, Key(0, "major", 0), prefer_flat=True) == ("B", -1)


def test_chord_symbol_forms():
    c = Key(0, "major", 0)
    assert chord_symbol(state("BALLAD", "major", "vi7"), c) == "Am7"
    assert chord_symbol(state("BALLAD", "major", "I/3"), c) == "C/E"
    assert chord_symbol(state("JAZZ", "major", "viiø7"), c) == "Bm7b5"
    assert chord_symbol(state("BALLAD", "major", "Vsus4"), c) == "Gsus4"
    assert chord_symbol(state("POP", "major", "bVII"), c) == "Bb"
    assert chord_symbol(state("POP", "minor", "bVI"), Key(9, "minor", 0)) == "F"


def test_parse_symbol_roundtrip():
    keys = [Key(0, "major", 0), Key(3, "major", -3), Key(9, "minor", 0), Key(4, "minor", 1)]
    for style, modes in VOCAB.items():
        for mode, chords in modes.items():
            for key in keys:
                for chord in chords:
                    assert parse_symbol(chord_symbol(chord, key), key) == (chord.root, chord.quality), (style, chord)


def test_parse_symbol_unknown_suffix_is_none():
    assert parse_symbol("Caug", Key(0, "major", 0)) is None
    assert parse_symbol("H7", Key(0, "major", 0)) is None


def test_parse_harmony_reads_root_and_kind():
    el = ET.fromstring("<harmony><root><root-step>A</root-step></root><kind>minor-seventh</kind></harmony>")
    assert parse_harmony(el, Key(0, "major", 0)) == (9, "min7")
    flat = ET.fromstring(
        "<harmony><root><root-step>B</root-step><root-alter>-1</root-alter></root><kind>major</kind></harmony>"
    )
    assert parse_harmony(flat, Key(0, "major", 0)) == (10, "maj")
    aug = ET.fromstring("<harmony><root><root-step>C</root-step></root><kind>augmented</kind></harmony>")
    assert parse_harmony(aug, Key(0, "major", 0)) is None


def test_nearest_state_falls_back_to_same_root_triad():
    states = VOCAB["POP"]["major"]
    labels = [c.label for c in states]
    assert nearest_state(9, "min7", states) == labels.index("vi")
    assert nearest_state(7, "7", states) == labels.index("V7")
    assert nearest_state(1, "maj", states) is None


def test_vocab_labels_unique_per_mode():
    for modes in VOCAB.values():
        for chords in modes.values():
            labels = [c.label for c in chords]
            assert len(labels) == len(set(labels))
