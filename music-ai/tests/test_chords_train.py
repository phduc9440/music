"""Huấn luyện bảng xác suất HMM gợi ý hợp âm (``training/chords``)."""

import math
import struct
from pathlib import Path

import numpy as np
import pytest

from app.chords.hmm import load_model
from app.chords.theory import VOCAB, Key
from training.chords.corpus import (
    Song,
    label_to_state,
    parse_harte,
    parse_irb_token,
    read_irb,
    read_midi_notes,
    read_pop909,
)
from training.chords.train import BALLAD_COLOR_BOOST, count_model, exclude_test

C = Key(0, "major", 0)


def song(chords, melody=None, key=C, name="s"):
    return Song(name=name, key=key, chords=chords, melody=melody)


def probs(log_values) -> np.ndarray:
    return np.exp(np.asarray(log_values))


# ---------------------------------------------------------------------------------------------- nhãn hợp âm


def test_parse_harte_reduces_qualities():
    assert parse_harte("B:maj") == (11, "maj", None)
    assert parse_harte("A:min7") == (9, "min7", None)
    assert parse_harte("C:maj/3") == (0, "maj", 4)
    assert parse_harte("Db:sus2") == (1, "maj", None)
    assert parse_harte("G:sus4(b7)") == (7, "sus4", None)
    assert parse_harte("E:min/b3") == (4, "min", 7)
    assert parse_harte("F#:hdim7") == (6, "hdim7", None)
    assert parse_harte("C:dim") is None
    assert parse_harte("N") is None


def test_parse_irb_token_reduces_qualities():
    assert parse_irb_token("2G:min7") == (2.0, (7, "min7", None))
    assert parse_irb_token("2C7b9") == (2.0, (0, "7", None))
    assert parse_irb_token("1B-:maj7") == (4.0, (10, "maj7", None))
    assert parse_irb_token("4F#h7") == (1.0, (6, "hdim7", None))
    assert parse_irb_token("2.E-6") == (3.0, (3, "maj", None))
    assert parse_irb_token("1Co7") == (4.0, None)


def test_label_to_state_uses_bass_when_vocab_has_it():
    ballad = VOCAB["BALLAD"]["major"]
    labels = [c.label for c in ballad]
    assert ballad[label_to_state((0, "maj", 4), C, ballad)].label == "I/3"
    assert ballad[label_to_state((7, "maj", 11), C, ballad)].label == "V/7"
    pop = VOCAB["POP"]["major"]
    assert pop[label_to_state((0, "maj", 4), C, pop)].label == "I"
    assert label_to_state((1, "maj", None), C, pop) is None
    assert labels  # từ vựng không rỗng


# ---------------------------------------------------------------------------------------------- đếm


def test_count_model_transition_counts():
    songs = [song(["C:maj", "G:maj", "A:min", "F:maj", "C:maj"]), song(["C:maj", "G:maj", "A:min", "F:maj"])]
    model = count_model(songs, "POP")
    states = model["major"]["states"]
    trans = probs(model["major"]["trans"])
    i, v = states.index("I"), states.index("V")

    assert int(np.argmax(trans[i])) == v
    assert np.allclose(trans.sum(axis=1), 1.0, atol=1e-6)


def test_count_model_states_match_vocab():
    model = count_model([song(["C:maj", "G:maj"])], "BALLAD")
    assert model["major"]["states"] == [c.label for c in VOCAB["BALLAD"]["major"]]
    assert model["minor"]["states"] == [c.label for c in VOCAB["BALLAD"]["minor"]]
    assert model["style"] == "BALLAD"


def test_end_prob_favours_tonic():
    songs = [song(["F:maj", "G:maj", "C:maj"], name=str(k)) for k in range(3)]
    model = count_model(songs, "POP")
    assert model["major"]["states"][int(np.argmax(model["major"]["end"]))] == "I"


def test_minor_song_counts_in_minor_table():
    a_minor = Key(9, "minor", 0)
    model = count_model([song(["A:min", "E:maj", "A:min"], key=a_minor)] * 3, "POP")
    states = model["minor"]["states"]
    trans = probs(model["minor"]["trans"])
    assert int(np.argmax(trans[states.index("i")])) == states.index("V")


