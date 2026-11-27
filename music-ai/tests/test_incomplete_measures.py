"""Ô nhịp thiếu hợp lệ: ô lấy đà, ô cuối và ô bị vạch nhịp chia đôi (app/convert/incomplete_measures.py và nơi dùng)."""

from __future__ import annotations

from fractions import Fraction

from app.convert import incomplete_measures as im
from app.omr import measure_map, merge, review, rhythm_fix
from tests.kern_samples import kern

F = Fraction
WHOLE = F(1)


# ------------------------------------------------------------------ quy tắc


def test_pickup_split_pair_and_closing_measure():
    # lấy đà 1/8 | đủ | đủ | 1/2 (cuối phiên khúc) | 1/2 (đầu điệp khúc) | đủ | 7/8 (bù cho ô lấy đà)
    lengths = [F(1, 8), WHOLE, WHOLE, F(1, 2), F(1, 2), WHOLE, F(7, 8)]
    roles = im.classify(lengths, [WHOLE] * len(lengths))
    assert roles == {0: im.PICKUP, 3: im.SPLIT_HEAD, 4: im.SPLIT_TAIL, 6: im.CLOSING}
    assert im.split_partner(roles, 3) == 4 and im.split_partner(roles, 4) == 3 and im.split_partner(roles, 0) is None


def test_uneven_split_counts_when_the_halves_add_up():
    lengths = [WHOLE, F(3, 4), F(1, 4), WHOLE]
    assert im.classify(lengths, [WHOLE] * 4) == {1: im.SPLIT_HEAD, 2: im.SPLIT_TAIL}


def test_lonely_short_measure_is_still_a_mistake():
    lengths = [WHOLE, F(3, 4), WHOLE, F(1, 2), F(1, 4), WHOLE]
    assert im.classify(lengths, [WHOLE] * 6) == {}


def test_halves_must_share_the_meter_and_be_known():
    assert im.classify([WHOLE, F(1, 2), F(1, 4), WHOLE], [WHOLE, WHOLE, F(3, 4), F(3, 4)]) == {}
    assert im.classify([WHOLE, F(1, 2), None, WHOLE], [WHOLE] * 4) == {}
    assert im.classify([WHOLE, F(1, 2), F(1, 2), WHOLE], [WHOLE, None, None, WHOLE]) == {}


def test_a_run_of_half_measures_is_a_wrong_meter_not_split_measures():
    # 2/4 đọc thành 4/4: mọi ô chỉ dài một nửa, không cặp nào được coi là ô chia đôi
    lengths = [WHOLE, F(1, 2), F(1, 2), F(1, 2), F(1, 2), F(1, 2), WHOLE]
    assert im.classify(lengths, [WHOLE] * 7) == {}
    lengths = [WHOLE, F(1, 2), F(1, 2), F(1, 2), WHOLE]
    assert im.classify(lengths, [WHOLE] * 5) == {}


def test_split_next_to_the_edges_of_the_piece():
    assert im.classify([F(1, 2), F(1, 2), WHOLE], [WHOLE] * 3) == {0: im.PICKUP}  # ô đầu luôn là ô lấy đà
    assert im.classify([WHOLE, F(1, 2), F(1, 2)], [WHOLE] * 3) == {1: im.SPLIT_HEAD, 2: im.SPLIT_TAIL}
    lengths = [F(1, 4), F(1, 2), F(1, 2), WHOLE, F(3, 4)]  # ngay sau ô lấy đà, trước ô cuối bù cho nó
    assert im.classify(lengths, [WHOLE] * 5) == {0: im.PICKUP, 1: im.SPLIT_HEAD, 2: im.SPLIT_TAIL, 4: im.CLOSING}


def test_short_last_measure_is_closing_only_when_it_completes_the_pickup():
    assert im.classify([F(1, 4), WHOLE, F(3, 4)], [WHOLE] * 3) == {0: im.PICKUP, 2: im.CLOSING}
    assert im.classify([F(1, 4), WHOLE, F(1, 2)], [WHOLE] * 3) == {0: im.PICKUP}
    assert im.classify([WHOLE, WHOLE, F(1, 2)], [WHOLE] * 3) == {}


# ------------------------------------------------------------------ kern

# Giai điệu một khuông rồi điệp khúc hai khuông (khuông dưới được đệm dấu lặng ở phiên khúc), giống bố cục bài hát
# lễ có phiên khúc một bè và điệp khúc piano: ô 4 (2 phách) + ô 5 (2 phách) là một ô 4/4 bị vạch nhịp chia đôi.
SONG = kern(
    "**kern|**kern",
    "*clefF4|*clefG2",
    "*M4/4|*M4/4",
    "8r|8d",
    "=1|=1",
    "1r|1g",
    "=2|=2",
    "1r|2a",
    ".|2b-",
    "=3|=3",
    "2r|2a",
    "=4|=4",
    "4G|4g",
    "4F#|4a",
    "=5|=5",
    "1G|1b-",
    "=6|=6",
    "2.G|2.g",
    "8G|8g",
    "==|==",
    "*-|*-",
)


def _merged(text: str) -> merge.MergeResult:
    page, _ = merge.clean_page(1, text)
    assert page is not None
    return merge.merge_pages([page], lenient=True)


