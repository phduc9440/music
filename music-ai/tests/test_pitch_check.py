"""Kiểm tra cao độ theo ảnh (app/omr/pitch_check.py) trên trang tổng hợp một khuông khóa Sol."""

import cv2
import numpy as np

from app.omr import merge, pitch_check as pc
from app.omr.layout import analyze_layout

IL = 18
BOTTOM = 300


def _page(steps: list[int], width=1400, height=520) -> np.ndarray:
    """Một khuông, mỗi nốt đen (đầu đặc + thân) ở vị trí ``step`` (0 = dòng dưới = Mi4)."""
    page = np.full((height, width), 255, np.uint8)
    top = BOTTOM - 4 * IL
    for k in range(5):
        cv2.line(page, (60, top + k * IL), (width - 40, top + k * IL), 0, 2)
    cv2.line(page, (60, top), (60, BOTTOM), 0, 3)
    cv2.putText(page, "G", (80, BOTTOM - 10), cv2.FONT_HERSHEY_SIMPLEX, 1.6, 0, 3)  # thay khóa Sol: mực ở đầu khuông
    for i, step in enumerate(steps):
        x = 260 + i * 100
        y = BOTTOM - int(step * IL / 2)
        if step <= -2:
            for s in range(-2, step - 1, -2):
                yy = BOTTOM - int(s * IL / 2)
                cv2.line(page, (x - 16, yy), (x + 16, yy), 0, 2)
        if step >= 10:
            for s in range(10, step + 1, 2):
                yy = BOTTOM - int(s * IL / 2)
                cv2.line(page, (x - 16, yy), (x + 16, yy), 0, 2)
        cv2.ellipse(page, (x, y), (11, 8), -20, 0, 360, 0, -1)
        if step < 4:
            cv2.line(page, (x + 10, y), (x + 10, y - 62), 0, 2)
        else:
            cv2.line(page, (x - 10, y), (x - 10, y + 62), 0, 2)
    return page


def test_rewrite_octave():
    assert pc._rewrite_octave("8.cccL", 4) == "8.cL"
    assert pc._rewrite_octave("16ff[LL", 5) == "16ff[LL"
    assert pc._rewrite_octave("4gg", 3) == "4G"
    assert pc._rewrite_octave("8b-]J", 4) == "8b-]J"
    assert pc._rewrite_octave("8dd#", 3) == "8D#"


def test_kern_pitch_and_events_skip_other_clefs():
    assert pc._kern_pitch("8.cccL") == ("c", 6)
    assert pc._kern_pitch("4r") is None
    lines = ["*clefG2\t*clefC3", "4c\t4C", "4d\t4D"]
    events = pc._kern_events(lines, 2)
    assert [e.letter for e in events[0]] == ["c", "d"] and events[1] == []


def test_kern_events_accept_bass_clef_but_not_a_clef_change():
    clefs: dict[int, str] = {}
    lines = ["*clefF4\t*clefG2", "4C\t4c", "4D\t4d"]
    events = pc._kern_events(lines, 2, clefs)
    assert [(e.letter, e.octave) for e in events[0]] == [("c", 3), ("d", 3)]
    assert clefs == {0: "F4", 1: "G2"}
    changed = pc._kern_events(["*clefF4\t*clefG2", "4C\t4c", "*clefG2\t*", "4c\t4d"], 2)
    assert changed[0] == [] and len(changed[1]) == 2


def test_bass_clef_positions_and_octave_fix():
    # khóa Fa: dòng dưới cùng là Sol2, dòng trên cùng là La3
    assert pc._diatonic_from_step(0, "F4") == pc._diatonic_of("g", 2)
    assert pc._diatonic_from_step(8, "F4") == pc._diatonic_of("a", 3)
    # kern tay trái: G3 D3 G3 D3 C3 (G đầu sai quãng tám) ; ảnh: G2 D3 G3 D3 C3
    kern = [pc._Event(l, o, i, 0, 0) for i, (l, o) in enumerate([("g", 3), ("d", 3), ("g", 3), ("d", 3), ("c", 3)])]
    image = [pc._diatonic_from_step(s, "F4") for s in (0, 4, 7, 4, 3)]
    fixes, mismatched, reason = pc.plan_fixes(image, kern, "F4")
    assert reason is None and mismatched == 0
    assert [(f.line, f.octave) for f in fixes] == [(0, 2)]


def test_context_fix_keeps_normal_bass_octaves():
    # nốt khóa Fa ở quãng tám 2 là bình thường: không bị kéo lên như khóa Sol
    kern = [pc._Event(l, o, i, 0, 0) for i, (l, o) in enumerate([("c", 3), ("g", 2), ("c", 3)])]
    assert pc._context_fixes(kern, {0, 2}, [], "F4") == []
    assert pc._context_fixes(kern, {0, 2}, [], "G2") != []


def test_align_and_plan_fixes_corrects_only_octave():
    # kern: C5 D5 E5 F5 G6(sai) A5 ; ảnh: C5 D5 E5 F5 G5 A5
    kern = [pc._Event(l, o, i, 0, 0) for i, (l, o) in enumerate([("c", 5), ("d", 5), ("e", 5), ("f", 5), ("g", 6), ("a", 5)])]
    image = [pc._diatonic_of(l, o) for l, o in [("c", 5), ("d", 5), ("e", 5), ("f", 5), ("g", 5), ("a", 5)]]
    fixes, mismatched, reason = pc.plan_fixes(image, kern)
    assert reason is None and mismatched == 0
    assert [(f.line, f.octave) for f in fixes] == [(4, 5)]


