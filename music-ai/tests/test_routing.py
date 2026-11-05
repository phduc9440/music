"""Nhận diện lại theo hệ (app/omr/routing.py) với model giả: cắt trang ảo, thử lại, ghép, chọn ứng viên."""

import numpy as np

from app.omr import merge, routing
from app.omr.layout import analyze_layout
from app.omr.preprocess import TARGET_H, TARGET_W, PreprocessOptions, process_page
from tests.kern_samples import PAGE_1, PIANO_ONLY, SYSTEM_3, VOICE_ONLY
from tests.synth import make_vocal_page


def vocal_page(**kwargs):
    image = process_page(make_vocal_page(**kwargs), PreprocessOptions(source_type="SCAN"), 1).image
    return image, analyze_layout(image)


def test_bands_cover_each_system_without_overlap_and_virtual_pages_keep_scale():
    image, layout = vocal_page()
    bands = routing.system_bands(layout)
    assert len(bands) == len(layout.systems) == 4
    for (y0, y1), system in zip(bands, layout.systems):
        assert y0 < system.top and y1 > system.bottom
    assert all(a[1] <= b[0] + 1 for a, b in zip(bands, bands[1:]))
    page = routing.virtual_page(image, bands[1])
    assert page.shape == (TARGET_H, TARGET_W) and page.dtype == np.uint8
    y0, y1 = bands[1]
    # dán nguyên tỉ lệ ở gần đầu trang, phần dưới trắng
    assert np.array_equal(page[24 : 24 + (y1 - y0)], image[y0:y1])
    assert page[24 + (y1 - y0) :].min() == 255


def test_needs_fallback_by_mode_and_spines():
    _, layout = vocal_page(systems=2)
    good = merge.clean_page(1, SYSTEM_3)[0]
    bad = merge.clean_page(1, PAGE_1)[0]
    assert routing.needs_fallback("fallback", layout, bad)
    assert routing.needs_fallback("fallback", layout, None)
    assert not routing.needs_fallback("fallback", layout, good)
    assert routing.needs_fallback("always", layout, good)
    assert not routing.needs_fallback("off", layout, bad)
    _, irregular = vocal_page(first_staves=2)
    assert not routing.needs_fallback("fallback", irregular, bad)  # bố cục không tin cậy thì không đòi hỏi


def test_recognize_by_systems_stitches_systems_in_order():
    image, layout = vocal_page(systems=3)
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((index, beams))
        return SYSTEM_3, False

    page, results, warnings = routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: True)
    assert calls == [(0, None), (1, None), (2, None)]
    assert warnings == [] and all(r.attempts == 1 for r in results)
    assert page.spines == 3
    merged = merge.merge_pages([page])
    assert merge.extract_metadata(merged).measure_count == 3  # vạch nhịp trùng ở chỗ nối hệ bị bỏ
    assert merge.measure_stats(merged) == (3, 0)


def test_wrong_system_is_retried_with_beam_search_then_padded_with_warning():
    image, layout = vocal_page(systems=2)
    calls = []

    def recognize(img, index, beams, tag=None):
        if tag is None:  # bỏ qua các lần đọc riêng từng nhóm khuông (kiểm ở test riêng)
            calls.append((index, beams))
        if index == 0 and beams is None:
            return PAGE_1, False  # lần đầu mất khuông giọng
        if index == 1:
            return PAGE_1, False  # hệ 2 sai cả khi thử lại
        return SYSTEM_3, False

    page, results, warnings = routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: True)
    assert calls == [(0, None), (0, 3), (1, None), (1, 3)]
    assert [r.attempts for r in results] == [2, 2]
    assert page.spines == 3
    assert any("hệ 2" in w and "khuông trống" in w for w in warnings)


def test_no_retry_when_out_of_time():
    image, layout = vocal_page(systems=1)
    calls = []

    def recognize(img, index, beams, tag=None):
        if tag is None:
            calls.append(beams)
        return PAGE_1, False

    routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: False)
    assert calls == [None]


def test_choose_prefers_correct_structure_but_never_an_all_padded_candidate():
    good = merge.clean_page(1, SYSTEM_3)[0]
    bad = merge.clean_page(1, PAGE_1)[0]
    padded = merge.fit_page_spines(bad, 3)
    assert routing.choose(bad, good, 3, systems_ok=1.0)[0] == routing.SOURCE_SYSTEMS
    assert routing.choose(bad, padded, 3, systems_ok=0.0)[0] == routing.SOURCE_PAGE
    assert routing.choose(None, padded, 3, systems_ok=0.0)[0] == routing.SOURCE_SYSTEMS
    assert routing.choose(good, good, 3, systems_ok=1.0)[0] == routing.SOURCE_PAGE  # hòa thì giữ cả trang


def test_role_bands_split_voice_and_piano_without_overlap():
    _, layout = vocal_page(systems=2)
    groups = routing.role_groups(layout.systems[0])
    assert groups == [(0, 0, "SINGLE"), (1, 2, "PIANO")]
    bands = routing.role_bands(layout, 0)
    assert [(width, role) for width, _, role in bands] == [(1, "SINGLE"), (2, "PIANO")]
    (_, voice, _), (_, piano, _) = bands
    system = layout.systems[0]
    assert voice[0] < system.staves[0].top and voice[1] > system.staves[0].bottom
    assert voice[1] <= system.staves[1].top and piano[0] >= system.staves[0].bottom  # không lấn sang khuông khác
    assert piano[0] < system.staves[1].top and piano[1] > system.staves[2].bottom


def test_system_missing_voice_is_read_by_roles_and_combined():
    image, layout = vocal_page(systems=2)
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((index, beams, tag))
        if tag == "r2-piano":
            return PIANO_ONLY, False
        if tag == "r1-single":
            return VOICE_ONLY, False
        return PAGE_1, False  # cả hệ: mất khuông giọng, kể cả khi thử lại

    page, results, warnings = routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: True)
    assert [r.method for r in results] == ["roles", "roles"]
    assert page.spines == 3
    assert any("đã đọc riêng từng nhóm khuông" in w for w in warnings)
    assert [t for _, _, t in calls if t][:2] == ["r2-piano", "r1-single"]  # piano (khuông dưới) đọc trước
    merged = merge.merge_pages([page])
    assert merge.measure_stats(merged) == (2, 0)


def test_role_split_failure_falls_back_to_padding_with_reason():
    image, layout = vocal_page(systems=1)

    def recognize(img, index, beams, tag=None):
        return (PIANO_ONLY if tag == "r2-piano" else PAGE_1), False  # khuông giọng đọc ra 2 spine

    page, results, warnings = routing.recognize_by_systems(1, image, layout, recognize, 0, lambda: True)
    assert results[0].method == "system" and page.spines == 3
    assert any("đọc riêng nhóm khuông SINGLE ra 2 spine, cần 1" in w for w in warnings)
    assert any("khuông trống" in w for w in warnings)
