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
    bars=0,
) -> np.ndarray:
    """Trang giọng hát + piano: mỗi hệ ``staves`` khuông, khuông trên cùng có "lời ca" bên dưới.

    ``brace_pair``: chỉ số khuông trên của cặp có ngoặc ở lề trái (mặc định hai khuông dưới cùng). ``connector``: vạch hệ
    nối mọi khuông ở lề trái. ``first_staves``: số khuông của hệ đầu (giấu khuông trống ở đoạn dạo đầu). ``stray_line``:
    một nét ngang dài (như dòng 8va) giữa hai khuông piano. ``drop_line``: xóa một dòng kẻ của khuông giọng hát hệ đầu.
    ``bars``: số ô mỗi hệ (0 = không vẽ vạch nhịp); vạch của cặp piano nối liền hai khuông, khuông khác vạch riêng.
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
        if bars:
            step = (right - left - 140) // 12
            spots = [left + 90 + int((k + 0.5) * step) for k in range(12)]
            xs = [spots[round((i + 1) * 12 / bars) - 1] for i in range(bars - 1)] + [right]
            pair = brace_pair if brace_pair is not None else count - 2
            for x in xs:
                index = 0
                while index < count:
                    if index == pair and index + 1 < count:
                        cv2.line(page, (x, bases[index]), (x, bases[index + 1] + 4 * spacing), 0, 2)
                        index += 2
                    else:
                        cv2.line(page, (x, bases[index]), (x, bases[index] + 4 * spacing), 0, 2)
                        index += 1
        if stray_line and count >= 3:
            y = (bases[-2] + 4 * spacing + bases[-1]) // 2
            cv2.line(page, (left + 300, y), (right - 100, y), 0, 2)
    return page


def make_melody_page(
    width=1700, height=2400, measures=(4, 5, 3), close_last=True, final_double=True, seed=0
) -> np.ndarray:
    """Trang giai điệu một khuông có vạch nhịp: hệ thứ ``i`` có ``measures[i]`` ô.

    Mỗi ô có một nốt trắng với thân nốt dài **phủ kín chiều cao khuông** (đầu nốt rỗng ở dòng kẻ dưới, thân lên tới dòng
    kẻ trên: dễ bị nhầm là vạch nhịp), một nốt đen thân ngắn và một nốt móc đơn có cờ. ``close_last=False``: hệ cuối không
    có vạch nhịp ở mép phải. ``final_double``: hệ cuối kết thúc bằng vạch kết (mảnh + dày).
    """
    rng = np.random.default_rng(seed)
    page = np.full((height, width), 255, np.uint8)
    spacing = 16
    left, right = int(width * 0.08), int(width * 0.94)
    top = int(height * 0.08)
    system_height = int((height * 0.84) / max(1, len(measures)))
    for s, count in enumerate(measures):
        base = top + s * system_height
        bottom = base + 4 * spacing
        for line in range(5):
            cv2.line(page, (left, base + line * spacing), (right, base + line * spacing), 0, 2)
        # khóa Sol giả: nét dọc vượt khỏi khuông (không được tính là vạch nhịp)
        cv2.line(page, (left + 30, base - 2 * spacing), (left + 30, bottom + spacing), 0, 4)
        start = left + 120
        width_m = (right - start) / count
        for m in range(count):
            x = int(start + m * width_m)
            # nốt trắng: đầu rỗng trên dòng kẻ dưới, thân phủ kín khuông
            hx = x + int(width_m * 0.2)
            cv2.ellipse(page, (hx, bottom), (10, 7), -20, 0, 360, 0, 2)
            cv2.line(page, (hx + 9, bottom), (hx + 9, base), 0, 2)
            # nốt đen thân ngắn
            qx = x + int(width_m * 0.45)
            qy = base + int(rng.integers(1, 4)) * spacing
            cv2.ellipse(page, (qx, qy), (10, 7), -20, 0, 360, 0, -1)
            cv2.line(page, (qx + 9, qy), (qx + 9, qy - 3 * spacing), 0, 2)
            # nốt móc đơn có cờ
            ex = x + int(width_m * 0.7)
            ey = base + 2 * spacing
            cv2.ellipse(page, (ex, ey), (10, 7), -20, 0, 360, 0, -1)
            cv2.line(page, (ex + 9, ey), (ex + 9, ey - 3 * spacing), 0, 2)
            cv2.line(page, (ex + 9, ey - 3 * spacing), (ex + 22, ey - spacing), 0, 3)
            # vạch nhịp ở cuối ô (ô cuối của hệ cuối có thể không có)
            bx = int(start + (m + 1) * width_m) - 6
            last = m == count - 1
            if last and s == len(measures) - 1:
                if not close_last:
                    continue
                if final_double:
                    cv2.line(page, (bx - 10, base), (bx - 10, bottom), 0, 2)
                    cv2.line(page, (bx, base), (bx, bottom), 0, 6)
                    continue
            cv2.line(page, (bx, base), (bx, bottom), 0, 2)
    return page
