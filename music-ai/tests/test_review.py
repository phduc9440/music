"""Chấm tin cậy từng ô nhịp bằng luật nhạc lý (app/omr/review.py)."""

from __future__ import annotations

from fractions import Fraction

from app.omr import merge, review
from tests.kern_samples import kern


def _merged(text: str) -> merge.MergeResult:
    page, _ = merge.clean_page(1, text)
    return merge.merge_pages([page])


def _melody(*measures: str, meter: str = "3/4", clef: str = "*clefG2", key: str = "*k[]") -> merge.MergeResult:
    rows = ["**kern", clef, key, f"*M{meter}"]
    for number, notes in enumerate(measures, start=1):
        rows += notes.split()
        rows.append("==" if number == len(measures) else f"={number + 1}")
    rows.append("*-")
    return _merged(kern(*rows))


def _entries(result: merge.MergeResult) -> list[dict]:
    count = merge.count_measures(result.lines)
    return [{"measure": m, "page": 1, "system": 1, "box": [0, 0, 10, 10], "flags": []} for m in range(1, count + 1)]


def test_parse_note_octaves_and_accidentals():
    assert review.parse_note("4c", {}).midi == 60
    assert review.parse_note("4cc", {}).midi == 72
    assert review.parse_note("4C", {}).midi == 48
    assert review.parse_note("8f#L", {}).midi == 66
    assert review.parse_note("2b-", {}).midi == 70
    # Hóa biểu áp vào nốt không ghi dấu hóa; dấu bình ghi rõ thì bỏ hóa biểu
    assert review.parse_note("4b", {"b": -1}).midi == 70
    assert review.parse_note("4bn", {"b": -1}).midi == 71
    assert review.parse_note("4r", {}) is None
    assert review.parse_note(".", {}) is None


def test_normalize_ignores_stems_beams_and_ties():
    assert review.normalize_token("8ccL/") == review.normalize_token("8cc\\J")
    assert review.normalize_token("[4g") == review.normalize_token("4g]")
    assert review.normalize_token("4c 4e") == review.normalize_token("4e 4c")
    assert review.normalize_token("4c") != review.normalize_token("4cc")
    assert review.normalize_token("4c") != review.normalize_token("8c")


def test_slice_measures_numbers_like_page_measure_ranges():
    result = _melody("4c 4d 4e", "2f 4g", "2.c")
    slices = review.slice_measures(result)
    assert [s.ordinal for s in slices] == [1, 2, 3]
    assert slices[0].meter == Fraction(3, 4)
    assert review.normalize_lines(slices[1].lines(result)) == ("2f", "4g")


def test_clean_melody_gets_full_confidence():
    result = _melody("4c 4d 4e", "2f 4g", "4a 4g 4f", "2.e")
    entries = review.annotate(_entries(result), result)
    assert all(e["flags"] == [] and e["confidence"] == 1.0 for e in entries)


def test_octave_slip_is_flagged_as_range_and_leap():
    # Ô 2: G4 bị đọc thành G6 (lời ca/dấu thanh đọc thành dòng kẻ phụ)
    result = _melody("4c 4d 4e", "2f 4ggg", "4a 4g 4f", "2.e")
    entries = review.annotate(_entries(result), result)
    second = entries[1]
    assert review.FLAG_RANGE in second["flags"]
    assert review.FLAG_LEAP in second["flags"]
    assert second["confidence"] < review.REVIEW_THRESHOLD
    assert any("G6" in r for r in second["reasons"])
    assert entries[0]["flags"] == [] and entries[2]["flags"] == []


def test_spike_back_and_forth_is_flagged_even_within_range():
    # E5 giữa hai C4/D4: vọt lên 16/14 nửa cung rồi quay lại
    result = _melody("4c 4ee 4d", "2.c")
    entries = review.annotate(_entries(result), result)
    assert review.FLAG_LEAP in entries[0]["flags"]
    assert review.FLAG_RANGE not in entries[0]["flags"]


def test_bass_clef_uses_bass_range():
    result = _melody("4C 4D 4E", "2.F", clef="*clefF4")
    entries = review.annotate(_entries(result), result)
    assert all(review.FLAG_RANGE not in e["flags"] for e in entries)


