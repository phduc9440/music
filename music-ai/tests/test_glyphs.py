"""Ký hiệu nhạc đọc từ PDF vector (app/omr/glyphs.py): phân loại mã font, đặt lên ảnh trang, kiểm lại trên ảnh, đối chiếu
từng ô với kern (review.compare_glyphs) và sửa cao độ theo PDF (pitch_check.fix_from_glyphs).

Trang tổng hợp (tests/synth.py) được coi như ảnh vẽ từ một trang PDF ở 144 dpi (``ZOOM`` = 2 pixel mỗi điểm PDF); ký hiệu
"PDF" là các ký tự font nhạc đặt đúng chỗ các đầu nốt đã vẽ.
"""

from __future__ import annotations

import cv2
import pytest

from app.omr import glyphs, merge, pitch_check, review
from app.omr.layout import analyze_layout
from app.omr.preprocess import PreprocessOptions, process_page
from app.omr.vector_pdf import Glyph, PageText
from tests.synth import make_melody_page

ZOOM = 2.0
SPACING = 16  # khoảng dòng kẻ của make_melody_page (pixel ảnh gốc)


def _glyph(char: str, x: float, y: float, font: str = "ABCDEF+Leland", width: float = 20.0) -> Glyph:
    return Glyph(font, char, (x - width / 2) / ZOOM, (x + width / 2) / ZOOM, y / ZOOM, 20.0)


def _kinds(marks):
    return [(m.kind, m.detail) for m in marks]


def test_smufl_and_sonata_codes_are_classified_in_every_encoding():
    page = PageText(
        600,
        800,
        [],
        [
            # MuseScore (SMuFL): đầu nốt đen, chấm dôi, thăng, khóa Sol; ký hiệu khác (dầm, số chỉ nhịp) bỏ qua
            *[Glyph("Leland", c, 10, 16, 100, 20) for c in ("", "", "", "", "")],
            # Sibelius "Opus": byte Sonata hiện ra ở vùng U+F0xx
            *[Glyph("Opus", c, 10, 16, 100, 20) for c in ("", "", "", "")],
            # Sibelius "OpusStd": byte Sonata đọc theo MacRoman ("œ" = 0xCF, "˙" = 0xFA)
            *[Glyph("OpusStd", c, 10, 16, 100, 20) for c in ("œ", "˙", "b", "&")],
            # font Sonata mà thư viện đọc theo Latin-1 ("Ï" = 0xCF)
            *[Glyph("F9", c, 10, 16, 100, 20) for c in ("Ï", "Ï", "w", "?")],
        ],
    )
    assert _kinds(glyphs.classify(page)) == [
        ("head", "black"), ("dot", ""), ("accidental", "sharp"), ("clef", "G"),
        ("head", "black"), ("head", "half"), ("dot", ""), ("rest", ""),
        ("head", "black"), ("head", "half"), ("accidental", "flat"), ("clef", "G"),
        ("head", "black"), ("head", "black"), ("head", "whole"), ("clef", "F"),
    ]  # fmt: skip


