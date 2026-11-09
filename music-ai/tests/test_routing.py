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
    assert all(r.attempts >= 2 for r in results)
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


BAD_MEASURE = SYSTEM_3.replace("4dd", "8dd")  # đúng 3 spine nhưng ô nhịp của khuông giọng thiếu trường độ


def test_system_with_wrong_measure_is_read_by_roles_and_skips_beam_search():
    image, layout = vocal_page(systems=2)  # hệ 1 (chỉ số 0) ở trang 2: không được nới ô nhịp đầu/cuối
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((index, beams, tag))
        if tag == "r2-piano":
            return PIANO_ONLY, False
        if tag == "r1-single":
            return VOICE_ONLY, False
        return (BAD_MEASURE if index == 0 else SYSTEM_3), False

    page, results, _ = routing.recognize_by_systems(2, image, layout, recognize, 3, lambda: True)
    assert [r.method for r in results] == ["roles", "system"]
    assert [c for c in calls if c[0] == 0] == [(0, None, None), (0, None, "r2-piano"), (0, None, "r1-single")]
    assert not any(c[1] == 3 for c in calls)  # không tốn lần beam search
    assert merge.measure_stats(merge.merge_pages([page]), False, False)[1] == 0


def test_system_without_meter_line_is_judged_by_the_known_meter():
    image, layout = vocal_page(systems=2)
    no_meter = "\n".join(line for line in BAD_MEASURE.split("\n") if not line.startswith("*M"))
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((index, beams, tag))
        if tag == "r2-piano":
            return PIANO_ONLY, False
        if tag == "r1-single":
            return VOICE_ONLY, False
        return (no_meter if index == 0 else SYSTEM_3), False

    routing.recognize_by_systems(2, image, layout, recognize, 3, lambda: True)
    assert [c for c in calls if c[0] == 0] == [(0, None, None)]  # không biết số chỉ nhịp: không kiểm được ô nhịp

    calls.clear()
    routing.recognize_by_systems(2, image, layout, recognize, 3, lambda: True, meter="*M3/4")
    assert (0, None, "r1-single") in calls  # biết 3/4: phát hiện ô nhịp thiếu và đọc riêng
    assert routing.page_meter(merge.clean_page(1, no_meter)[0]) is None
    assert routing.page_meter(merge.clean_page(1, SYSTEM_3)[0]) == "*M3/4"


def test_roles_that_lose_a_measure_are_followed_by_beam_search():
    image, layout = vocal_page(systems=2)
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((index, beams, tag))
        if tag == "r2-piano":
            return PIANO_ONLY, False
        if tag == "r1-single":
            return VOICE_ONLY.replace("2b", "4b"), False  # lệch trường độ: ô giọng bị thay bằng dấu lặng
        if index == 0 and beams is None:
            return PAGE_1, False  # greedy mất khuông giọng
        return SYSTEM_3, False

    page, results, _ = routing.recognize_by_systems(2, image, layout, recognize, 3, lambda: True)
    assert (0, 3, None) in calls  # không dừng ở kết quả đã mất nốt
    assert results[0].method == "system" and "4b" in "\n".join(page.body)


def test_good_system_is_read_once():
    image, layout = vocal_page(systems=1)
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((beams, tag))
        return SYSTEM_3, False

    _, results, _ = routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: True)
    assert calls == [(None, None)] and results[0].attempts == 1


def test_first_and_last_measures_of_the_piece_are_not_treated_as_wrong():
    image, layout = vocal_page(systems=1)  # trang 1, hệ duy nhất: có thể là ô lấy đà / ô cuối bài
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((beams, tag))
        return BAD_MEASURE, False

    routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: True)
    assert calls == [(None, None)]


def test_roles_that_would_replace_a_measure_with_rests_do_not_beat_a_whole_system_with_right_spines():
    image, layout = vocal_page(systems=2)
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((index, beams, tag))
        if tag == "r2-piano":
            return PIANO_ONLY, False
        if tag == "r1-single":
            return VOICE_ONLY.replace("2b", "4b"), False  # trường độ khác khuông piano: sẽ bị thay bằng dấu lặng
        return (BAD_MEASURE if index == 0 else SYSTEM_3), False

    page, results, _ = routing.recognize_by_systems(2, image, layout, recognize, 3, lambda: True)
    assert results[0].method == "system"
    assert (0, 3, None) in calls  # thử beam search sau cùng
    assert "8dd" in "\n".join(page.body)  # vẫn giữ nốt đã đọc, không bị thay bằng dấu lặng


def test_measure_check_triggers_page_fallback_only_when_enabled():
    _, layout = vocal_page(systems=1)
    long_measure = merge.clean_page(1, SYSTEM_3.replace("4dd", "2dd"))[0]  # ô nhịp dài hơn số chỉ nhịp: sai cả ở rìa
    assert not routing.needs_fallback("fallback", layout, long_measure)
    assert routing.needs_fallback("fallback", layout, long_measure, check_measures=True)
    assert not routing.needs_fallback("fallback", layout, merge.clean_page(1, SYSTEM_3)[0], check_measures=True)


