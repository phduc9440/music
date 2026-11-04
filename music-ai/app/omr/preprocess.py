"""Tiền xử lý ảnh trang nhạc cho Transcoda (đặc tả mục 2.2 và "Đầu vào Transcoda" mục 2.3).

Mục tiêu: mỗi trang nhạc ra một ảnh xám 8-bit đúng 1050 (rộng) x 1485 (cao), nền trắng, giống bản render sạch của
Verovio mà Transcoda đã được huấn luyện. Thứ tự các bước:

    đọc ảnh (xoay theo EXIF) -> xám -> khử nhiễu -> căn thẳng (deskew) -> kiểm tra có khuông nhạc
    -> cắt bớt lề thừa -> nhị phân hóa thích ứng -> resize + pad về 1050x1485

Tệp này chỉ dùng numpy, OpenCV và Pillow, không phụ thuộc FastAPI hay PyMuPDF nên test được độc lập. Việc vẽ PDF thành
ảnh nằm ở ``app/omr/pdf.py``.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Callable, Optional

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.config import get_settings

log = logging.getLogger(__name__)

# Kích thước ảnh đầu vào của Transcoda: pixel_values (1, 3, 1485, 1050) -> cao 1485, rộng 1050 (khổ dọc ~ A4).
# Lưu ý: đặc tả mục 1.2 ví dụ ghi {"width":1485,"height":1050} là NGƯỢC chiều.
TARGET_W = 1050
TARGET_H = 1485

# Góc nghiêng tối đa được tự xoay. Lớn hơn thì không xoay và ghi cảnh báo (đặc tả mục 2.2).
MAX_DESKEW_DEG = 15.0

# Chiều rộng ảnh thu nhỏ dùng để dò dòng kẻ, tìm lề: đủ nhỏ để nhanh, đủ lớn để còn thấy dòng kẻ khuông.
_ANALYSIS_WIDTH = 1200

# Một khuông nhạc có đúng 5 dòng kẻ; thấy từ 5 dòng dài trở lên mới coi là "có khuông nhạc".
_MIN_STAFF_LINES = 5

Checkpoint = Callable[[], None]


class UnreadablePage(Exception):
    """Không đọc được ảnh/trang. Job sẽ FAILED với ``PAGE_UNREADABLE: trang N``."""

    def __init__(self, message: str, page_number: Optional[int] = None) -> None:
        super().__init__(message)
        self.page_number = page_number
        """Số trang gốc (bắt đầu từ 1) gây lỗi; ``None`` nếu chưa biết."""


@dataclass
class PageResult:
    """Kết quả tiền xử lý một trang."""

    image: Optional[np.ndarray]
    """Ảnh xám uint8 kích thước (TARGET_H, TARGET_W); ``None`` nếu trang bị bỏ."""

    meta: dict = field(default_factory=dict)
    """Gửi lên Java làm ``score_files.meta``."""

    warnings: list[str] = field(default_factory=list)
    """Cảnh báo tiếng Việt, gom vào ``result_data.warnings``."""

    skipped: bool = False
    """True nếu trang bị bỏ vì không có khuông nhạc."""


@dataclass
class PreprocessOptions:
    preprocess: bool = True
    binarize: bool = True
    source_type: str = "PHOTO"


# ====================================================================== đọc ảnh


def limit_size(gray: np.ndarray, max_side: Optional[int] = None) -> np.ndarray:
    """Thu nhỏ nếu cạnh dài vượt ``max_side`` (mặc định theo cấu hình) để giữ bộ nhớ và thời gian xử lý."""
    max_side = max_side or get_settings().max_side_px
    height, width = gray.shape[:2]
    longest = max(height, width)
    if longest <= max_side:
        return gray
    scale = max_side / longest
    return cv2.resize(gray, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA)


def load_image_gray(path) -> np.ndarray:
    """Đọc file ảnh thành ảnh xám uint8.

    - Xoay đúng chiều theo EXIF orientation (ảnh chụp bằng điện thoại thường nằm ngang kèm cờ xoay).
    - PNG có kênh trong suốt thì đặt lên nền trắng (nếu không, vùng trong suốt thành đen và phá nhị phân hóa).
    - Ném :class:`UnreadablePage` nếu không đọc được.
    """
    try:
        with Image.open(path) as opened:
            image = ImageOps.exif_transpose(opened)
            image.load()
        if image.mode.startswith("I"):  # ảnh 16-bit xám
            array = np.asarray(image, dtype=np.float32)
            peak = float(array.max()) if array.size else 1.0
            gray = (array / (256.0 if peak > 255 else 1.0)).clip(0, 255).astype(np.uint8)
        else:
            if image.mode in ("RGBA", "LA", "P") or "transparency" in image.info:
                rgba = image.convert("RGBA")
                background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
                image = Image.alpha_composite(background, rgba)
            gray = np.asarray(image.convert("L"), dtype=np.uint8)
    except Exception as exc:  # noqa: BLE001 - mọi lỗi giải mã đều là "không đọc được"
        raise UnreadablePage(str(exc)) from exc
    if gray.ndim != 2 or gray.size == 0:
        raise UnreadablePage("ảnh rỗng")
    return limit_size(gray)


# ====================================================================== các bước xử lý


def _odd(value: float, low: int = 3, high: int = 10_000) -> int:
    """Làm tròn về số lẻ trong [low, high] (kích thước kernel của OpenCV phải lẻ)."""
    result = int(round(value))
    result = max(low, min(high, result))
    return result if result % 2 == 1 else result + 1


def denoise(gray: np.ndarray, source_type: str) -> np.ndarray:
    """Khử nhiễu theo loại nguồn.

    - ``PDF_NATIVE``: PDF vẽ lại sạch sẵn, không xử lý để giữ nguyên nét mảnh của dòng kẻ.
    - ``SCAN``: lọc median 3x3, bỏ nhiễu hạt mà không làm mờ cạnh.
    - ``PHOTO``: lọc bilateral (giữ cạnh) rồi cân bằng ánh sáng nền, vì ảnh chụp thường bị tối góc và bóng đổ làm
      nhị phân hóa hỏng.
    """
    if source_type == "PDF_NATIVE":
        return gray
    if source_type == "SCAN":
        return cv2.medianBlur(gray, 3)
    filtered = cv2.bilateralFilter(gray, d=7, sigmaColor=40, sigmaSpace=7)
    return flatten_illumination(filtered)


def flatten_illumination(gray: np.ndarray) -> np.ndarray:
    """Chia ảnh cho ước lượng ánh sáng nền để nền trắng đều, mực đen giữ nguyên."""
    # Giãn nở (lấy max) xóa nét mực mảnh, còn lại là nền; làm mờ mạnh để được ánh sáng nền mượt
    background = cv2.dilate(gray, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    sigma = max(gray.shape) / 25.0
    background = cv2.GaussianBlur(background, (0, 0), sigmaX=sigma)
    return cv2.divide(gray, np.maximum(background, 1), scale=255)


def _analysis_copy(gray: np.ndarray) -> np.ndarray:
    """Bản thu nhỏ (rộng tối đa ``_ANALYSIS_WIDTH``) để dò dòng kẻ cho nhanh."""
    height, width = gray.shape
    if width <= _ANALYSIS_WIDTH:
        return gray
    scale = _ANALYSIS_WIDTH / width
    return cv2.resize(gray, (_ANALYSIS_WIDTH, max(1, round(height * scale))), interpolation=cv2.INTER_AREA)


def _ink_mask(gray: np.ndarray) -> np.ndarray:
    """Mặt nạ mực (255 = mực) bằng ngưỡng thích ứng; chịu được nền không đều."""
    block = _odd(min(gray.shape) / 25, low=15, high=101)
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, 10)


def _weighted_median(values: np.ndarray, weights: np.ndarray) -> float:
    order = np.argsort(values)
    values, weights = values[order], weights[order]
    cumulative = np.cumsum(weights)
    return float(values[np.searchsorted(cumulative, cumulative[-1] / 2.0)])


def _rotate(gray: np.ndarray, angle: float, expand: bool = True) -> np.ndarray:
    """Xoay ảnh ``angle`` độ (dương = ngược chiều kim đồng hồ), nền trắng, mở rộng khung để không cắt góc."""
    height, width = gray.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2.0, height / 2.0), angle, 1.0)
    if expand:
        cos, sin = abs(matrix[0, 0]), abs(matrix[0, 1])
        new_w = int(round(height * sin + width * cos))
        new_h = int(round(height * cos + width * sin))
        matrix[0, 2] += new_w / 2.0 - width / 2.0
        matrix[1, 2] += new_h / 2.0 - height / 2.0
    else:
        new_w, new_h = width, height
    return cv2.warpAffine(
        gray, matrix, (new_w, new_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=255
    )


def estimate_skew(gray: np.ndarray) -> Optional[float]:
    """Ước lượng góc nghiêng (độ) của các dòng kẻ khuông nhạc.

    Quy ước dấu: góc của dòng kẻ trong hệ tọa độ ảnh (trục y hướng xuống). Dòng đi xuống về bên phải = góc dương. Để
    căn thẳng chỉ cần ``_rotate(gray, angle)`` với đúng góc này.

    Hai giai đoạn:
      1. Hough xác suất trên mặt nạ mực: chỉ lấy đoạn thẳng dài >= 25% bề rộng (dòng kẻ khuông, không phải thân nốt
         hay chữ), góc trong ±45°, lấy trung vị có trọng số theo độ dài.
      2. Tinh chỉnh bằng profile chiếu ngang quanh góc đó (bước 0,1°): khi dòng kẻ nằm ngang đúng thì tổng mực theo
         hàng nhọn nhất. Bước này cần vì sai 0,3° ở ảnh rộng 1050px đã lệch ~5px, bằng cả khoảng cách giữa hai dòng
         kẻ.

    Trả ``None`` nếu không đủ dòng kẻ để ước lượng (trang không có khuông nhạc hoặc quá mờ).
    """
    small = _analysis_copy(gray)
    height, width = small.shape
    ink = _ink_mask(small)

    lines = cv2.HoughLinesP(
        ink,
        rho=1,
        theta=np.pi / 720,
        threshold=int(0.12 * width),
        minLineLength=int(0.25 * width),
        maxLineGap=int(0.03 * width),
    )
    if lines is None:
        return None

    angles, weights = [], []
    # Tùy phiên bản OpenCV, mảng trả về là (N, 1, 4) hoặc (N, 4)
    for x1, y1, x2, y2 in lines.reshape(-1, 4):
        angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
        if angle > 90:
            angle -= 180
        elif angle <= -90:
            angle += 180
        if abs(angle) <= 45:
            angles.append(angle)
            weights.append(math.hypot(x2 - x1, y2 - y1))
    if len(angles) < _MIN_STAFF_LINES:
        return None

    coarse = _weighted_median(np.array(angles), np.array(weights))
    if abs(coarse) > MAX_DESKEW_DEG + 5:
        return coarse  # quá nghiêng, không cần tinh chỉnh

    # Giai đoạn 2: thử các góc quanh `coarse`, chọn góc làm profile hàng nhọn nhất
    best_angle, best_score = coarse, -1.0
    for candidate in np.arange(coarse - 0.6, coarse + 0.601, 0.1):
        rotated = _rotate(ink, float(candidate), expand=False)
        profile = rotated.sum(axis=1, dtype=np.float64) / 255.0
        score = float(np.sum(profile**2))
        if score > best_score:
            best_angle, best_score = float(candidate), score
    return best_angle


def has_staff(gray: np.ndarray) -> bool:
    """Trang có dòng kẻ khuông nhạc không (đã căn thẳng)?

    Giữ lại các đường ngang dài (mở hình thái với kernel ngang ~ 1/10 bề rộng), gom các hàng liên tiếp thành từng
    dòng kẻ và đếm: từ 5 dòng trở lên là có khuông.
    """
    small = _analysis_copy(gray)
    height, width = small.shape
    ink = _ink_mask(small)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, width // 10), 1))
    horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN, kernel)

    # Hàng có mực ngang trải dài >= 20% bề rộng là hàng thuộc một dòng kẻ
    profile = horizontal.sum(axis=1, dtype=np.float64) / 255.0
    rows = np.flatnonzero(profile >= 0.2 * width)
    if rows.size == 0:
        return False
    # Các hàng cách nhau <= 2px thuộc cùng một dòng kẻ (dòng kẻ dày 1-3px)
    line_count = 1 + int(np.sum(np.diff(rows) > 2))
    return line_count >= _MIN_STAFF_LINES


def crop_margins(gray: np.ndarray) -> np.ndarray:
    """Cắt bớt lề trắng thừa quanh bản nhạc để nốt to hơn sau khi resize về 1050px.

    Dò khung bao của mực trên bản thu nhỏ (bỏ qua vài hạt nhiễu lẻ), chừa lề ~2%. Không cắt nếu khung bao nhỏ bất
    thường (< 10% diện tích: nhiều khả năng chỉ là nhiễu) để không làm mất nội dung.
    """
    small = _analysis_copy(gray)
    s_height, s_width = small.shape
    ink = _ink_mask(small)
    # Mở 2x2 bỏ hạt nhiễu 1px trước khi chiếu
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))

    row_hit = np.flatnonzero(ink.sum(axis=1, dtype=np.float64) / 255.0 >= max(4.0, 0.004 * s_width))
    col_hit = np.flatnonzero(ink.sum(axis=0, dtype=np.float64) / 255.0 >= max(4.0, 0.004 * s_height))
    if row_hit.size == 0 or col_hit.size == 0:
        return gray

    top, bottom = int(row_hit[0]), int(row_hit[-1]) + 1
    left, right = int(col_hit[0]), int(col_hit[-1]) + 1
    if (bottom - top) * (right - left) < 0.10 * s_height * s_width:
        return gray

    height, width = gray.shape
    scale = width / s_width
    margin = int(round(0.02 * max(width, height)))
    y0 = max(0, int(top * scale) - margin)
    y1 = min(height, int(bottom * scale) + margin)
    x0 = max(0, int(left * scale) - margin)
    x1 = min(width, int(right * scale) + margin)
    return gray[y0:y1, x0:x1]


def binarize(gray: np.ndarray) -> np.ndarray:
    """Nhị phân hóa thích ứng (trung bình Gaussian cục bộ).

    Kích thước cửa sổ tỉ lệ theo ảnh (~1/40 cạnh ngắn) và phải lớn hơn bề dày nét (đầu nốt) nên nét đặc không bị
    rỗng ruột. Vùng nền phẳng ra trắng nhờ hằng số C. Lưu ý: bước resize sau đó (INTER_AREA) sẽ làm mịn lại thành
    xám nhẹ ở mép nét, giúp dòng kẻ mảnh không bị đứt khi thu nhỏ.
    """
    block = _odd(min(gray.shape) / 40, low=25, high=101)
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, 12)


def fit_to_canvas(gray: np.ndarray, width: int = TARGET_W, height: int = TARGET_H) -> np.ndarray:
    """Đưa ảnh về đúng ``width`` x ``height``: thu phóng giữ tỉ lệ cho vừa khung, pad trắng, căn trên-trái.

    - Trang thấp hơn tỉ lệ 1485/1050: vừa theo chiều rộng, pad trắng phía DƯỚI (giống model card).
    - Trang cao hơn tỉ lệ (hoặc ảnh ngang): thu nhỏ cho vừa chiều cao rồi pad trắng bên PHẢI. Khác model card (cắt
      phần dưới), cách này không làm mất nội dung.
    """
    src_h, src_w = gray.shape[:2]
    scale = min(width / src_w, height / src_h)
    new_w = max(1, min(width, int(round(src_w * scale))))
    new_h = max(1, min(height, int(round(src_h * scale))))
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    resized = cv2.resize(gray, (new_w, new_h), interpolation=interpolation)
    canvas = np.full((height, width), 255, dtype=np.uint8)
    canvas[:new_h, :new_w] = resized
    return canvas


# ====================================================================== một trang


def process_page(
    gray: np.ndarray,
    options: PreprocessOptions,
    page_number: int,
    checkpoint: Optional[Checkpoint] = None,
) -> PageResult:
    """Tiền xử lý một trang đã đọc thành ảnh xám.

    :param page_number: số trang gốc (bắt đầu từ 1), dùng trong cảnh báo và ``meta.sourcePage``.
    :param checkpoint: hàm được gọi giữa các bước; ném ngoại lệ để dừng (hủy job hoặc quá thời gian trang).
    """
    check = checkpoint or (lambda: None)
    result = PageResult(
        image=None,
        meta={
            "width": TARGET_W,
            "height": TARGET_H,
            "deskewAngle": 0.0,
            "preprocessed": options.preprocess,
            "binarized": False,
            "sourcePage": page_number,
        },
    )

    # preprocess=false: chỉ resize + pad (để so sánh có/không tiền xử lý ở script SER 1.7)
    if not options.preprocess:
        if gray.shape[1] > gray.shape[0]:
            result.warnings.append(f"Trang {page_number} nằm ngang, đã thu nhỏ cho vừa khổ dọc")
        result.image = fit_to_canvas(gray)
        return result

    check()
    work = denoise(gray, options.source_type)

    check()
    angle = estimate_skew(work)
    far_from_straight = False
    if angle is not None:
        if abs(angle) > MAX_DESKEW_DEG:
            far_from_straight = True
            result.warnings.append(
                f"Trang {page_number}: góc nghiêng ước lượng {angle:.1f}° vượt quá {MAX_DESKEW_DEG:.0f}°, không xoay"
            )
        elif abs(angle) >= 0.05:
            work = _rotate(work, angle)
            result.meta["deskewAngle"] = round(angle, 2)

    check()
    # Đã thấy nhiều đoạn kẻ dài nhưng quá nghiêng để căn thẳng: vẫn coi là có khuông nhạc
    if not far_from_straight and not has_staff(work):
        hint = " (có vẻ ảnh bị xoay 90°)" if has_staff(np.rot90(work)) else ""
        result.warnings.append(f"Trang {page_number} không có khuông nhạc{hint}, đã bỏ qua")
        result.skipped = True
        return result

    check()
    work = crop_margins(work)

    check()
    if options.binarize:
        work = binarize(work)
        result.meta["binarized"] = True

    if work.shape[1] > work.shape[0]:
        result.warnings.append(f"Trang {page_number} nằm ngang, đã thu nhỏ cho vừa khổ dọc")

    check()
    result.image = fit_to_canvas(work)
    return result