def test_plan_fixes_never_changes_letters_and_refuses_unrelated_music():
    kern = [pc._Event(l, 4, i, 0, 0) for i, l in enumerate("cdefgabcd")]
    image = [pc._diatonic_of(l, 4) for l in "gfedcbagf"]
    fixes, _miss, reason = pc.plan_fixes(image, kern)
    assert fixes == [] and reason is not None


def test_find_heads_reads_staff_positions():
    steps = [0, 2, 5, 8, 9, 10, -2, 12]
    gray = _page(steps)
    layout = analyze_layout(gray)
    heads = sorted(pc.find_heads(gray, layout), key=lambda h: h.x)
    assert [h.step for h in heads] == steps


def test_check_page_fixes_wrong_octave_from_image():
    steps = [5, 7, 3, 5, 1, 4]  # A4 C5... : tên nốt theo khóa Sol
    gray = _page(steps)
    layout = analyze_layout(gray)
    truth = [pc._diatonic_from_step(s) for s in steps]
    names = ["cdefgab"[d % 7] for d in truth]
    octaves = [d // 7 for d in truth]
    wrong = list(octaves)
    wrong[2] += 1  # model đọc cao hơn 1 quãng tám
    wrong[4] += 2
    lines = ["*clefG2"] + [f"4{pc._rewrite_octave(n, o)}" for n, o in zip(names, wrong)]
    fixed, count, _miss, reason = pc.check_page(lines, 1, gray, layout)
    expected = ["*clefG2"] + [f"4{pc._rewrite_octave(n, o)}" for n, o in zip(names, octaves)]
    assert reason is None and count == 2 and fixed == expected


def test_check_page_skips_when_spines_do_not_match_staves():
    gray = _page([0, 1, 2, 3, 4])
    layout = analyze_layout(gray)
    _lines, count, _miss, reason = pc.check_page(["4c\t4e"] * 5, 2, gray, layout)
    assert count == 0 and reason is not None


def test_apply_leaves_result_untouched_without_images():
    result = merge.MergeResult(text="**kern\n4c\n*-\n", spines=1, lines=["4c"], line_pages=[1], header="**kern")
    out, report = pc.apply(result, {}, {})
    assert out is result and report.fixed == 0 and report.skipped


def test_context_fix_pulls_unseen_note_from_extreme_octave():
    # kern: C5 D5 E5 F7(ảnh không thấy) G5 A5 B5; ảnh chỉ có 6 nốt
    notes = [("c", 5), ("d", 5), ("e", 5), ("f", 7), ("g", 5), ("a", 5), ("b", 5)]
    kern = [pc._Event(l, o, i, 0, 0) for i, (l, o) in enumerate(notes)]
    image = [pc._diatonic_of(l, o) for l, o in notes if (l, o) != ("f", 7)]
    fixes, _miss, reason = pc.plan_fixes(image, kern)
    assert reason is None and [(f.line, f.octave) for f in fixes] == [(3, 5)]


def _bar_page(measures: list[list[int]], width=1400, height=520):
    """Một khuông có vạch nhịp sau mỗi ô; trả (ảnh, bố cục)."""
    steps = [s for m in measures for s in m]
    page = _page([], width, height)
    top = BOTTOM - 4 * IL
    x = 260
    bars = []
    for m in measures:
        for step in m:
            y = BOTTOM - int(step * IL / 2)
            cv2.ellipse(page, (x, y), (11, 8), -20, 0, 360, 0, -1)
            cv2.line(page, (x + 10, y), (x + 10, y - 62), 0, 2)
            x += 48
        cv2.line(page, (x + 5, top), (x + 5, BOTTOM), 0, 2)
        bars.append(x + 5)
        x += 60
    layout = analyze_layout(page)
    layout.systems[0].barlines = bars  # vạch nhịp đã biết: test này kiểm tra phần so ô, không kiểm tra bộ dò vạch
    return page, layout, steps


def test_fix_measures_rewrites_letters_of_misread_measure():
    measures = [[0, 1, 2, 3], [4, 3, 2, 1], [1, 2, 3, 4], [3, 3, 2, 2], [0, 2, 4, 2]]
    gray, layout, _ = _bar_page(measures)
    rows = []
    for k, m in enumerate(measures):
        for step in m:
            d = pc._diatonic_from_step(step)
            rows.append("4" + pc._rewrite_octave("cdefgab"[d % 7], d // 7))
        rows.append("=")
    wrong = list(rows)
    wrong[5] = "4c"  # ô 2 nốt 1 (G4) đọc thành C4
    wrong[6] = "4b"
    heads = pc.find_heads(gray, layout)
    fixed, changed, reason = pc.fix_measures(["*clefG2", *wrong], heads, layout)
    assert reason is None and changed == 2 and fixed[1:] == rows


def test_rewrite_pitch_drops_stale_accidental():
    assert pc._rewrite_pitch("8f#L", "g", 4) == "8gL"
    assert pc._rewrite_pitch("4b-", "b", 5) == "4bb-"


def test_align_prefers_exact_pitch_over_spurious_head_with_same_letter():
    # kern E5 D5 C5 D5 A4 đúng; ảnh có thêm một "đầu nốt" C4 giả (vết beam) ngay sau C5 thật: không được sửa C5 -> C4
    kern = [pc._Event(l, o, i, 0, 0) for i, (l, o) in enumerate([("e", 5), ("d", 5), ("c", 5), ("d", 5), ("a", 4)])]
    image = [pc._diatonic_of(l, o) for l, o in [("e", 5), ("d", 5), ("c", 5), ("c", 4), ("d", 5), ("a", 4)]]
    fixes, mismatched, reason = pc.plan_fixes(image, kern)
    assert reason is None and mismatched == 0
    assert fixes == []
