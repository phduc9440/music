"""So sánh bản OMR với bản đã sửa (app/analysis/diff.py). Chỉ dùng thư viện chuẩn nên chạy được không cần music21."""

import pytest

from app.analysis import diff
from app.convert.errors import ConversionError
from tests.xml_samples import note, part, rest, score


def write(tmp_path, name, *measures):
    path = tmp_path / name
    path.write_bytes(score(part("P1", 1, ("G", 2), [list(m) for m in measures], beats=4)))
    return path


def bar(*notes):
    return list(notes)


A = bar(note("C", 4, 1), note("D", 4, 1), note("E", 4, 1), note("F", 4, 1))
B = bar(note("G", 4, 2), note("A", 4, 2))
C = bar(note("E", 5, 4))
D = bar(note("B", 3, 2), note("D", 4, 2))


def run(tmp_path, base, target):
    return diff.diff_files(write(tmp_path, "a.musicxml", *base), write(tmp_path, "b.musicxml", *target))


def test_identical_scores_have_no_edits(tmp_path):
    result = run(tmp_path, [A, B, C], [A, B, C])
    assert [m["status"] for m in result["measures"]] == ["same"] * 3
    assert result["summary"]["measureEditRate"] == 0.0
    assert result["summary"]["noteErrors"] == 0


def test_repeated_measure_from_omr_is_reported_as_deleted(tmp_path):
    result = run(tmp_path, [A, B, B, C], [A, B, C])  # OMR lặp ô B, người dùng xóa
    statuses = [(m["base"], m["target"], m["status"]) for m in result["measures"]]
    assert statuses.count((None, None, "same")) == 0
    assert sum(1 for m in result["measures"] if m["status"] == "deleted") == 1
    assert result["summary"]["deleted"] == 1 and result["summary"]["same"] == 3
    assert result["summary"]["baseMeasures"] == 4 and result["summary"]["targetMeasures"] == 3
    assert result["summary"]["measureEditRate"] == 0.25


def test_missing_measure_is_reported_as_added(tmp_path):
    result = run(tmp_path, [A, C], [A, B, C])
    added = [m for m in result["measures"] if m["status"] == "added"]
    assert len(added) == 1 and added[0]["target"] == 2 and added[0]["base"] is None


def test_pitch_accidental_and_duration_errors_in_one_measure(tmp_path):
    wrong = bar(note("C", 4, 1), note("E", 4, 1), note("E", 4, 2))  # D4->E4 (sai bậc), E4 dài 1 -> 2
    right = bar(note("C", 4, 1), note("D", 4, 1), note("E", 4, 1), note("F", 4, 1, alter=1))
    result = run(tmp_path, [wrong], [right])
    (row,) = result["measures"]
    assert row["status"] == "edited"
    kinds = {e["type"] for e in row["errors"]}
    assert "PITCH" in kinds or "MISSING" in kinds
    assert result["summary"]["edited"] == 1


def test_error_types_are_classified(tmp_path):
    base = bar(note("C", 4, 1), note("D", 4, 1), note("E", 4, 1), note("G", 4, 1))
    target = bar(
        note("C", 4, 1, alter=1),  # đúng bậc, thêm dấu thăng
        note("D", 4, 2),  # đúng nốt, sai trường độ
        note("F", 4, 1),  # G4 -> F4 sai cao độ (cùng vị trí 3)
    )
    (row,) = run(tmp_path, [base], [target])["measures"]
    by_type = {e["type"]: e for e in row["errors"]}
    assert by_type["ACCIDENTAL"]["base"] == "C4" and by_type["ACCIDENTAL"]["target"] == "C#4"
    assert by_type["DURATION"]["base"] == "D4"
    assert by_type["PITCH"]["base"] == "G4" and by_type["PITCH"]["target"] == "F4"
    assert by_type["EXTRA"]["base"] == "E4"  # nốt OMR sinh thừa (E4 ở vị trí 2 không còn trong bản sửa)


def test_missing_note_and_timing_shift(tmp_path):
    base = bar(note("C", 4, 1), rest(1), note("E", 4, 2))
    target = bar(note("C", 4, 1), note("E", 4, 1), rest(1), note("A", 4, 1))
    (row,) = run(tmp_path, [base], [target])["measures"]
    kinds = sorted(e["type"] for e in row["errors"])
    assert kinds.count("TIMING") + kinds.count("DURATION") >= 1
    assert "MISSING" in kinds  # A4 OMR bỏ sót


def test_tied_notes_are_merged_before_comparing(tmp_path):
    tied = [bar(note("C", 4, 2, ties=("start",))), bar(note("C", 4, 2, ties=("stop",)))]
    long = [bar(note("C", 4, 2)), bar(rest(2))]
    result = run(tmp_path, tied, tied)
    assert result["summary"]["measureEditRate"] == 0.0
    assert diff.load_measures(write(tmp_path, "t.musicxml", *tied))[0][0].length == 4
    assert diff.load_measures(write(tmp_path, "l.musicxml", *long))[0][0].length == 2


def test_rate_summary(tmp_path):
    result = run(tmp_path, [A, B, B, C, D], [A, B, C, D])
    s = result["summary"]
    assert s["same"] == 4 and s["deleted"] == 1
    assert s["noteErrors"] == 2  # ô B thừa có 2 nốt
    assert s["noteErrorRate"] == round(2 / s["baseNotes"], 4)


def test_entity_declaration_is_rejected(tmp_path):
    bad = tmp_path / "bad.musicxml"
    bad.write_bytes(b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><score-partwise/>')
    ok = write(tmp_path, "ok.musicxml", A)
    with pytest.raises(ConversionError):
        diff.diff_files(bad, ok)


def test_non_partwise_is_rejected(tmp_path):
    other = tmp_path / "x.musicxml"
    other.write_bytes(b"<score-timewise/>")
    with pytest.raises(ConversionError):
        diff.load_measures(other)
