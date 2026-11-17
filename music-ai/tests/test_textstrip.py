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


def test_keeps_ledger_notehead_and_stem():
    page = _page()
    out, _ = strip_text(page)
    assert np.array_equal(out, page)


def test_page_without_staff_is_untouched():
    page = np.full((200, 200), 255, np.uint8)
    cv2.putText(page, "Hello", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, 0, 2)
    out, removed = strip_text(page)
    assert removed == 0 and np.array_equal(out, page)
