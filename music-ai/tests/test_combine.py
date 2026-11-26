"""Ghép kern các nhóm khuông đọc riêng của cùng một hệ (app/omr/combine.py)."""

from fractions import Fraction

import pytest

from app.omr import combine, merge
from tests.kern_samples import PIANO_ONLY, T, VOICE_ONLY, kern


def page(text):
    return merge.clean_page(1, text)[0]


def test_streams_are_interleaved_by_onset_with_piano_columns_first():
    result, warnings = combine.combine_streams([page(PIANO_ONLY), page(VOICE_ONLY)], 1)
    assert warnings == []
    assert result.header == f"**kern{T}**kern{T}**kern"
    assert result.body == [
        f"*clefF4{T}*clefG2{T}*clefG2",
        f"*k[f#]{T}*k[f#]{T}*k[f#]",
        f"*M3/4{T}*M3/4{T}*M3/4",
        f"2G{T}4g{T}2b",
        f".{T}4a{T}.",
        f"4B{T}4b{T}4cc",
        f"={T}={T}=",
    ]
    assert merge.measure_stats(merge.merge_pages([result])) == (1, 0)


def test_missing_prologue_kinds_fall_back_to_shared_values_and_treble_clef():
    voice = kern("**kern", "=1", "2b", "4cc", "=2")
    result, _ = combine.combine_streams([page(PIANO_ONLY), page(voice)], 1)
    assert result.body[0] == f"*clefF4{T}*clefG2{T}*clefG2"
    assert result.body[1] == f"*k[f#]{T}*k[f#]{T}*k[f#]"
    assert result.body[2] == f"*M3/4{T}*M3/4{T}*M3/4"


def test_different_measure_counts_are_rejected():
    two_measures = kern("**kern", "*M3/4", "=1", "2b", "4cc", "=2", "2b", "4cc", "=3")
    with pytest.raises(combine.CombineError, match="số ô nhịp khác nhau"):
        combine.combine_streams([page(PIANO_ONLY), page(two_measures)], 1)


def test_wrong_duration_stream_keeps_its_notes_with_warning():
    # lệch trường độ (thường chỉ do một nhóm liên ba/chấm dôi đọc sai): giữ nốt, không thay cả khuông bằng dấu lặng
    short_voice = kern("**kern", "*M3/4", "=1", "4b", "=2")
    result, warnings = combine.combine_streams([page(PIANO_ONLY), page(short_voice)], 1)
    assert f"2G{T}4g{T}4b" in result.body
    assert warnings and "giữ nguyên nốt" in warnings[0]


def test_garbage_stream_twice_too_long_is_replaced_by_a_measure_rest():
    long_voice = kern("**kern", "*M3/4", "=1", "2.b", "2.cc", "=2")
    result, warnings = combine.combine_streams([page(PIANO_ONLY), page(long_voice)], 1)
    assert f"2G{T}4g{T}2.r" in result.body
    assert warnings and "dấu lặng trọn ô" in warnings[0]


def test_rest_only_stream_is_spread_over_the_measures_of_the_first_stream():
    # khuông giọng im trong đoạn dạo đầu: model gộp hai ô nghỉ thành một
    piano = kern("**kern|**kern", "*M3/4|*M3/4", "=1|=1", "2G|2.g", "4B|.", "=2|=2", "2.G|2.b", "=3|=3")
    voice = kern("**kern", "*M3/4", "=1", "2.r", "=2")
    result, _ = combine.combine_streams([page(piano), merge.clean_page(1, voice, allow_rests_only=True)[0]], 1)
    assert merge.count_measures(result.body) == 2
    assert f"2G{T}2.g{T}2.r" in result.body and f"2.G{T}2.b{T}2.r" in result.body


def test_unalignable_measures_are_rejected():
    split = kern("**kern|**kern", "*M3/4|*M3/4", "=1|=1", "4G|4g", "*^|*", "4B|4b|4d", "*v|*v|*", "=2|=2")
    with pytest.raises(combine.CombineError, match="giữa ô nhịp"):
        combine.combine_streams([page(split), page(VOICE_ONLY)], 1)
    ragged = kern("**kern|**kern", "*M3/4|*M3/4", "=1|=1", "4G|4g|4a", "=2|=2")
    with pytest.raises(combine.CombineError):
        combine.combine_streams([page(ragged), page(VOICE_ONLY)], 1)


def test_row_onsets_follow_the_shortest_open_note():
    rows, total = combine.row_onsets(["2G\t4g", ".\t4a", "4B\t4b"], 2)
    assert [onset for onset, _ in rows] == [Fraction(0), Fraction(1, 4), Fraction(1, 2)]
    assert total == Fraction(3, 4)


def test_final_double_barline_of_first_stream_is_kept():
    piano = kern("**kern|**kern", "*M3/4|*M3/4", "=1|=1", "2G|4g", ".|4a", "4B|4b", "==|==")
    result, _ = combine.combine_streams([page(piano), page(VOICE_ONLY)], 1)
    assert result.body[-1] == f"=={T}=={T}=="
