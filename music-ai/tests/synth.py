"""Sinh trang nhạc tổng hợp (khuông 5 dòng, nốt, vạch nhịp) để test tiền xử lý, không cần ảnh thật."""

from __future__ import annotations

import cv2
import numpy as np


def make_score_page(width=1700, height=2400, systems=4, tilt=0.0, noise=0.0, shade=False, seed=0) -> np.ndarray:
    """Trang nhạc xám uint8: ``systems`` hệ, mỗi hệ 2 khuông (piano). ``tilt`` độ theo cv2 (dương = xoay NGƯỢC chiều kim đồng hồ, dòng kẻ đi lên bên phải)."""
    rng = np.random.default_rng(seed)
    page = np.full((height, width), 255, np.uint8)
    spacing = 18
    left, right = int(width * 0.10), int(width * 0.92)
    top = int(height * 0.08)
    system_height = int((height * 0.84) / systems)
    for s in range(systems):
        y0 = top + s * system_height
        for staff in range(2):
            base = y0 + staff * int(system_height * 0.42)
            for line in range(5):
                y = base + line * spacing
                cv2.line(page, (left, y), (right, y), 0, 3)
            for k in range(14):
                x = left + 80 + k * ((right - left - 120) // 14)
                y = base + int(rng.integers(0, 5)) * spacing
                cv2.ellipse(page, (x, y), (11, 8), -20, 0, 360, 0, -1)
                cv2.line(page, (x + 10, y), (x + 10, y - 55), 0, 3)
        cv2.line(page, (left, y0), (left, y0 + int(system_height * 0.42) + 4 * spacing), 0, 4)
    cv2.putText(page, "Sonatina", (width // 2 - 120, int(height * 0.04)), cv2.FONT_HERSHEY_SIMPLEX, 2, 0, 3)

    if tilt:
        matrix = cv2.getRotationMatrix2D((width / 2, height / 2), tilt, 1.0)
        page = cv2.warpAffine(page, matrix, (width, height), flags=cv2.INTER_CUBIC, borderValue=255)
    if shade:  # tối dần về một góc như ảnh chụp bị bóng đổ
        gradient = np.linspace(1.0, 0.55, width, dtype=np.float32)[None, :]
        page = (page.astype(np.float32) * gradient).clip(0, 255).astype(np.uint8)
    if noise:
        page = (page.astype(np.float32) + rng.normal(0, noise, page.shape)).clip(0, 255).astype(np.uint8)
    return page


def make_vocal_page(
    width=1700,
    height=2400,
    systems=4,
    staves=3,
    brace_pair=None,
    connector=True,
    first_staves=None,
    stray_line=False,
    drop_line=False,
    seed=0,
) -> np.ndarray:
    """Trang giọng hát + piano: mỗi hệ ``staves`` khuông, khuông trên cùng có "lời ca" bên dưới.

    ``brace_pair``: chỉ số khuông trên của cặp có ngoặc ở lề trái (mặc định hai khuông dưới cùng). ``connector``: vạch hệ
    nối mọi khuông ở lề trái. ``first_staves``: số khuông của hệ đầu (giấu khuông trống ở đoạn dạo đầu). ``stray_line``:
    một nét ngang dài (như dòng 8va) giữa hai khuông piano. ``drop_line``: xóa một dòng kẻ của khuông giọng hát hệ đầu.
    """
    rng = np.random.default_rng(seed)
    page = np.full((height, width), 255, np.uint8)
    spacing = 16
    left, right = int(width * 0.08), int(width * 0.94)
    top = int(height * 0.06)
    system_height = int((height * 0.88) / systems)
    staff_gap = int(system_height / (staves + 0.6))
    for s in range(systems):
        y0 = top + s * system_height
        count = first_staves if (s == 0 and first_staves) else staves
        bases = [y0 + i * staff_gap for i in range(count)]
        for index, base in enumerate(bases):
            for line in range(5):
                if drop_line and s == 0 and index == 0 and line == 2:
                    continue
                y = base + line * spacing
                cv2.line(page, (left, y), (right, y), 0, 2)
            for k in range(12):
                x = left + 90 + k * ((right - left - 140) // 12)
                y = base + int(rng.integers(0, 5)) * spacing
                cv2.ellipse(page, (x, y), (10, 7), -20, 0, 360, 0, -1)
                cv2.line(page, (x + 9, y), (x + 9, y - 48), 0, 2)
            if index == 0 and count == staves and staves > 2:
                for k in range(10):  # lời ca: chữ ngắn dưới khuông giọng hát
                    cv2.putText(page, "la", (left + 90 + k * 130, base + 4 * spacing + 40),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, 0, 2)
        if connector and count > 1:
            cv2.line(page, (left, bases[0]), (left, bases[-1] + 4 * spacing), 0, 3)
        pair = brace_pair if brace_pair is not None else count - 2
        if count >= 2 and 0 <= pair < count - 1:
            y_top, y_bottom = bases[pair], bases[pair + 1] + 4 * spacing
            center = ((left - 22), (y_top + y_bottom) // 2)
            cv2.ellipse(page, center, (12, (y_bottom - y_top) // 2), 0, 90, 270, 0, 5)
        if stray_line and count >= 3:
            y = (bases[-2] + 4 * spacing + bases[-1]) // 2
            cv2.line(page, (left + 300, y), (right - 100, y), 0, 2)
    return page
