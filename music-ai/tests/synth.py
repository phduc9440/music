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