def test_unknown_labels_break_sequence():
    # C:dim không vào được từ vựng: không có cặp I→V nào được đếm qua nó
    with_gap = count_model([song(["C:maj", "C:dim", "G:maj"])] * 5, "POP")
    states = with_gap["major"]["states"]
    i, v = states.index("I"), states.index("V")
    row = probs(with_gap["major"]["trans"])[i]
    assert row[v] == pytest.approx(row[states.index("ii")])  # chỉ còn làm mượt, không có số đếm


def _row(model: dict, mode: str, label: str) -> np.ndarray:
    states = model[mode]["states"]
    return probs(model[mode]["emission"][states.index(label)])


def test_count_emission_peaks_on_chord_tones():
    # Hợp âm C trưởng (bậc I), giai điệu chỉ có C, E, G
    model = count_model([song(["C:maj"], melody=[[(0, 1.0), (4, 1.0), (7, 2.0)]])] * 4, "POP")
    row = _row(model, "major", "I")
    assert set(np.argsort(row)[-3:]) == {0, 4, 7}
    assert row.sum() == pytest.approx(1.0, abs=1e-6)
    assert len(model["major"]["emission"]) == len(model["major"]["states"])
    assert all(len(r) == 12 for r in model["major"]["emission"])


def test_emission_is_learned_per_function():
    # Cùng hợp âm C trưởng: là bậc I ở giọng Đô (nốt E = bậc 4), là bậc IV ở giọng Sol (nốt E = bậc 9)
    g = Key(7, "major", 1)
    songs = [song(["C:maj"], melody=[[(4, 2.0)]], name="c")] * 3 + [song(["C:maj"], melody=[[(4, 2.0)]], key=g, name="g")] * 3
    model = count_model(songs, "POP")
    assert int(np.argmax(_row(model, "major", "I"))) == 4
    assert int(np.argmax(_row(model, "major", "IV"))) == 9


def test_state_without_data_backs_off_to_quality_shape():
    # Không bài nào có bVII: hàng của nó theo bảng loại "maj" xoay về gốc 10, nên các nốt của Bb (10, 2, 5) cao nhất
    model = count_model([song(["C:maj", "G:maj"], melody=[[(0, 1.0), (4, 1.0), (7, 1.0)], [(7, 1.0), (11, 1.0), (2, 1.0)]])] * 4, "POP")
    row = _row(model, "major", "bVII")
    assert set(np.argsort(row)[-3:]) == {10, 2, 5}


def test_jazz_emission_boosts_extensions():
    melody = [[(7, 1.0), (11, 1.0), (2, 1.0), (5, 1.0)]]  # G7 trong Đô trưởng
    pop = count_model([song(["G:7"], melody=melody)] * 4, "POP")
    jazz = count_model([song(["G:7"])], "JAZZ", emission_songs=[song(["G:7"], melody=melody)] * 4)
    # nốt 9 của G7 là A = bậc 9
    assert _row(jazz, "major", "V7")[9] > _row(pop, "major", "V7")[9]


def test_ballad_boost_raises_color_chords():
    songs = [song(["C:maj", "C:maj7", "F:maj", "F:maj7", "G:maj", "C:maj"], name=str(k)) for k in range(4)]
    pop_like = count_model(songs, "BALLAD", boost=False)
    ballad = count_model(songs, "BALLAD")
    states = ballad["major"]["states"]
    i, imaj7 = states.index("IV"), states.index("Imaj7")
    assert probs(ballad["major"]["trans"])[i][imaj7] > probs(pop_like["major"]["trans"])[i][imaj7]
    assert set(BALLAD_COLOR_BOOST) <= set(states) | {c.label for c in VOCAB["BALLAD"]["minor"]}


def test_test_split_not_in_training():
    songs = [song(["C:maj"], name=f"pop909/{k:03d}") for k in range(1, 6)]
    kept = exclude_test(songs, {"pop909/002", "pop909/004"})
    assert [s.name for s in kept] == ["pop909/001", "pop909/003", "pop909/005"]


