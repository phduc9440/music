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
    lines = ["*clefG2\t*clefF4", "4c\t4C", "4d\t4D"]
    events = pc._kern_events(lines, 2)
    assert [e.letter for e in events[0]] == ["c", "d"] and events[1] == []


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