def test_piano_spines_are_not_range_checked():
    text = kern(
        "**kern|**kern",
        "*clefF4|*clefG2",
        "*M2/4|*M2/4",
        "4CC|4ccc",
        "4C|4c",
        "==|==",
        "*-|*-",
    )
    result = _merged(text)
    entries = review.annotate(_entries(result), result, ["PIANO", "PIANO"])
    assert entries[0]["flags"] == []


def test_vocal_spine_of_voice_plus_piano_is_checked():
    text = kern(
        "**kern|**kern|**kern",
        "*clefF4|*clefG2|*clefG2",
        "*M2/4|*M2/4|*M2/4",
        "2C|2c|4c",
        ".|.|4ggg",
        "==|==|==",
        "*-|*-|*-",
    )
    result = _merged(text)
    entries = review.annotate(_entries(result), result, ["SINGLE", "PIANO", "PIANO"])
    assert review.FLAG_RANGE in entries[0]["flags"]


def test_rare_out_of_key_accidental_is_flagged_once():
    measures = ["4c 4d 4e"] * 9 + ["4c 4d# 4e", "2.c"]
    result = _melody(*measures)
    entries = review.annotate(_entries(result), result)
    assert review.FLAG_ACCIDENTAL in entries[9]["flags"]
    assert all(review.FLAG_ACCIDENTAL not in e["flags"] for i, e in enumerate(entries) if i != 9)


def test_existing_flags_keep_their_reasons_and_lower_confidence():
    result = _melody("4c 4d 4e", "2.c")
    entries = _entries(result)
    entries[0]["flags"] = [review.FLAG_DURATION]
    review.annotate(entries, result)
    assert entries[0]["confidence"] == round(1 - review.FLAG_WEIGHTS[review.FLAG_DURATION], 2)
    assert entries[0]["reasons"]


def test_annotate_is_idempotent_and_public_entries_hide_internal_keys():
    result = _melody("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    review.annotate(entries, result)
    first = [dict(e) for e in entries]
    entries[0]["_stable"] = True
    review.annotate(entries, result)
    assert entries[1]["flags"] == first[1]["flags"]
    public = review.public_entries(entries)
    assert all(not k.startswith("_") for e in public for k in e)


def test_summary_counts_flags():
    result = _melody("4c 4d 4e", "2f 4ggg", "2.c")
    entries = review.annotate(_entries(result), result)
    data = review.summary(entries)
    assert data["measures"] == 3
    assert data["flagged"] == 1
    assert data["byFlag"][review.FLAG_RANGE] == 1


def test_chunk_duration_ok():
    meter = Fraction(3, 4)
    assert review.chunk_duration_ok(["4c", "4d", "4e"], 1, meter) is True
    assert review.chunk_duration_ok(["4c", "4d"], 1, meter) is False
    assert review.chunk_duration_ok(["4c", "4d"], 1, meter, lenient=True) is True
    assert review.chunk_duration_ok(["4c"], 1, None) is None


def test_replace_measure_keeps_barlines_and_rebuilds_text():
    result = _melody("4c 4d 4e", "2f 4ggg", "2.c")
    piece = review.slice_measures(result)[1]
    fixed = review.replace_measure(result, piece, ["2f", "4g"])
    assert review.normalize_lines(review.slice_measures(fixed)[1].lines(fixed)) == ("2f", "4g")
    assert merge.count_measures(fixed.lines) == 3
    assert len(fixed.lines) == len(fixed.line_pages)
    assert fixed.text.startswith("**kern\n") and fixed.text.rstrip().endswith("*-")


def test_describe_lines_reads_top_staff_first():
    text = review.describe_lines(["4c\t4ee-", "4d\t4r"], 2, ["PIANO", "SINGLE"])
    assert text.startswith("khuông 1 (giọng hát/khuông đơn): Eb5 (đen), lặng (đen)")
    assert "khuông 2 (piano): C4 (đen), D4 (đen)" in text


def test_unchecked_layout_lowers_confidence_below_review_threshold_with_a_reason():
    result = _melody("4c 4d 4e", "2.e")
    entries = _entries(result)
    entries[0]["flags"] = [review.FLAG_LAYOUT]
    review.annotate(entries, result)
    assert entries[0]["confidence"] < review.REVIEW_THRESHOLD
    assert any("Bố cục trang" in r for r in entries[0]["reasons"])
    assert entries[1]["confidence"] == 1.0