# ---------------------------------------------------------------------------------------------- đọc dữ liệu


def _varlen(value: int) -> bytes:
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))


def write_midi(path: Path, notes: list[tuple[int, int, int]], tpq: int = 480, tempo_us: int = 500000) -> None:
    """MIDI format 1: track 0 tempo, track 1 tên MELODY; ``notes`` = (bắt đầu tick, độ dài tick, cao độ)."""
    tempo = b"\x00\xff\x51\x03" + tempo_us.to_bytes(3, "big") + b"\x00\xff\x2f\x00"
    events = []
    for start, length, pitch in notes:
        events.append((start, bytes([0x90, pitch, 80])))
        events.append((start + length, bytes([0x80, pitch, 0])))
    events.sort(key=lambda e: (e[0], e[1][0] == 0x90))
    body, now = b"\x00\xff\x03\x06MELODY", 0
    for tick, data in events:
        body += _varlen(tick - now) + data
        now = tick
    body += b"\x00\xff\x2f\x00"
    track = lambda b: b"MTrk" + struct.pack(">I", len(b)) + b  # noqa: E731
    path.write_bytes(b"MThd" + struct.pack(">IHHH", 6, 1, 2, tpq) + track(tempo) + track(body))


def test_read_midi_notes_converts_ticks_to_seconds(tmp_path):
    path = tmp_path / "m.mid"
    write_midi(path, [(0, 480, 60), (480, 960, 64)])  # 120 BPM: phách đen 0,5 giây
    notes = read_midi_notes(path, "MELODY")
    assert notes == [(0.0, 0.5, 60), (0.5, 1.5, 64)]


def make_pop909_song(root: Path, number: str = "001") -> None:
    song_dir = root / "POP909" / number
    song_dir.mkdir(parents=True)
    # 120 BPM, 4/4: mỗi phách 0,5 giây, 2 ô = 8 phách
    beats = "\n".join(f"{k * 0.5} {1.0 if k % 2 == 0 else 0.0} {1.0 if k % 4 == 0 else 0.0}" for k in range(9))
    (song_dir / "beat_midi.txt").write_text(beats)
    (song_dir / "chord_midi.txt").write_text("0.0\t1.0\tC:maj\n1.0\t2.0\tA:min\n2.0\t3.0\tF:maj\n3.0\t4.0\tG:maj\n")
    (song_dir / "key_audio.txt").write_text("0.0\t4.0\tC:maj\n")
    write_midi(song_dir / f"{number}.mid", [(0, 480, 72), (480, 480, 64), (960, 960, 69), (1920, 1920, 65)])


def test_read_pop909_builds_half_measure_steps(tmp_path):
    make_pop909_song(tmp_path)
    songs = list(read_pop909(tmp_path))

    assert len(songs) == 1
    s = songs[0]
    assert s.name == "pop909/001"
    assert s.key == Key(0, "major", 0)
    assert s.chords == ["C:maj", "A:min", "F:maj", "G:maj"]
    assert [pc for pc, _ in s.melody[0]] == [0, 4]
    assert s.melody[0][0][1] == pytest.approx(1.0)  # 1 phách


def test_read_irb_builds_steps(tmp_path):
    (tmp_path / "tune.jazz").write_text(
        "!!!OTL: Tune\n**jazz\n*>[A]\n*>A\n*M4/4\n*E-:\n2F:min7\n2B-7\n=\n1E-:maj7\n=\n4C7\n4C7b9\n2F:min7\n==\n*-\n"
    )
    songs = list(read_irb(tmp_path))
    assert songs[0].key == Key(3, "major", -3)
    assert songs[0].melody is None
    assert songs[0].chords == ["F:min7", "Bb:7", "Eb:maj7", "Eb:maj7", "C:7", "F:min7"]


def test_shipped_models_load():
    for style in ("POP", "BALLAD", "JAZZ"):
        model = load_model(style)
        assert model.style == style
        assert math.isfinite(float(model.major.log_trans.max()))
