"""Dò vạch nhịp, đếm ô nhịp từng hệ (app/omr/barlines.py) trên trang tổng hợp đã qua tiền xử lý như trong pipeline."""

import json

from app.omr.layout import analyze_layout
from app.omr.preprocess import PreprocessOptions, process_page
from tests.synth import make_melody_page, make_score_page, make_vocal_page


def page_image(gray):
    result = process_page(gray, PreprocessOptions(source_type="SCAN"), 1)
    assert result.image is not None
    return result.image


def test_melody_page_counts_measures_per_system():
    layout = analyze_layout(page_image(make_melody_page(measures=(4, 5, 3))))
    assert layout.measure_counts == [4, 5, 3]
    assert layout.bars_confident
    assert layout.measure_count == 12


def test_stems_spanning_the_staff_clef_and_flags_are_not_barlines():
    # mỗi ô có một nốt trắng thân phủ kín khuông, một nốt móc đơn có cờ; hệ nào cũng có khóa Sol giả vượt khỏi khuông
    layout = analyze_layout(page_image(make_melody_page(measures=(2, 6))))
    assert layout.measure_counts == [2, 6]
    for system in layout.systems:
        assert len(system.barlines) == system.measures
        assert system.barlines == sorted(system.barlines)


def test_final_double_barline_counts_once():
    single = analyze_layout(page_image(make_melody_page(measures=(3,), final_double=False)))
    double = analyze_layout(page_image(make_melody_page(measures=(3,), final_double=True)))
    assert single.measure_counts == double.measure_counts == [3]


def test_system_without_closing_barline_is_not_trusted():
    layout = analyze_layout(page_image(make_melody_page(measures=(4, 3), close_last=False)))
    assert layout.measure_counts == [4, 3]  # vẫn đếm (thêm 1 cho ô chưa đóng)
    assert not layout.systems[1].bars_closed
    assert not layout.bars_confident
    assert layout.measure_count is None


def test_vocal_and_piano_systems_agree_across_staves():
    layout = analyze_layout(page_image(make_vocal_page(bars=4)))
    assert layout.staff_counts == [3, 3, 3, 3]
    assert layout.measure_counts == [4, 4, 4, 4]
    assert layout.measure_count == 16


def test_grand_staff_barlines():
    layout = analyze_layout(page_image(make_vocal_page(staves=2, bars=3)))
    assert layout.measure_counts == [3, 3, 3, 3]
    assert layout.bars_confident


def test_pages_without_barlines_keep_old_behaviour():
    for gray in (make_vocal_page(), make_score_page()):
        layout = analyze_layout(page_image(gray))
        assert layout.confident  # bố cục khuông vẫn tin được như trước
        assert not layout.bars_confident
        assert layout.measure_count is None


def test_layout_json_has_measure_fields():
    data = json.loads(analyze_layout(page_image(make_melody_page(measures=(2, 3)))).to_json())
    assert data["measureCount"] == 5
    assert [s["measures"] for s in data["systems"]] == [2, 3]
    assert all(s["barsClosed"] for s in data["systems"])
    assert all(len(s["barlines"]) == s["measures"] for s in data["systems"])


def test_closing_barline_beyond_a_shortened_staff_is_kept():
    # bản quét cũ: dòng kẻ của một hệ đứt sớm hơn vạch kết; mép phải theo các hệ khác của trang
    image = page_image(make_melody_page(measures=(3, 3)))
    layout = analyze_layout(image)
    assert layout.measure_counts == [3, 3]
    system = layout.systems[1]
    top, bottom = int(system.top), int(system.bottom)
    last = system.barlines[-1]
    broken = image.copy()
    broken[top - 2 : bottom + 3, last - 40 : last - 4] = 0 if image.max() == 1 else 255  # xóa đoạn dòng kẻ cuối hệ
    after = analyze_layout(broken)
    assert after.measure_counts == [3, 3]
    assert after.systems[1].bars_closed