def test_role_split_failure_falls_back_to_padding_with_reason():
    image, layout = vocal_page(systems=1)

    def recognize(img, index, beams, tag=None):
        return (PIANO_ONLY if tag == "r2-piano" else PAGE_1), False  # khuông giọng đọc ra 2 spine

    page, results, warnings = routing.recognize_by_systems(1, image, layout, recognize, 0, lambda: True)
    assert results[0].method == "system" and page.spines == 3
    assert any("đọc riêng nhóm khuông SINGLE ra 2 spine, cần 1" in w for w in warnings)
    assert any("khuông trống" in w for w in warnings)


# ------------------------------------------------------------------ số ô nhịp theo vạch nhịp trên ảnh


def melody_page(measures=(4, 5, 3)):
    from tests.synth import make_melody_page

    image = process_page(make_melody_page(measures=measures), PreprocessOptions(source_type="SCAN"), 1).image
    return image, analyze_layout(image)


def test_page_with_extra_measures_needs_fallback_even_with_right_spines():
    from tests.kern_samples import melody

    _, layout = melody_page()
    assert routing.expected_measures(layout) == 12
    looped = merge.clean_page(1, melody(20))[0]
    right = merge.clean_page(1, melody(12))[0]
    one_off = merge.clean_page(1, melody(13))[0]  # bộ dò có thể sót một vạch: chưa đủ để nhận diện lại
    assert looped.spines == 1 and routing.page_measures(looped) == 20
    assert routing.needs_fallback("fallback", layout, looped)
    assert not routing.needs_fallback("fallback", layout, right)
    assert not routing.needs_fallback("fallback", layout, one_off)
    missing_one = merge.clean_page(1, melody(11))[0]  # thiếu ô thì không phải lỗi của bộ dò
    assert routing.needs_fallback("fallback", layout, missing_one)
    assert not routing.needs_fallback("fallback", layout, looped, check_bars=False)


def test_measures_off_needs_two_measures_and_ten_percent():
    assert not routing.measures_off(None, 12) and not routing.measures_off(12, None)
    assert routing.measures_off(14, 12) and routing.measures_off(10, 12)
    assert not routing.measures_off(13, 12)
    assert routing.measures_off(11, 12)  # thiếu một ô là đủ để đọc lại
    assert not routing.measures_off(12, 12)
    assert not routing.measures_off(62, 60) and routing.measures_off(66, 60)


def test_system_with_looped_measures_is_retried_with_beams_and_the_right_count_wins():
    from tests.kern_samples import melody

    image, layout = melody_page()
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((index, beams))
        wanted = layout.systems[index].measures
        if index == 1 and beams is None:
            return melody(wanted * 2), False  # đọc greedy lặp cả hệ
        return melody(wanted), False

    page, results, warnings = routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: True)
    assert calls == [(0, None), (1, None), (1, 3), (2, None)]
    assert [routing.page_measures(r.page) for r in results] == [4, 5, 3]
    assert routing.page_measures(page) == 12
    assert warnings == []


def test_bars_can_be_ignored_for_comparison():
    from tests.kern_samples import melody

    image, layout = melody_page()
    calls = []

    def recognize(img, index, beams, tag=None):
        calls.append((index, beams))
        return melody(layout.systems[index].measures * 2), False

    _, _, warnings = routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: True, use_bars=False)
    assert calls == [(0, None), (1, None), (2, None)]  # không biết số ô thì không thử lại
    assert warnings == []


def test_system_still_off_after_retries_is_reported():
    from tests.kern_samples import melody

    image, layout = melody_page(measures=(4, 3))

    from tests.kern_samples import kern

    pitches = "cdefgabcd"
    distinct = kern("**kern", "*clefG2", "*M3/4", *[r for i, p in enumerate(pitches) for r in (f"2.{p}", f"={i + 1}")], "*-")

    def recognize(img, index, beams, tag=None):
        return (distinct if index == 0 else melody(3)), False  # 9 ô khác nhau: không có khối lặp để bỏ

    page, results, warnings = routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: True)
    assert results[0].attempts >= 2  # 2 lần đọc cả hệ (+ các lần đọc lại từng ô nếu có)
    assert any("hệ 1: đọc ra 9 ô nhịp trong khi ảnh có 4 ô" in w for w in warnings)


def test_off_by_one_is_tolerated_when_ranking_but_big_gaps_are_not():
    from tests.kern_samples import melody

    page = lambda n: merge.clean_page(1, melody(n))[0]  # noqa: E731
    assert routing.score_page(page(5), 1, measures_expected=5).key() == routing.score_page(
        page(6), 1, measures_expected=5
    ).key()
    assert routing.score_page(page(5), 1, measures_expected=5).key() > routing.score_page(
        page(10), 1, measures_expected=5
    ).key()


