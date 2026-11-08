"""Đưa ảnh trang đã tiền xử lý thành tensor đầu vào của Transcoda.

Được ``app/omr/transcoda.py`` gọi trước khi suy luận, để tiền xử lý và model dùng chung một chuẩn đầu vào duy nhất.

Chuẩn đầu vào của ``btrkeks/transcoda-59M-zeroshot-v1`` (theo model card và bài báo arXiv 2605.10835):

* ``pixel_values``: float32, shape ``(1, 3, 1485, 1050)`` = (batch, RGB, cao, rộng), khổ dọc ~ A4.
* Chuẩn hóa về [-1, 1]: ``(x / 255 - 0.5) / 0.5`` trên từng kênh.
* ``image_sizes = [[1485, 1050]]`` truyền kèm vào ``model.generate``.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from app.omr.preprocess import TARGET_H, TARGET_W, fit_to_canvas


def to_model_array(png_path) -> np.ndarray:
    """Đọc PNG trang và trả mảng numpy float32 shape ``(1, 3, 1485, 1050)`` trong khoảng [-1, 1].

    Các bước:

    1. Mở ảnh, chuyển xám (nếu là RGB/RGBA thì nền trong suốt đặt lên trắng).
    2. Ảnh do bước tiền xử lý tạo ra đã đúng 1050x1485. Nếu là ảnh khác kích thước thì áp cùng quy tắc: thu phóng vừa
       khung, pad trắng căn trên-trái (không cắt nội dung như model card).
    3. Nhân bản ra 3 kênh RGB. Ảnh xám 8-bit là đủ vì model card tự ``convert("RGB")`` trước khi resize.
    4. Chuẩn hóa ``(x / 255 - 0.5) / 0.5`` rồi thêm chiều batch.
    """
    with Image.open(Path(png_path)) as opened:
        if opened.mode in ("RGBA", "LA", "P"):
            rgba = opened.convert("RGBA")
            background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            opened = Image.alpha_composite(background, rgba)
        gray = np.asarray(opened.convert("L"), dtype=np.uint8)

    if gray.shape != (TARGET_H, TARGET_W):
        gray = fit_to_canvas(gray)

    normalized = (gray.astype(np.float32) / 255.0 - 0.5) / 0.5
    rgb = np.repeat(normalized[np.newaxis, :, :], 3, axis=0)  # (3, H, W)
    return rgb[np.newaxis, ...]  # (1, 3, H, W)


def to_model_input(png_path):
    """Trả ``(pixel_values, image_sizes)`` là tensor torch, sẵn sàng truyền vào ``model.generate``.

    ``torch`` được import tại đây (không ở đầu file) vì nhánh tiền xử lý không cần cài torch.
    """
    import torch  # noqa: PLC0415

    pixel_values = torch.from_numpy(to_model_array(png_path))
    image_sizes = torch.tensor([[TARGET_H, TARGET_W]], dtype=torch.long)
    return pixel_values, image_sizes
