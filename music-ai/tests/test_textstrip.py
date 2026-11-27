import cv2
import numpy as np

from app.omr.textstrip import strip_text

TOP = 60
GAP = 9  # khoảng dòng kẻ


def _page():
    page = np.full((300, 600), 255, np.uint8)
    for line in range(5):
        cv2.line(page, (20, TOP + line * GAP), (580, TOP + line * GAP), 0, 1)
    for x in (20, 300, 579):  # vạch nhịp
        cv2.line(page, (x, TOP), (x, TOP + 4 * GAP), 0, 1)
    # nốt có thân nằm trong khuông, thân dài ra ngoài khuông
    cv2.ellipse(page, (100, TOP + 2 * GAP), (6, 4), -20, 0, 360, 0, -1)
    cv2.line(page, (106, TOP + 2 * GAP), (106, TOP - 25), 0, 1)
    # nốt tròn dưới khuông trên dòng kẻ phụ (không thân)
    cv2.line(page, (190, TOP + 5 * GAP + 2), (212, TOP + 5 * GAP + 2), 0, 1)
    cv2.ellipse(page, (201, TOP + 5 * GAP + 2), (8, 5), 0, 0, 360, 0, 1)
    return page


def test_removes_lyrics_and_chord_names_but_keeps_notes():
    page = _page()
    before = page.copy()
    cv2.putText(page, "Thiet con bua an", (60, TOP + 4 * GAP + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 1)
    cv2.putText(page, "Dm", (150, TOP - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
    out, removed = strip_text(page)
    assert removed > 0
    # lời ca và hợp âm biến mất, phần còn lại giống hệt trang chưa có chữ
    assert np.array_equal(out, before)


def test_counts_systems_with_chord_names_above_staff():
    from app.omr.textstrip import has_text_above_staves

    page = _page()
    assert not has_text_above_staves(page)
    cv2.putText(page, "Am", (150, TOP - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
    cv2.putText(page, "G/B", (400, TOP - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
    assert has_text_above_staves(page)


def test_lyrics_below_staff_are_not_text_above():
    from app.omr.textstrip import has_text_above_staves

    page = _page()
    cv2.putText(page, "Thiet con bua an", (60, TOP + 4 * GAP + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 1)
    assert not has_text_above_staves(page)


def test_keeps_ledger_notehead_and_stem():
    page = _page()
    out, _ = strip_text(page)
    assert np.array_equal(out, page)


def test_page_without_staff_is_untouched():
    page = np.full((200, 200), 255, np.uint8)
    cv2.putText(page, "Hello", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, 0, 2)
    out, removed = strip_text(page)
    assert removed == 0 and np.array_equal(out, page)


def _dotted_note_below_staff(page, x=420):
    """Nốt Rê4 (khe dưới dòng kẻ cuối) có thân hướng lên và chấm dôi bên phải, như nốt chấm dôi dưới khuông."""
    y = TOP + 4 * GAP + GAP // 2 + 1
    cv2.ellipse(page, (x, y), (6, 4), -20, 0, 360, 0, -1)
    cv2.line(page, (x + 6, y), (x + 6, TOP + GAP), 0, 1)
    dot_y = y + 2  # chấm dôi lệch xuống dưới dải khuông như trên bản in thật (Đời Con: tâm chấm cách dòng kẻ cuối ~5 px)
    cv2.circle(page, (x + 14, dot_y), 2, 0, -1)
    return x + 14, dot_y


def test_keeps_augmentation_dot_of_note_below_staff():
    page = _page()
    dot_x, dot_y = _dotted_note_below_staff(page)
    before = page.copy()
    # lời ca có dấu chấm câu, dấu chấm lẻ của chữ nằm xa khuông hơn
    cv2.putText(page, "con. ngan.", (360, TOP + 4 * GAP + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 1)
    out, removed = strip_text(page)
    assert removed > 0
    assert out[dot_y, dot_x] < 128  # chấm dôi còn nguyên
    assert np.array_equal(out, before)  # chữ và dấu chấm câu bị xóa hết


def test_lone_dot_without_notehead_is_still_removed():
    page = _page()
    before = page.copy()
    cv2.circle(page, (450, TOP + 4 * GAP + 8), 2, 0, -1)  # vết bẩn sát khuông, bên trái không có đầu nốt
    out, removed = strip_text(page)
    assert removed == 1 and np.array_equal(out, before)
