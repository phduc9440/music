"""Hợp âm có nốt thêm của AutoHarmonizer được ghi đủ <degree> và chữ gõ lại được (app/chords/symbols.py)."""

import json
from pathlib import Path

from app.chords import symbols

TABLE = json.loads((Path(__file__).parents[1] / "app/chords/autoharmonizer/chords.json").read_text(encoding="utf-8"))


def test_music21_add7_is_minor_seventh_and_sharps_flats_are_read():
    assert symbols.modifications("A-sus add 7 add 9") == [("add", 7, -1), ("add", 9, 0)]
    assert symbols.modifications("G7 alter #5 add #9") == [("alter", 5, 1), ("add", 9, 1)]
    assert symbols.modifications("C13 subtract 5 subtract 11") == [("subtract", 5, 0), ("subtract", 11, 0)]


def test_text_follows_editor_notation():
    cases = {
        ("dominant", "7", "G7 add b9"): "7b9",
        ("dominant", "7", "C7 subtract 5 add b9 add #9 add #11 add b13"): "7(no5,b9,#9,#11,b13)",
        ("suspended-fourth", "sus4", "Dsus add 7"): "7sus4",
        ("suspended-fourth", "sus4", "Dsus add 7 add 9"): "9sus4",
        ("suspended-fourth", "sus4", "A-sus add 7 add 9 add 11 add 13"): "13sus4(11)",
        ("major-sixth", "6", "F6 add 9"): "6/9",
        ("major", "", "F add 2"): "add2",
        ("minor", "m", "Dm alter #5"): "m#5",
        ("major", "", "C alter b5"): "(b5)",
        ("dominant", "7", "D7 add 4 subtract 3"): "7(add4,no3)",
        ("suspended-fourth", "sus4", "B-sus add 7 add 13"): "7sus4(13)",
        ("dominant-ninth", "9", "G9 alter #5"): "9#5",
        ("major-minor", "mM7", "CmM7 add 9"): "mM7(9)",
    }
    for (kind, base, figure), text in cases.items():
        assert symbols.chord_text(kind, base, symbols.modifications(figure)) == text, figure


def test_every_added_chord_keeps_its_extra_notes():
    added = [c for c in TABLE if not c["rest"] and c.get("added")]
    assert len(added) > 300
    for chord in added:
        mods = symbols.modifications(chord["figure"])
        assert mods, chord["figure"]
        # Phần sửa phải đổi ít nhất một nốt so với kind trơn (trừ "add 5" vốn đã có trong hợp âm)
        plain = symbols.pitch_classes(chord["kind"], [])
        if not all(m == ("add", 5, 0) for m in mods) and chord["figure"] != "C13 subtract 5 subtract 11":
            assert symbols.pitch_classes(chord["kind"], mods) != plain or chord["kind"] == "dominant-13th", chord["figure"]
