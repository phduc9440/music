"""HMM gợi ý hợp âm: điểm phát và Viterbi (``app/chords/hmm.py``)."""

import itertools
import json
import math
from fractions import Fraction
from pathlib import Path

import numpy as np
import pytest

from app.chords.hmm import EMISSION_WEIGHT, STRONG_BEAT_WEIGHT, emission_matrix, load_model, viterbi
from app.chords.melody import MelodyNote, Step
from app.chords.theory import Key

TINY = Path(__file__).parent / "fixtures" / "chords_tiny_model.json"
LOG = np.log


def test_viterbi_matches_hand_computed():
    """start [.6 .4], trans [[.7 .3] [.4 .6]], phát t0 [.9 .1], t1 [.1 .9], t2 [.3 .7].

    Đường 0-1-1: .6·.9 · .3·.9 · .6·.7 = 0.0612 là lớn nhất (0-1-0: 0.0175, 1-1-1: 0.0091, 0-0-1: 0.0079 ...)."""
    start = LOG([0.6, 0.4])
    trans = LOG([[0.7, 0.3], [0.4, 0.6]])
    end = np.zeros(2)
    emit = LOG([[0.9, 0.1], [0.1, 0.9], [0.3, 0.7]])

    best = viterbi(start, trans, end, emit, [None, None, None])

    brute = max(
        itertools.product(range(2), repeat=3),
        key=lambda p: start[p[0]] + emit[0, p[0]] + sum(trans[p[t - 1], p[t]] + emit[t, p[t]] for t in (1, 2)),
    )
    assert best == [0, 1, 1] == list(brute)


def test_viterbi_respects_allowed():
    start = LOG([0.5, 0.5])
    trans = LOG([[0.5, 0.5], [0.5, 0.5]])
    emit = LOG([[0.1, 0.9], [0.1, 0.9], [0.1, 0.9]])

    assert viterbi(start, trans, np.zeros(2), emit, [None, 0, None]) == [1, 0, 1]


def test_viterbi_uses_end_probabilities():
    start = LOG([0.5, 0.5])
    trans = LOG([[0.5, 0.5], [0.5, 0.5]])
    emit = LOG([[0.5, 0.5], [0.45, 0.55]])
    end = LOG([0.9, 0.1])

    assert viterbi(start, trans, end, emit, [None, None])[-1] == 0


def test_viterbi_empty_returns_empty():
    assert viterbi(np.zeros(2), np.zeros((2, 2)), np.zeros(2), np.zeros((0, 2)), []) == []


def test_viterbi_deterministic_on_ties():
    flat = np.zeros(2)
    results = {tuple(viterbi(flat, np.zeros((2, 2)), flat, np.zeros((3, 2)), [None] * 3)) for _ in range(5)}
    assert results == {(0, 0, 0)}


def _step(notes, start=0, length=2):
    return Step(
        measure_index=0,
        start=Fraction(start),
        offset_in_measure=Fraction(start),
        length=Fraction(length),
        notes=notes,
    )


def test_emission_weights_strong_beat():
    # Bước có G dài 1 phách ở đầu bước rồi C dài 1 phách; trạng thái 0 chỉ ưa bậc 7 (G), trạng thái 1 chỉ ưa bậc 0 (C)
    step = _step([MelodyNote(67, Fraction(0), Fraction(1)), MelodyNote(60, Fraction(1), Fraction(1))])
    high, low = math.log(0.5), math.log(0.5 / 11)
    log_emit = np.full((2, 12), low)
    log_emit[0, 7] = high
    log_emit[1, 0] = high

    row = emission_matrix([step], log_emit, Key(0, "major", 0))[0]

    assert row[0] == pytest.approx(EMISSION_WEIGHT * (STRONG_BEAT_WEIGHT * high + low))
    assert row[1] == pytest.approx(EMISSION_WEIGHT * (high + STRONG_BEAT_WEIGHT * low))
    assert row[0] > row[1]


def test_emission_indexed_by_scale_degree():
    # Trong G trưởng (tonic 7), nốt B là bậc 4 (E trong Đô trưởng): bảng theo bậc phải đọc cột 4
    step = _step([MelodyNote(71, Fraction(0), Fraction(2))])
    log_emit = np.zeros((2, 12))
    log_emit[0, 4] = -1.0
    log_emit[1, 11] = -1.0  # cột 11 = B nếu quên trừ chủ âm

    row = emission_matrix([step], log_emit, Key(7, "major", 1))[0]

    assert row[0] == pytest.approx(EMISSION_WEIGHT * 2 * -1.0 * STRONG_BEAT_WEIGHT)
    assert row[1] == 0


def test_same_chord_scores_differently_by_function():
    # Hợp âm C (bậc I trong Đô trưởng) và hợp âm C (bậc IV trong Sol trưởng) có bảng phát khác nhau theo bậc của nốt
    model = load_model("POP", TINY)
    labels = [c.label for c in model.major.states]
    step = _step([MelodyNote(64, Fraction(0), Fraction(2))])  # nốt E
    in_c = emission_matrix([step], model.major.log_emit, Key(0, "major", 0))[0]
    in_g = emission_matrix([step], model.major.log_emit, Key(7, "major", 1))[0]
    assert in_c[labels.index("I")] > in_c[labels.index("IV")]
    assert in_g[labels.index("IV")] > in_g[labels.index("I")]


def test_empty_step_has_flat_emission():
    row = emission_matrix([_step([])], load_model("POP", TINY).major.log_emit, Key(0, "major", 0))[0]
    assert np.all(row == 0)


def test_load_model_reads_tiny_fixture():
    model = load_model("POP", TINY)
    assert model.style == "POP"
    assert [c.label for c in model.major.states][:3] == ["I", "ii", "iii"]
    assert model.major.log_trans.shape == (8, 8)
    assert model.minor.log_start.shape == (7,)
    assert model.major.log_emit.shape == (8, 12)
    assert model.minor.log_emit.shape == (7, 12)


def test_load_model_rejects_unknown_state(tmp_path):
    data = json.loads(TINY.read_text())
    data["major"]["states"][0] = "IX"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        load_model("POP", bad)


def test_load_model_rejects_wrong_emission_shape(tmp_path):
    data = json.loads(TINY.read_text())
    data["major"]["emission"] = data["major"]["emission"][:-1]  # thiếu một trạng thái
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        load_model("POP", bad)


def test_load_model_rejects_old_format(tmp_path):
    data = json.loads(TINY.read_text())
    data["version"] = 1
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        load_model("POP", bad)


def test_emission_weight_favours_melody_fit_over_staying():
    """Hệ số phát > 1 (chỉnh trên tập kiểm thử POP909: 36,8% → 40,1% đúng hợp âm) để HMM không bám hợp âm chủ."""
    assert EMISSION_WEIGHT == 2.0
