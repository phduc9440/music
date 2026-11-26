"""Phân tích bố cục (app/omr/layout.py) trên trang tổng hợp đã qua tiền xử lý như trong pipeline."""

import numpy as np
import pytest

from app.omr.layout import ROLE_PIANO, ROLE_SINGLE, analyze_layout
from app.omr.preprocess import PreprocessOptions, process_page
from tests.synth import make_score_page, make_vocal_page


def page_image(gray):
    """Ảnh trang đúng như model nhận (1050x1485) sau tiền xử lý."""
    result = process_page(gray, PreprocessOptions(source_type="SCAN"), 1)
    assert result.image is not None
    return result.image


def test_vocal_score_has_three_staves_per_system_with_voice_on_top():
    layout = analyze_layout(page_image(make_vocal_page()))
    assert layout.confident and layout.notes == []
    assert layout.staff_counts == [3, 3, 3, 3]
    assert layout.roles == [ROLE_SINGLE, ROLE_PIANO, ROLE_PIANO]
    assert 5 <= layout.interline <= 12
    # hệ xếp từ trên xuống, không chồng nhau
    tops = [s.top for s in layout.systems]
    assert tops == sorted(tops)
    assert all(a.bottom < b.top for a, b in zip(layout.systems, layout.systems[1:]))


def test_piano_score_has_grand_staff_systems():
    layout = analyze_layout(page_image(make_score_page()))
    assert layout.confident and layout.staff_counts == [2, 2, 2, 2]
    assert layout.roles == [ROLE_PIANO, ROLE_PIANO]


def test_staves_without_connector_are_separate_single_staff_systems():
    layout = analyze_layout(page_image(make_vocal_page(staves=1, systems=6, connector=False)))
    assert layout.confident and layout.staff_counts == [1] * 6
    assert layout.roles == [ROLE_SINGLE]


def test_irregular_systems_are_not_confident():
    layout = analyze_layout(page_image(make_vocal_page(first_staves=2)))
    assert layout.staff_counts == [2, 3, 3, 3]
    assert layout.staff_count is None and layout.roles is None and not layout.confident
    assert any("khác nhau" in note for note in layout.notes)


def test_missing_staff_line_and_stray_line_do_not_change_staff_count():
    layout = analyze_layout(page_image(make_vocal_page(drop_line=True, stray_line=True)))
    assert layout.staff_counts == [3, 3, 3, 3]
    first = layout.systems[0].staves[0]
    assert first.lines == 4 and first.bottom - first.top == pytest.approx(4 * layout.interline, abs=2)


def test_brace_decides_which_pair_is_piano():
    layout = analyze_layout(page_image(make_vocal_page(staves=4, brace_pair=2)))
    assert layout.roles == [ROLE_SINGLE, ROLE_SINGLE, ROLE_PIANO, ROLE_PIANO]
    layout = analyze_layout(page_image(make_vocal_page(staves=3, brace_pair=0)))
    assert layout.roles == [ROLE_PIANO, ROLE_PIANO, ROLE_SINGLE]


def test_blank_or_tiny_image_gives_empty_layout():
    for image in (np.full((1485, 1050), 255, np.uint8), np.zeros((0, 0), np.uint8)):
        layout = analyze_layout(image)
        assert layout.systems == [] and not layout.confident and layout.notes


def test_layout_json_round_trip_fields():
    layout = analyze_layout(page_image(make_vocal_page(systems=2)))
    data = layout.to_dict()
    assert data["staffCount"] == 3 and data["roles"] == ["SINGLE", "PIANO", "PIANO"] and data["confident"] is True
    assert len(data["systems"]) == 2 and len(data["systems"][0]["staves"]) == 3
    assert '"staffCount": 3' in layout.to_json()
