"""Đánh giá HMM gợi ý hợp âm trên tập kiểm thử (``scripts/chord_eval.py``)."""

import json
from pathlib import Path

import pytest

from app.chords.hmm import load_model
from app.chords.theory import Key
from scripts.chord_eval import evaluate, markdown_table
from training.chords.corpus import Song
from training.chords.train import count_model

C = Key(0, "major", 0)
TINY = Path(__file__).parent / "fixtures" / "chords_tiny_model.json"
C_TRIAD = [(0, 1.0), (4, 1.0), (7, 1.0)]


def song(chords, melody):
    return Song(name="t", key=C, chords=chords, melody=melody)


def test_tonic_baseline():
    s = song(["C:maj", "C:maj", "G:maj", "C:maj"], [C_TRIAD] * 4)
    result = evaluate([s], load_model("POP", TINY), "tonic")
    assert result["root_acc"] == pytest.approx(0.75)
    assert result["chord_acc"] == pytest.approx(0.75)
    assert result["steps"] == 4


def test_unlabelled_steps_are_not_scored():
    s = song(["C:maj", None, "N", "C:maj"], [C_TRIAD] * 4)
    assert evaluate([s], load_model("POP", TINY), "tonic")["steps"] == 2


def test_hmm_beats_emission_on_fixture(tmp_path):
    cycle = ["C:maj", "G:maj", "A:min", "F:maj"]
    training = [Song(name=str(k), key=C, chords=cycle * 6 + ["C:maj"], melody=None) for k in range(10)]
    emission_songs = [song(["C:maj"], [C_TRIAD])] * 5
    path = tmp_path / "pop.json"
    path.write_text(json.dumps(count_model(training, "POP", emission_songs=emission_songs)))
    model = load_model("POP", path)

    # Giai điệu chỉ có ở các bước C; các bước khác trống nên chỉ bảng chuyển mới đoán đúng được
    chords = cycle * 2 + ["C:maj"]
    melody = [C_TRIAD if c == "C:maj" else [] for c in chords]
    test = [song(chords, melody)]

    emission = evaluate(test, model, "emission")
    hmm = evaluate(test, model, "hmm")
    assert hmm["chord_acc"] > emission["chord_acc"]
    assert hmm["chord_acc"] == pytest.approx(1.0)


def test_function_accuracy_counts_same_function():
    # Luôn đoán C: đúng gốc 1/4, nhưng Am (vi) cùng nhóm chủ với C nên đúng chức năng 2/4
    s = song(["C:maj", "G:maj", "A:min", "F:maj"], [C_TRIAD] * 4)
    result = evaluate([s], load_model("POP", TINY), "tonic")
    assert result["root_acc"] == pytest.approx(0.25)
    assert result["func_acc"] == pytest.approx(0.5)


def test_tone_coverage_measures_melody_inside_chord():
    # Giai điệu C và D trên hợp âm C: một nửa trường độ nằm trong hợp âm, cho cả đoán lẫn nhãn gốc
    s = song(["C:maj"], [[(0, 1.0), (2, 1.0)]])
    result = evaluate([s], load_model("POP", TINY), "tonic")
    assert result["tone_cov"] == pytest.approx(0.5)
    assert result["gold_tone_cov"] == pytest.approx(0.5)


def test_markdown_table_has_all_methods():
    rows = {
        "tonic": {"root_acc": 0.5, "chord_acc": 0.4, "func_acc": 0.6, "tone_cov": 0.7, "gold_tone_cov": 0.8, "steps": 10},
        "hmm": {"root_acc": 0.7, "chord_acc": 0.6, "func_acc": 0.75, "tone_cov": 0.8, "gold_tone_cov": 0.8, "steps": 10},
    }
    table = markdown_table("POP", rows)
    assert "| tonic | 50.0% | 40.0% | 60.0% | 70.0% | 10 |" in table
    assert "| hmm | 70.0% | 60.0% | 75.0% | 80.0% | 10 |" in table
    assert "Nốt thuộc hợp âm của nhãn gốc: 80.0%" in table
