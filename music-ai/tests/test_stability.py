"""Đọc lại hệ có ô nghi ngờ với ảnh dịch vài pixel và bỏ phiếu theo ô (app/omr/stability.py)."""

from __future__ import annotations

import numpy as np

from app.omr import merge, review, stability
from app.omr.layout import PageLayout, Staff, System
from tests.kern_samples import kern


def _page(*measures: str) -> merge.PageKern:
    rows = ["**kern", "*clefG2", "*k[]", "*M3/4"]
    for number, notes in enumerate(measures, start=1):
        rows += notes.split()
        rows.append("==" if number == len(measures) else f"={number + 1}")
    rows.append("*-")
    page, _ = merge.clean_page(1, kern(*rows))
    return page


def _merged(*measures: str) -> merge.MergeResult:
    return merge.merge_pages([_page(*measures)])


def _layout(systems: int = 1, measures: int = 3) -> PageLayout:
    items = []
    for index in range(systems):
        top = 100 + index * 200
        staff = Staff(top=top, bottom=top + 40, left=50, right=1000, lines=5)
        items.append(System(staves=[staff], barlines=[300, 600], measures=measures, bars_closed=True))
    return PageLayout(width=1050, height=1485, interline=10.0, systems=items, confident=True)


def _entries(result: merge.MergeResult, system_of=lambda m: 1) -> list[dict]:
    count = merge.count_measures(result.lines)
    return [
        {"measure": m, "page": 1, "system": system_of(m), "box": [50, 80, 300, 160], "flags": []}
        for m in range(1, count + 1)
    ]


class Reader:
    def __init__(self, *pages: merge.PageKern) -> None:
        self.pages = list(pages)
        self.calls: list[tuple[int, int, str]] = []

    def __call__(self, image, page_number, index, tag):
        assert image.shape == (1485, 1050)
        self.calls.append((page_number, index, tag))
        return self.pages[min(len(self.calls) - 1, len(self.pages) - 1)]


def _run(result, entries, reader, layout=None, shifts=(3, -3), max_systems=4, has_time=lambda: True):
    review.annotate(entries, result)
    return stability.verify(
        result,
        entries,
        {1: layout or _layout()},
        {1: np.full((1485, 1050), 255, np.uint8)},
        reader,
        list(shifts),
        max_systems,
        has_time,
    )


def test_two_agreeing_rereads_fix_a_measure_with_wrong_duration():
    result = _merged("4c 4d 4e", "2f 4g 4a", "2.c")
    entries = _entries(result)
    entries[1]["flags"] = [review.FLAG_DURATION]
    reader = Reader(_page("4c 4d 4e", "2f 4g", "2.c"))
    fixed, report = _run(result, entries, reader)
    assert report.replaced == 1 and report.compared == 2
    second = review.slice_measures(fixed)[1]
    assert review.normalize_lines(second.lines(fixed)) == ("2f", "4g")
    assert review.FLAG_DURATION not in entries[1]["flags"]
    assert entries[1]["_replaced"] is True
    assert [tag for _, _, tag in reader.calls] == ["tta+3", "tta-3"]
    # Ô khác không đổi và được ghi là ổn định
    assert entries[0]["_stable"] is True


def test_rereads_matching_the_original_raise_confidence():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    reader = Reader(_page("4c 4d 4e", "2f 4ggg", "2.c"))
    fixed, report = _run(result, entries, reader)
    assert report.replaced == 0 and report.stable == 3
    assert fixed is result
    review.annotate(entries, fixed)
    plain = review.confidence_of(entries[1]["flags"])
    assert entries[1]["confidence"] == round(min(1.0, plain + review.STABLE_BONUS), 2)


def test_disagreeing_rereads_mark_unstable_and_keep_alternatives():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    reader = Reader(_page("4c 4d 4e", "2f 4g", "2.c"), _page("4c 4d 4e", "2f 4a", "2.c"))
    fixed, report = _run(result, entries, reader)
    assert report.replaced == 0 and report.unstable == 1
    assert review.FLAG_UNSTABLE in entries[1]["flags"]
    assert entries[1]["_alternatives"] == [["2f", "4g"], ["2f", "4a"]]
    assert fixed is result


def test_agreeing_rereads_fix_an_octave_slip_with_correct_duration():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    reader = Reader(_page("4c 4d 4e", "2f 4g", "2.c"))
    fixed, report = _run(result, entries, reader)
    assert report.replaced == 1
    review.annotate(entries, fixed)
    assert entries[1]["flags"] == []


def test_single_reread_never_replaces():
    result = _merged("4c 4d 4e", "2f 4g 4a", "2.c")
    entries = _entries(result)
    entries[1]["flags"] = [review.FLAG_DURATION]
    reader = Reader(_page("4c 4d 4e", "2f 4g", "2.c"))
    fixed, report = _run(result, entries, reader, shifts=(3,))
    assert report.replaced == 0 and fixed is result
    assert review.FLAG_UNSTABLE in entries[1]["flags"]


def test_reads_with_a_different_measure_count_are_ignored():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    reader = Reader(_page("4c 4d 4e", "2.c"))
    _, report = _run(result, entries, reader)
    assert report.reads == 2 and report.compared == 0
    assert review.FLAG_UNSTABLE not in entries[1]["flags"]


def test_confident_systems_are_not_reread():
    result = _merged("4c 4d 4e", "2f 4g", "2.c")
    entries = _entries(result)
    reader = Reader(_page("4c 4d 4e", "2f 4g", "2.c"))
    _, report = _run(result, entries, reader)
    assert reader.calls == [] and report.systems == 0


def test_no_time_stops_before_reading():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    reader = Reader(_page("4c 4d 4e", "2f 4g", "2.c"))
    _, report = _run(result, entries, reader, has_time=lambda: False)
    assert reader.calls == [] and report.skipped == "không đủ thời gian"


def test_abort_from_reader_stops_quietly():
    class Stop(Exception):
        pass

    def reader(image, page_number, index, tag):
        raise Stop("hết giờ")

    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    review.annotate(entries, result)
    _, report = stability.verify(
        result, entries, {1: _layout()}, {1: np.full((1485, 1050), 255, np.uint8)}, reader, [3, -3], 4,
        lambda: True, abort=(Stop,),
    )
    assert report.skipped == "hết giờ"


def test_second_system_is_read_with_the_first_system_as_context():
    # Hệ 1 có 2 ô (1-2), hệ 2 có 2 ô (3-4); ô 4 lệch quãng tám
    result = _merged("4c 4d 4e", "2.f", "4g 4f 4e", "2d 4ccc")
    entries = _entries(result, system_of=lambda m: 1 if m <= 2 else 2)
    layout = _layout(systems=2, measures=2)
    # Trang ngữ cảnh: model đọc lại cả hệ đầu (2 ô) rồi tới hệ 2
    reader = Reader(_page("4c 4d 4e", "2.f", "4g 4f 4e", "2d 4c"))
    fixed, report = _run(result, entries, reader, layout=layout)
    assert {index for _, index, _ in reader.calls} == {1}
    assert report.replaced == 1
    assert review.normalize_lines(review.slice_measures(fixed)[3].lines(fixed)) == ("2d", "4c")


def test_shift_image_moves_content_and_fills_white():
    gray = np.full((10, 4), 255, np.uint8)
    gray[2] = 0
    assert (stability.shift_image(gray, 3)[5] == 0).all()
    assert (stability.shift_image(gray, -2)[0] == 0).all()
    assert (stability.shift_image(gray, 3)[:3] == 255).all()
