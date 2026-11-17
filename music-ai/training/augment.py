"""Biến dạng ảnh bản nhạc render sạch thành giống ảnh chụp điện thoại / bản scan (dùng khi tạo dữ liệu fine-tune).

Mỗi phép biến dạng có biên độ nhỏ, đo theo thực tế ảnh người dùng tải lên (storage của dự án: ảnh chụp màn hình,
ảnh chụp giấy, PDF xuất từ phần mềm), không làm ảnh "khó hơn thực tế":

* xoay nhẹ (<= 1,5°) và phối cảnh nhẹ (góc dịch <= 2% cạnh) như chụp giấy hơi nghiêng;
* mờ (Gauss/motion nhẹ), nhiễu Gauss, nén JPEG (chất lượng 35-90);
* đổi sáng/tương phản, nền giấy không đều (gradient ánh sáng), bóng tay/mép;
* đổi độ phân giải (thu nhỏ rồi phóng lại) như ảnh chụp xa;
* mực in mỏng/đậm (erode/dilate 1 px).

Chỉ cần numpy + OpenCV. ``degrade(img, rng, profile)`` với ``profile`` là ``"photo"``, ``"scan"`` hoặc ``"clean"``.
Nhãn (kern) không đổi vì mọi phép biến dạng giữ nguyên nội dung nhạc.
"""

from __future__ import annotations

import cv2
import numpy as np

PROFILES = ("clean", "scan", "photo")


def rotate(img: np.ndarray, degrees: float) -> np.ndarray:
    h, w = img.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), degrees, 1.0)
    return cv2.warpAffine(img, matrix, (w, h), flags=cv2.INTER_LINEAR, borderValue=255)


def perspective(img: np.ndarray, rng: np.random.Generator, max_shift: float = 0.02) -> np.ndarray:
    h, w = img.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    jitter = rng.uniform(-max_shift, max_shift, size=(4, 2)) * np.array([w, h])
    dst = np.float32(src + jitter)
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, matrix, (w, h), flags=cv2.INTER_LINEAR, borderValue=255)


def uneven_light(img: np.ndarray, rng: np.random.Generator, strength: float = 0.25) -> np.ndarray:
    h, w = img.shape[:2]
    gx, gy = np.meshgrid(np.linspace(-1, 1, w), np.linspace(-1, 1, h))
    angle = rng.uniform(0, 2 * np.pi)
    ramp = (np.cos(angle) * gx + np.sin(angle) * gy) * 0.5 + 0.5
    shade = 1.0 - strength * rng.uniform(0.3, 1.0) * ramp
    return np.clip(img.astype(np.float32) * shade, 0, 255).astype(np.uint8)


def jpeg(img: np.ndarray, quality: int) -> np.ndarray:
    ok, encoded = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])
    return cv2.imdecode(encoded, cv2.IMREAD_GRAYSCALE) if ok else img


def resample(img: np.ndarray, factor: float) -> np.ndarray:
    h, w = img.shape[:2]
    small = cv2.resize(img, (max(1, int(w * factor)), max(1, int(h * factor))), interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)


def ink(img: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    kernel = np.ones((2, 2), np.uint8)
    return cv2.dilate(img, kernel) if rng.random() < 0.5 else cv2.erode(img, kernel)  # nền trắng: dilate = mực mỏng


def degrade(img: np.ndarray, rng: np.random.Generator, profile: str = "photo") -> np.ndarray:
    """Ảnh xám uint8 (nền trắng) -> ảnh đã biến dạng cùng kích thước."""
    if profile not in PROFILES:
        raise ValueError(f"profile phải là một trong {PROFILES}")
    out = img.copy()
    if profile == "clean":
        return jpeg(out, int(rng.integers(80, 96))) if rng.random() < 0.3 else out
    if rng.random() < 0.3:
        out = ink(out, rng)
    if profile == "photo":
        out = rotate(out, float(rng.uniform(-1.5, 1.5)))
        if rng.random() < 0.7:
            out = perspective(out, rng, 0.02)
        out = uneven_light(out, rng, 0.3)
        if rng.random() < 0.6:
            out = resample(out, float(rng.uniform(0.55, 0.9)))
    else:  # scan
        out = rotate(out, float(rng.uniform(-0.8, 0.8)))
        if rng.random() < 0.5:
            out = uneven_light(out, rng, 0.12)
    if rng.random() < 0.5:
        k = int(rng.choice([3, 5]))
        out = cv2.GaussianBlur(out, (k, k), 0)
    contrast = float(rng.uniform(0.75, 1.1))
    brightness = float(rng.uniform(-25, 15))
    out = np.clip(out.astype(np.float32) * contrast + brightness + (255 * (1 - contrast)) * 0.5, 0, 255)
    noise = rng.normal(0, float(rng.uniform(2, 9 if profile == "photo" else 5)), out.shape)
    out = np.clip(out + noise, 0, 255).astype(np.uint8)
    return jpeg(out, int(rng.integers(35, 90)))