def test_split_halves_are_not_reported_but_lonely_short_measures_are():
    result = _merged(SONG)
    assert merge.incomplete_roles(result) == {1: im.PICKUP, 4: im.SPLIT_HEAD, 5: im.SPLIT_TAIL, 7: im.CLOSING}
    assert merge.check_measures(result) == [] and merge.bad_measures(result) == []

    lonely = _merged(SONG.replace("4G\t4g\n4F#\t4a\n", "1G\t1g\n"))  # điệp khúc mở đầu bằng ô đủ: ô 4 thiếu thật
    assert merge.bad_measures(lonely) == [4]


def test_measure_length_follows_the_humdrum_timeline_through_split_spines():
    # bè dưới tách đôi: 8F (bè 1) và 4F (bè 2), model gộp lại ngay sau móc đơn rồi viết tiếp nốt của bè 1
    lines = [
        "8E-\t8g",
        "8E-\t8g",
        "8E-\t8g",
        "8E-\t8g",
        "*^\t*",
        "8F\t4F\t8f",
        "*v\t*v\t*",
        "8G\t8e-",
        "4F 4A\t8f",
        ".\t8g",
    ]
    assert merge.measure_length(lines, 2) == WHOLE
    assert merge.measure_length(["4c\t2e", "4d\t."], 2) == F(1, 2)
    assert merge.measure_length(["4c\t4e", "4d\t."], 2) is None  # hai khuông dài khác nhau


def test_slices_carry_the_length_a_split_half_must_keep():
    pieces = review.slice_measures(_merged(SONG))
    by_ordinal = {p.ordinal: p for p in pieces}
    assert by_ordinal[4].role == im.SPLIT_HEAD and by_ordinal[4].target == F(1, 2)
    assert by_ordinal[5].role == im.SPLIT_TAIL and by_ordinal[5].target == F(1, 2)
    assert by_ordinal[2].role is None and by_ordinal[2].target == WHOLE
    # cách đọc khác kéo phần đầu thành đủ 4/4 thì hai phần không còn ghép được: không coi là "đúng hơn"
    assert review.chunk_duration_ok(["2r\t1a"], 2, by_ordinal[4].target) is False
    assert review.chunk_duration_ok(["2r\t2a"], 2, by_ordinal[4].target) is True


def test_rhythm_fix_does_not_fill_a_split_half_with_a_dot():
    # 3/4 + 1/4 của cùng một ô: "2 4" không phải "2. 4" bị mất chấm
    lines = ["*M4/4", "1c", "=", "2d", "4e", "=", "4f", "=", "1g", "=="]
    out, dots, touched = rhythm_fix.fix_dots(lines, 1)
    assert out == lines and dots == 0 and touched == []
    # cùng ô thiếu nhưng ô sau đủ: vẫn là mất chấm dôi
    lines = ["*M4/4", "1c", "=", "2d", "4e", "=", "1f", "=", "1g", "=="]
    out, dots, touched = rhythm_fix.fix_dots(lines, 1)
    assert out[3] == "2.d" and dots == 1 and touched == [2]


def test_measure_map_explains_split_halves_without_flagging_them():
    result = _merged(SONG)
    page = merge.clean_page(1, SONG)[0]
    entries, _check = measure_map.build(result, [page], {}, {})
    by_measure = {e["measure"]: e for e in entries}
    for measure in (4, 5):
        assert by_measure[measure]["flags"] == []
        assert "Ô 4 và ô 5" in by_measure[measure]["_notes"][0]
    review.annotate(entries, result)
    assert by_measure[4]["confidence"] == 1.0 and by_measure[4]["reasons"][0].startswith("Ô 4 và ô 5")
    assert "_notes" not in by_measure[1] and by_measure[1]["flags"] == []


# ------------------------------------------------------------------ xuất MusicXML (cần music21)


def _export(tmp_path, text: str):
    import pytest

    pytest.importorskip("music21")
    import xml.etree.ElementTree as ET

    from app.convert.kern import kern_file_to_musicxml_file
    from app.convert.midi import musicxml_file_to_midi_file

    source = tmp_path / "merged.krn"
    source.write_text(_merged(text).text, encoding="utf-8")
    out = tmp_path / "v1.musicxml"
    kern_file_to_musicxml_file(source, out, 60)
    midi = musicxml_file_to_midi_file(out, tmp_path / "v1.mid", 60)
    return ET.fromstring(out.read_bytes()).find("part").findall("measure"), midi


def _hidden_rests(measure) -> int:
    return sum(1 for n in measure.findall("note") if n.find("rest") is not None and n.get("print-object") == "no")


def test_export_keeps_split_halves_short_so_playback_does_not_stop(tmp_path):
    measures, midi = _export(tmp_path, SONG)
    implicit = [m.get("implicit") for m in measures]
    assert implicit == ["yes", "no", "no", "yes", "yes", "no", "yes"]  # lấy đà, hai phần ô chia đôi, ô cuối
    assert [_hidden_rests(m) for m in measures] == [0] * 7
    # 60 BPM: 1/2 + 4 + 4 + 2 + 2 + 4 + 3.5 = 20 phách, không có khoảng lặng chèn thêm giữa hai đoạn
    assert midi.seconds == 20


def test_export_still_fills_a_lonely_short_measure(tmp_path):
    measures, _midi = _export(tmp_path, SONG.replace("4G\t4g\n4F#\t4a\n", "1G\t1g\n"))
    assert measures[3].get("implicit") == "no" and _hidden_rests(measures[3]) > 0
