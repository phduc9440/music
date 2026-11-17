"""Engine OCR cho lời ca, có lớp trừu tượng để đổi engine (Tesseract hiện tại; PaddleOCR/VietOCR sau này).

Tesseract được chọn làm engine mặc định vì: có gói ngôn ngữ ``vie`` chính thức (đủ dấu tiếng Việt), chạy CPU, cài bằng
``apt``/``brew`` trên ARM64 (Mac M1, Ubuntu ARM64), không cần GPU hay tải model lớn. Đo trên ảnh chụp bài "Dâng" (khổ
~1000 px): đọc gần đúng hoàn toàn 3 dòng lời có dấu. Engine chỉ được gọi trên vùng chữ đã tách khỏi ký hiệu nhạc
(``textstrip.text_mask``), không bao giờ trên toàn trang nhạc.

Không có Tesseract (hoặc thiếu gói ngôn ngữ) thì :func:`create_text_engine` trả ``None`` kèm lý do, pipeline bỏ qua
bước lời ca và ghi cảnh báo, không làm job thất bại.
"""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass
from typing import Optional, Protocol

import numpy as np

log = logging.getLogger(__name__)


@dataclass
class OcrWord:
    """Một từ OCR: tọa độ theo ảnh được đưa vào engine (pixel, gốc trên-trái)."""

    text: str
    left: int
    top: int
    width: int
    height: int
    confidence: float
    """0..100 (Tesseract); -1 nếu engine không có."""

    line_id: tuple
    """Khóa nhóm các từ cùng dòng do engine trả về (Tesseract: block, paragraph, line)."""

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def bottom(self) -> int:
        return self.top + self.height

    @property
    def center_x(self) -> float:
        return self.left + self.width / 2.0


class TextEngine(Protocol):
    """Giao diện engine OCR mà nhánh lời ca dùng."""

    name: str

    def read_words(self, image: np.ndarray) -> list[OcrWord]:
        """Đọc ảnh xám uint8 (nền trắng, chữ đen), trả các từ kèm khung và mã dòng."""


class TesseractEngine:
    """Tesseract qua ``pytesseract``. ``psm 6``: coi vùng là một khối văn bản nhiều dòng (khối lời ca dưới một hệ)."""

    name = "tesseract"

    def __init__(self, lang: str = "vie+eng", psm: int = 6) -> None:
        import pytesseract  # noqa: PLC0415

        self._tess = pytesseract
        self.lang = lang
        self.psm = psm

    def read_words(self, image: np.ndarray) -> list[OcrWord]:
        data = self._tess.image_to_data(
            image,
            lang=self.lang,
            config=f"--psm {self.psm} -c preserve_interword_spaces=1",
            output_type=self._tess.Output.DICT,
        )
        words: list[OcrWord] = []
        for i, text in enumerate(data["text"]):
            text = (text or "").strip()
            if not text:
                continue
            try:
                conf = float(data["conf"][i])
            except (TypeError, ValueError):
                conf = -1.0
            words.append(
                OcrWord(
                    text=text,
                    left=int(data["left"][i]),
                    top=int(data["top"][i]),
                    width=int(data["width"][i]),
                    height=int(data["height"][i]),
                    confidence=conf,
                    line_id=(data["block_num"][i], data["par_num"][i], data["line_num"][i]),
                )
            )
        return words


def create_text_engine(name: str = "tesseract", lang: str = "vie+eng") -> tuple[Optional[TextEngine], Optional[str]]:
    """Tạo engine OCR. Trả ``(engine, None)`` hoặc ``(None, lý do không dùng được)``."""
    if name in ("", "off", "none"):
        return None, "OCR lời ca bị tắt"
    if name != "tesseract":
        return None, f"engine OCR {name!r} chưa được hỗ trợ (hiện có: tesseract)"
    try:
        import pytesseract  # noqa: PLC0415
    except ImportError:
        return None, "chưa cài pytesseract (pip install pytesseract)"
    if shutil.which("tesseract") is None and not getattr(pytesseract.pytesseract, "tesseract_cmd", "").startswith("/"):
        return None, "chưa cài Tesseract (apt install tesseract-ocr tesseract-ocr-vie / brew install tesseract-lang)"
    try:
        available = set(pytesseract.get_languages(config=""))
    except Exception as exc:  # noqa: BLE001 - tesseract lỗi cài đặt
        return None, f"không gọi được Tesseract: {type(exc).__name__}: {exc}"
    wanted = [code for code in lang.split("+") if code]
    missing = [code for code in wanted if code not in available]
    usable = [code for code in wanted if code in available]
    if not usable:
        return None, f"Tesseract thiếu gói ngôn ngữ {'+'.join(missing)} (apt install tesseract-ocr-vie)"
    if missing:
        log.warning("Tesseract thiếu gói ngôn ngữ %s, dùng %s", "+".join(missing), "+".join(usable))
    return TesseractEngine("+".join(usable)), None
