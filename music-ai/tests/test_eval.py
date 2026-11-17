"""Bộ đánh giá (app/eval): đọc kern/MusicXML, căn ô nhịp, metric nốt/cao độ/trường độ/hợp âm, SER, CER/WER, lời ca."""

from fractions import Fraction
from pathlib import Path

import pytest

from app.eval.lyrics import compare_lyrics
from app.eval.metrics import align_measures, compare
from app.eval.score import Lyric, attacks, kern_duration, kern_midi, load_score, read_kern, read_musicxml
from app.eval.text import cer, strip_diacritics, wer
from tests.xml_samples import note, part, score

GT_DANG = Path(__file__).resolve().parents[1] / "benchmark" / "gt" / "dang" / "score.krn"


def kern(*measures, header="**kern\n*clefG2\n*k[b-]\n*M3/4"):
    body = []
    for i, m in enumerate(measures, start=1):
        body.extend(m)
        body.append(f"={i}")
    return header + "\n" + "\n".join(body) + "\n*-\n"


def test_kern_tokens():
    assert kern_duration("4") == 1
    assert kern_duration("2.") == 3
    assert kern_duration("8..") == Fraction(7, 8)
    assert kern_duration("0") == 8
    assert kern_midi("c") == 60
    assert kern_midi("cc") == 72
    assert kern_midi("C") == 48
    assert kern_midi("b-") == 70
    assert kern_midi("4f#L") == 66
    assert kern_midi("AA") == 45  # A2


def test_read_kern_chords_rests_and_staves():
    text = "**kern\t**kern\n*clefF4\t*clefG2\n*M2/4\t*M2/4\n2C\t4e 4g\n.\t4r\n=1\t=1\n2D\t2f\n*-\t*-\n"
    s = read_kern(text)
    assert s.measures == 2 and s.staves == 2
    top = [e for e in s.events if e.staff == 1 and e.measure == 1]
    assert sorted(e.midi for e in top if not e.is_rest) == [64, 67]  # hợp âm cùng thời điểm 0
    assert any(e.is_rest and e.onset == 1 for e in top)
    bottom = [e for e in s.events if e.staff == 2 and e.measure == 1]
    assert [e.midi for e in bottom] == [48]  # spine trái = khuông dưới, C = C3


def test_read_kern_spine_split_and_ties():
    text = "**kern\n*\n*^\n4c\t2e\n4d\t.\n*v\t*v\n=1\n[2g\n=2\n2g]\n=3\n*-\n"
    s = read_kern(text)
    m1 = sorted((e.onset, e.midi) for e in s.events if e.measure == 1)
    assert m1 == [(0, 60), (0, 64), (1, 62)]
    tied = [e for e in s.events if e.measure == 3]
    assert tied and tied[0].tie_stop
    assert attacks(s.measure_events(3), 1) == []


def test_ground_truth_dang_is_consistent():
    s = load_score(GT_DANG)
    assert s.measures == 32 and s.key_fifths == -1 and s.time_signature == "3/4"
    for m, events in s.by_measure().items():
        assert max(e.onset + e.duration for e in events) == 3, m


def test_compare_identical_is_perfect():
    s = load_score(GT_DANG)
    r = compare(s, s).to_dict()
    assert r["noteF1"] == 1.0 and r["ser"] == 0.0 and r["chordAccuracy"] == 1.0 and r["measureExactRate"] == 1.0


def test_compare_separates_structure_from_symbols():
    ref = read_kern(kern(["2f", "4g"], ["2a", "4f"], ["2.c"]))
    # model đọc lặp ô 1-2 (lỗi "lạc chỗ"): nốt đúng nhưng thừa ô
    hyp = read_kern(kern(["2f", "4g"], ["2a", "4f"], ["2f", "4g"], ["2a", "4f"], ["2.c"]))
    pairs = align_measures(ref, hyp)
    assert sum(1 for r, h in pairs if r is None) == 2
    res = compare(ref, hyp)
    assert res.note_recall == 1.0 and res.pitch_accuracy == 1.0
    assert res.note_precision < 0.7 and res.extra_measures == 2 and res.ser > 0.5


def test_compare_counts_octave_and_duration_errors():
    ref = read_kern(kern(["2f 2a", "4g"]))
    hyp = read_kern(kern(["2ff 2a", "8g", "8r"]))
    res = compare(ref, hyp)
    assert res.octave_errors == 1
    assert res.duration_errors == 1
    assert res.to_dict()["chordAccuracy"] == 0.0


def test_read_musicxml_matches_kern():
    xml = score(part("P1", 1, ("G", 2), [[note("F", 4, 2), note("G", 4, 1)], [note("A", 4, 3)]], beats=3))
    s = read_musicxml(xml)
    k = read_kern(kern(["2f", "4g"], ["2.a"], header="**kern\n*clefG2\n*M3/4"))
    assert compare(k, s).note_f1 == 1.0


def test_text_metrics_vietnamese():
    assert cer("Nguyện dâng", "Nguyện dâng").rate == 0
    # NFD và NFC phải coi là một
    import unicodedata

    assert cer("Chúa", unicodedata.normalize("NFD", "Chúa")).rate == 0
    assert cer("đôi", "doi").errors == 2
    assert strip_diacritics("Nguyện đôi") == "Nguyen doi"
    assert wer("bàn tay con hiến.", "bàn tay con hiến", punctuation=False).rate == 0


def test_lyrics_alignment_uses_measure_pairs():
    ref = [Lyric(1, 1, 1, "Nguyện"), Lyric(1, 2, 1, "dâng"), Lyric(2, 1, 1, "Chúa")]
    hyp = [Lyric(1, 1, 1, "Nguyện"), Lyric(1, 2, 1, "dâng"), Lyric(3, 1, 1, "Chúa")]
    # ô 2 của hyp là ô thừa, ô 3 của hyp ứng với ô 2 của ref
    res = compare_lyrics(ref, hyp, measure_pairs=[(1, 1), (None, 2), (2, 3)])
    assert res.placed_ok == 3
    assert compare_lyrics(ref, hyp).placed_ok == 2


@pytest.mark.parametrize("bad", ["x.mid", "x.pdf"])
def test_load_score_rejects_other_formats(tmp_path, bad):
    path = tmp_path / bad
    path.write_text("")
    with pytest.raises(ValueError):
        load_score(path)