def _melody(measures=(3, 2), shift_y: float = 0.0):
    """Trang giai điệu tổng hợp + lớp ký hiệu "PDF" tương ứng: đầu nốt, một chấm dôi sau nốt đen ô đầu và một chấm
    staccato trên nốt móc đơn ô đầu (cả hai chấm đều vẽ lên ảnh)."""
    notes: list = []
    gray = make_melody_page(measures=measures, notes=notes)
    marks = [_glyph("" if kind == "black" else "", x, y + shift_y) for _s, _m, kind, x, y, _st in notes]
    first = [n for n in notes if n[0] == 0 and n[1] == 0]
    quarter, eighth = first[1], first[2]
    dot = (quarter[3] + int(1.3 * SPACING), quarter[4] - (SPACING // 2 if quarter[5] % 2 == 0 else 0))
    staccato = (eighth[3], eighth[4] - int(1.5 * SPACING))
    for x, y in (dot, staccato):
        cv2.circle(gray, (x, y), 3, 0, -1)
    marks.append(_glyph("", dot[0], dot[1] + shift_y, width=6))
    marks.append(_glyph("", staccato[0], staccato[1] + shift_y, font="Opus", width=6))  # Sonata: cùng mã chấm dôi
    text = PageText(gray.shape[1] / ZOOM, gray.shape[0] / ZOOM, [], marks)
    result = process_page(gray, PreprocessOptions(source_type="SCAN"), 1)
    layout = analyze_layout(result.image)
    placed = glyphs.to_image(glyphs.classify(text), text, gray.shape, result.transform)
    return notes, layout, glyphs.build_page(placed, layout, result.image)


def test_heads_are_placed_on_their_staff_position_and_measures_are_counted():
    notes, layout, page = _melody()
    assert page is not None and layout.measure_counts == [3, 2]
    assert len(page.heads) == len(notes)
    by_system = {}
    for head in page.heads:
        by_system.setdefault(head.system, []).append(head)
    for system, heads in by_system.items():
        expected = [n[5] for n in sorted((n for n in notes if n[0] == system), key=lambda n: n[3])]
        assert [h.step for h in sorted(heads, key=lambda h: h.x)] == expected

    measures = []
    for index, system in enumerate(layout.systems):
        edges = [system.left] + system.barlines
        measures += [page.measure(index, a, b) for a, b in zip(edges, edges[1:])]
    assert [m["heads"] for m in measures] == [3] * 5
    assert [m["dots"] for m in measures] == [1, 0, 0, 0, 0]  # chấm staccato không phải chấm dôi
    assert measures[0]["staves"][0][0] == 0  # nốt trắng trên dòng kẻ dưới


def test_glyphs_that_do_not_fit_the_image_are_dropped():
    # lệch nửa khoảng dòng kẻ (đọc sai tọa độ/mã font): đầu nốt rơi vào giữa dòng kẻ và khe, không dùng PDF cho trang này
    _notes, _layout, page = _melody(shift_y=SPACING / 4)
    assert page is None


def _kern(*body: str) -> merge.MergeResult:
    width = len(body[0].split("\t"))
    return merge.merge_pages([merge.PageKern(1, "\t".join(["**kern"] * width), list(body))])


def test_measure_is_compared_with_the_pdf_heads_dots_and_pitches():
    result = _kern("*clefG2", "*M3/4", "4e", "4g", "4.b", "8cc", "=")
    piece = review.slice_measures(result)[0]
    same = {"heads": 4, "dots": 1, "staves": [[0, 2, 4, 5]]}
    findings, confirmed = review.compare_glyphs(same, piece, result, set())
    assert findings == [] and confirmed

    findings, confirmed = review.compare_glyphs({"heads": 5, "dots": 0, "staves": [[0, 2, 4, 5, 6]]}, piece, result, set())
    assert not confirmed
    assert [f.reason for f in findings] == [
        "Bản PDF gốc có 5 đầu nốt ở ô này, bản số có 4: có nốt thừa hoặc thiếu",
        "Bản PDF gốc có 0 chấm dôi ở ô này, bản số có 1: kiểm tra trường độ",
    ]
    findings, _ = review.compare_glyphs({"heads": 4, "dots": 1, "staves": [[0, 2, 4, 6]]}, piece, result, set())
    assert [f.reason for f in findings] == ["Cao độ ở ô này khác ký hiệu nhạc trong PDF gốc"]
    # spine có 8va: không so cao độ (cao độ kern khác vị trí ghi trên khuông), vẫn so số nốt
    findings, confirmed = review.compare_glyphs({"heads": 4, "dots": 1, "staves": [[9, 9, 9, 9]]}, piece, result, {0})
    assert findings == [] and not confirmed


def test_pdf_confirmed_measure_drops_melodic_guess_flags():
    # nhảy hai quãng tám rồi quay lại: luật LEAP gắn cờ, nhưng PDF xác nhận đúng từng nốt
    result = _kern("*clefG2", "*M4/4", "4e", "4eee", "4e", "4f", "=", "4e", "4f", "4g", "4a", "=")
    entries = [
        {"measure": 1, "page": 1, "flags": [], "_glyph": {"heads": 4, "dots": 0, "staves": [[0, 14, 0, 1]]}},
        {"measure": 2, "page": 1, "flags": []},
    ]
    plain = review.annotate([{k: v for k, v in e.items() if k != "_glyph"} for e in entries], result)
    assert review.FLAG_LEAP in plain[0]["flags"]
    checked = review.annotate(entries, result)
    assert checked[0]["flags"] == [] and checked[0]["confidence"] == 1.0
    entries[0]["_glyph"]["heads"] = 5
    checked = review.annotate(entries, result)
    assert review.FLAG_PDF in checked[0]["flags"] and checked[0]["confidence"] < review.REVIEW_THRESHOLD


def _token(step: int, duration: str) -> str:
    degree = 30 + step  # khóa Sol: dòng kẻ dưới là Mi4
    letter, octave = "cdefgab"[degree % 7], degree // 7
    return duration + (letter * (octave - 3) if octave >= 4 else letter.upper() * (4 - octave))


def test_pitches_are_fixed_from_the_pdf_heads_measure_by_measure():
    notes, layout, page = _melody(measures=(3, 3))
    assert page is not None
    body = ["*clefG2", "*M4/4"]
    for system in range(2):
        for measure in range(3):
            own = [n for n in notes if n[0] == system and n[1] == measure]
            body += [_token(own[0][5], "2"), _token(own[1][5], "4"), _token(own[2][5], "8"), "="]
    wrong = list(body)
    wrong[2] = _token(notes[0][5] + 7, "2")  # sai quãng tám
    wrong[7] = _token(notes[4][5] + 1, "4")  # sai tên nốt
    fixed, count, reason = pitch_check.fix_from_glyphs(wrong, 1, page.heads, layout)
    assert reason is None and count == 2
    assert fixed == body


def test_pitch_check_uses_pdf_heads_instead_of_the_image():
    notes, layout, page = _melody(measures=(3, 3))
    body = ["*clefG2", "*M4/4"]
    for system in range(2):
        for measure in range(3):
            own = [n for n in notes if n[0] == system and n[1] == measure]
            body += [_token(own[0][5], "2"), _token(own[1][5], "4"), _token(own[2][5], "8"), "="]
    wrong = list(body)
    wrong[3] = _token(notes[1][5] - 1, "4")
    result = merge.merge_pages([merge.PageKern(1, "**kern", wrong)])
    fixed, report = pitch_check.apply(result, {1: layout}, {}, {1: page.heads})
    assert report.fixed == 1 and report.notes == ["Trang 1: sửa cao độ 1 nốt theo ký hiệu nhạc của PDF gốc"]
    notes_only = [line for line in fixed.lines if merge.is_data_line(line)]
    assert notes_only == [line for line in body if merge.is_data_line(line)]


@pytest.mark.parametrize("clef, bottom", [("*clefG2", 30), ("*clefF4", 18), ("*clefC3", 24), ("*clefGv2", 23)])
def test_clef_bottom_line(clef, bottom):
    assert review.clef_bottom(clef) == bottom