def test_choose_prefers_systems_when_the_page_has_looped_measures():
    from tests.kern_samples import melody

    looped = merge.clean_page(1, melody(20))[0]
    systems = merge.clean_page(1, melody(12))[0]
    assert routing.choose(looped, systems, 1, systems_ok=1.0, measures=12)[0] == routing.SOURCE_SYSTEMS
    assert routing.choose(looped, systems, 1, systems_ok=1.0)[0] == routing.SOURCE_PAGE  # không biết số ô: như cũ


def test_loops_left_after_all_retries_are_trimmed():
    from tests.kern_samples import kern

    image, layout = melody_page(measures=(4, 3))
    looped = kern("**kern", "*clefG2", "*M3/4", *("2f|4g|=1|2a|4f|=2".split("|") * 4), "*-")

    def recognize(img, index, beams, tag=None):
        if index == 0:
            return looped, False  # 8 ô = khối (2 ô) lặp 4 lần; ảnh có 4 ô
        from tests.kern_samples import melody

        return melody(3), False

    page, results, warnings = routing.recognize_by_systems(1, image, layout, recognize, 3, lambda: True)
    assert routing.page_measures(results[0].page) == 4
    assert any("hệ 1: model đọc lặp, đã bỏ 4 ô nhịp" in w for w in warnings)
    assert routing.page_measures(page) == 7


def _bar_layout(measures: int):
    from types import SimpleNamespace

    system = SimpleNamespace(measures=measures, bars_closed=True, barlines=[100 * (i + 1) for i in range(measures)])
    return SimpleNamespace(systems=[system])


def _page_of(text: str) -> merge.PageKern:
    return merge.clean_page(1, text)[0]


def test_bad_measures_are_reread_by_cutting_the_image_at_each_barline():
    layout = _bar_layout(4)
    gray = np.full((TARGET_H, TARGET_W), 255, dtype=np.uint8)
    # Model đọc cả hệ bị rơi nốt a lặp ở ô 2 -> ô 2 dài 3 phách và mất một ô
    whole = _page_of("*clefG2\n*M2/4\n4r\n8eeL\n8eeJ\n=\n4cc\n4a\n8dd\n8dd\n=\n4b\n4g\n4e\n=\n4g\n8e\n8g\n=\n")
    truth = {
        1: "*clefG2\n*M2/4\n4r\n8eeL\n8eeJ\n=\n",
        2: "*clefG2\n*M2/4\n4r\n8eeL\n8eeJ\n=\n4cc\n4a\n=\n",
        3: "*clefG2\n*M2/4\n4r\n8eeL\n8eeJ\n=\n4cc\n4a\n=\n4a\n8dd\n8dd\n=\n",
        4: "*clefG2\n*M2/4\n4r\n8eeL\n8eeJ\n=\n4cc\n4a\n=\n4a\n8dd\n8dd\n=\n4b\n4g\n=\n",
    }
    tags = []

    def recognize(img, index, beams, tag=None):
        tags.append(tag)
        return truth[int(tag[1:])], False

    judge = routing.Judge(False, False, "*M2/4", 4)
    band = (0, 200)
    fixed, reads = routing.reread_by_measures(
        1, 0, gray, layout, band, whole, recognize, lambda: True, 24, judge
    )
    assert reads > 0 and tags[0] == "m2"  # ô 1 đã đủ trường độ nên giữ nguyên
    assert merge.count_measures(fixed.body) == 4
    assert routing._is_good(fixed, 1, judge)


def test_reread_keeps_the_original_when_nothing_gets_better():
    layout = _bar_layout(4)
    gray = np.full((TARGET_H, TARGET_W), 255, dtype=np.uint8)
    whole = _page_of("*clefG2\n*M2/4\n4r\n8eeL\n8eeJ\n=\n4cc\n4a\n8dd\n8dd\n=\n4b\n4g\n4e\n=\n4g\n8e\n8g\n=\n")

    def recognize(img, index, beams, tag=None):
        return "*clefG2\n*M2/4\n4cc\n4a\n8dd\n8dd\n=\n", False  # vẫn sai: không đủ k ô

    judge = routing.Judge(False, False, "*M2/4", 4)
    fixed, _ = routing.reread_by_measures(1, 0, gray, layout, (0, 200), whole, recognize, lambda: True, 24, judge)
    assert fixed is whole


def test_reread_does_nothing_when_the_system_is_already_good():
    layout = _bar_layout(2)
    gray = np.full((TARGET_H, TARGET_W), 255, dtype=np.uint8)
    good = _page_of("*clefG2\n*M2/4\n4a\n4b\n=\n2c\n=\n")

    def recognize(img, index, beams, tag=None):
        raise AssertionError("không được gọi model")

    judge = routing.Judge(False, False, "*M2/4", 2)
    assert routing.reread_by_measures(1, 0, gray, layout, (0, 200), good, recognize, lambda: True, 24, judge) == (good, 0)
