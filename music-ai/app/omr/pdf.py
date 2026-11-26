"""Tách PDF thành ảnh từng trang bằng PyMuPDF (đặc tả mục 2.2, bước "Tách trang PDF").

``pymupdf`` được import khi dùng (không ở đầu file) để phần còn lại của dịch vụ chạy và test được dù chưa cài.
"""

from __future__ import annotations

import logging
from typing import Iterator, Tuple

import numpy as np

from app.config import get_settings
from app.omr.preprocess import UnreadablePage, limit_size

log = logging.getLogger(__name__)


def _import_pymupdf():
    try:
        import pymupdf  # noqa: PLC0415 - tên import mới (>= 1.24.3)

        return pymupdf
    except ImportError:
        try:
            import fitz  # noqa: PLC0415 - tên import cũ của cùng một thư viện

            return fitz
        except ImportError as exc:
            raise UnreadablePage("chưa cài PyMuPDF (pip install pymupdf)") from exc


def open_pdf(path):
    """Mở PDF, kiểm tra không mã hóa và có trang. Ném :class:`UnreadablePage` (trang 1) nếu lỗi."""
    pymupdf = _import_pymupdf()
    try:
        document = pymupdf.open(str(path))
    except Exception as exc:  # noqa: BLE001
        raise UnreadablePage(f"không mở được PDF: {exc}") from exc
    if document.needs_pass or document.is_encrypted:
        document.close()
        raise UnreadablePage("PDF bị mã hóa")
    if document.page_count < 1:
        document.close()
        raise UnreadablePage("PDF không có trang nào")
    return document


def render_page_gray(document, index: int, dpi: int | None = None) -> np.ndarray:
    """Vẽ trang ``index`` (bắt đầu từ 0) thành ảnh xám uint8 ở ``dpi`` (mặc định 300).

    Nếu ảnh vượt cạnh dài tối đa thì chọn hệ số thu phóng nhỏ hơn ngay từ lúc vẽ (không vẽ to rồi mới thu nhỏ).
    """
    pymupdf = _import_pymupdf()
    settings = get_settings()
    dpi = dpi or settings.pdf_dpi
    try:
        page = document.load_page(index)
        zoom = dpi / 72.0
        longest_pt = max(page.rect.width, page.rect.height)
        if longest_pt * zoom > settings.max_side_px:
            zoom = settings.max_side_px / longest_pt
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csGRAY, alpha=False)
        buffer = np.frombuffer(pixmap.samples, dtype=np.uint8)
        # stride có thể lớn hơn width do căn lề bộ nhớ nên cắt theo width thật
        gray = buffer.reshape(pixmap.height, pixmap.stride)[:, : pixmap.width].copy()
    except UnreadablePage:
        raise
    except Exception as exc:  # noqa: BLE001
        raise UnreadablePage(f"không vẽ được trang PDF: {exc}") from exc
    return limit_size(gray)


def iter_pdf_pages(path) -> Tuple[int, Iterator[Tuple[int, np.ndarray]]]:
    """Trả ``(số_trang, iterator)``; iterator sinh ``(số_trang_gốc, ảnh_xám)`` lần lượt, vẽ từng trang một lượt."""
    document = open_pdf(path)
    total = document.page_count
    max_pages = get_settings().max_pages
    if total > max_pages:
        document.close()
        raise UnreadablePage(f"PDF có {total} trang, vượt giới hạn {max_pages}")

    def generator() -> Iterator[Tuple[int, np.ndarray]]:
        try:
            for index in range(total):
                try:
                    yield index + 1, render_page_gray(document, index)
                except UnreadablePage as exc:
                    # Gắn số trang để pipeline báo "PAGE_UNREADABLE: trang N"
                    exc.page_number = index + 1  # type: ignore[attr-defined]
                    raise
        finally:
            document.close()

    return total, generator()
