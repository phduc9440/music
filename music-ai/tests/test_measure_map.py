"""Căn ô kern với ô trên ảnh theo số đầu nốt khi số ô lệch (app/omr/measure_map.py)."""

from __future__ import annotations

from app.omr import measure_map, merge
from tests.kern_samples import kern


def test_missing_measure_is_located_in_its_system():
    # ảnh: 3 hệ x 3 ô; model bỏ sót ô thứ 2 của hệ đầu
    image = [(0, 4), (0, 6), (0, 3), (1, 5), (1, 2), (1, 7), (2, 4), (2, 4), (2, 8)]
    kern_counts = [4, 3, 5, 2, 7, 4, 4, 8]
    assert measure_map.estimate_system_counts(kern_counts, image, 3) == [2, 3, 3]


def test_extra_measure_goes_to_the_system_of_the_measure_before_it():
    image = [(0, 4), (0, 6), (1, 5), (1, 2)]
    kern_counts = [4, 6, 6, 5, 2]  # ô 2 bị đọc lặp
    assert measure_map.estimate_system_counts(kern_counts, image, 2) == [3, 2]


def test_poor_alignment_is_not_trusted():
    image = [(0, 1), (0, 7), (0, 21), (1, 0), (1, 14)]
    kern_counts = [12, 3, 9, 30]
    assert measure_map.estimate_system_counts(kern_counts, image, 2) is None
    assert measure_map.estimate_system_counts([1, 2, 3], [(0, 1)] * 9, 1) is None  # lệch quá nhiều ô


def test_kern_note_counts_counts_chord_notes_and_skips_rests():
    text = kern(
        "**kern|**kern",
        "*clefF4|*clefG2",
        "*M2/4|*M2/4",
        "4C 4E 4G|4c",
        "4r|4d",
        "=1|=1",
        "2C|4r",
        ".|4e",
        "=2|=2",
        "*-|*-",
    )
    page, _ = merge.clean_page(1, text)
    assert page is not None
    merged = merge.merge_pages([page])
    assert measure_map.kern_note_counts(merged, 1) == [5, 2]
