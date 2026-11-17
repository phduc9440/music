"""Tìm và đọc các dòng chữ quanh từng hệ khuông, phân loại lời ca / tên hợp âm / chữ khác (tiêu đề, số trang).

Nguyên tắc tách nhạc khỏi chữ: chỉ những pixel mà ``textstrip.text_mask`` coi là chữ (thành phần liên thông nằm ngoài
dải khuông, không chứa dòng kẻ phụ, kích thước cỡ chữ) mới được đưa vào OCR. Nốt, thân nốt, dòng kẻ phụ, luyến... không
bao giờ tới engine OCR, và lời ca cũng không bao giờ tới Transcoda (bước xóa chữ dùng cùng mặt nạ).

Tọa độ:
* ``page``: ảnh 1050x1485 (``pages/page-NNN.png``) mà bố cục và ``measureMap`` dùng.
* ``work``: ảnh độ phân giải cao (``PageResult.ocr_image``); ``page = work * scale`` (căn trên-trái).
Mọi kết quả trả ra đều theo tọa độ ``page``.

Phân loại dòng (mỗi vùng giữa hệ ``i`` và hệ ``i+1``):
1. Gom các từ OCR thành dòng theo tâm dọc (không tin hẳn số dòng của engine vì lời ca giãn rộng).
2. Dòng đa số là tên hợp âm (``F``, ``Am``, ``C7``, ``Em(b5)``, ``Bb``...) -> ``CHORDS`` (thường ở sát trên hệ sau).
3. Dòng chỉ có số (số trang) -> ``OTHER``. Dòng chữ to hơn hẳn lời ca (tiêu đề bài thứ hai trên cùng trang) -> ``OTHER``.
4. Các dòng còn lại tạo thành khối lời của hệ ``i`` nếu dòng đầu bắt đầu gần khuông và các dòng sát nhau; dòng cách quá
   xa khối -> ``OTHER``.
5. Nhãn đầu dòng ``1.``, ``2.``... cho số lời; nhãn ``Đk:``, ``ĐK``, ``(Đáp)``, ``Refrain`` bị bỏ khỏi âm tiết.
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from app.omr.layout import PageLayout
from app.omr.lyrics.ocr import OcrWord, TextEngine
from app.omr.textstrip import text_mask

KIND_LYRICS = "LYRICS"
KIND_CHORDS = "CHORDS"
KIND_OTHER = "OTHER"

CHORD_RE = re.compile(
    r"^\(?[A-G](?:#|b|♭|♯)?(?:m|maj|min|dim|aug|sus|add|M|°|ø|\+)?\d*"
    r"(?:\(?(?:b|#|♭|♯)?\d+\)?)*(?:sus\d*)?(?:/[A-G](?:#|b|♭|♯)?)?\)?$"
)
VERSE_RE = re.compile(r"^\(?(\d{1,2})[.):]?\)?$")
VERSE_OCR_ONE_RE = re.compile(r"^[Il|][.)]$")
"""OCR hay đọc nhãn ``1.`` thành ``I.``/``l.``: chỉ chấp nhận khi có dấu chấm/ngoặc và đứng đầu dòng."""
LABEL_RE = re.compile(
    r"^\(?(?:đk|dk|điệp|khúc|đáp|dap|refrain|chorus|coda|tk|ĐK)[:.)]*$", re.IGNORECASE
)
_TARGET_TEXT_PX = 32.0
"""Phóng ảnh vùng chữ sao cho chiều cao trung vị các thành phần chữ (một từ kèm dấu) ~32 px: cỡ Tesseract đọc dấu tốt.
Chọn bằng đo CER trên hai trang thật ("Dâng" ảnh chụp, "Thánh Vịnh 22" ảnh số); chữ nhỏ hơn ~20 px thì Tesseract bỏ sót."""


@dataclass
class TextLine:
    """Một dòng chữ (tọa độ ảnh trang)."""

    words: list[OcrWord]
    top: float
    bottom: float
    kind: str = KIND_OTHER
    system: int = -1
    """Chỉ số hệ (0-based) mà dòng thuộc về: lời ca nằm DƯỚI hệ này; hợp âm nằm TRÊN hệ ``system``."""

    number: int = 0
    """Số lời (1-based) với dòng lời ca: theo nhãn ``1.``, ``2.`` nếu có, không thì thứ tự dòng trong khối."""

    label: Optional[str] = None
    """Nhãn bị bỏ khỏi âm tiết (``1.``, ``Đk:``...)."""

    @property
    def height(self) -> float:
        return self.bottom - self.top

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    @property
    def confidence(self) -> float:
        values = [w.confidence for w in self.words if w.confidence >= 0]
        return float(np.mean(values)) if values else -1.0

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "system": self.system + 1,
            "number": self.number,
            "label": self.label,
            "text": self.text,
            "box": [
                int(min(w.left for w in self.words)),
                int(self.top),
                int(max(w.right for w in self.words)),
                int(self.bottom),
            ],
            "confidence": round(self.confidence, 1),
        }


@dataclass
class PageText:
    """Mọi dòng chữ của một trang sau khi phân loại."""

    lines: list[TextLine] = field(default_factory=list)

    def lyrics_of(self, system: int) -> list[TextLine]:
        return [ln for ln in self.lines if ln.kind == KIND_LYRICS and ln.system == system]


def is_chord(token: str) -> bool:
    return bool(CHORD_RE.match(token.strip().replace("°", "dim")))


def ocr_source(page_gray: np.ndarray, work_gray: np.ndarray, scale: float, layout: PageLayout) -> np.ndarray:
    """Ảnh ``work`` chỉ còn phần chữ (mọi thứ khác tô trắng)."""
    mask_page, count = text_mask(page_gray, layout)
    height, width = work_gray.shape[:2]
    if count == 0:
        return np.full_like(work_gray, 255)
    used_w = max(1, min(page_gray.shape[1], int(round(width * scale))))
    used_h = max(1, min(page_gray.shape[0], int(round(height * scale))))
    mask = cv2.resize(mask_page[:used_h, :used_w].astype(np.uint8), (width, height), interpolation=cv2.INTER_NEAREST)
    grow = max(1, int(round(0.25 * layout.interline / scale)))
    mask = cv2.dilate(mask, np.ones((2 * grow + 1, 2 * grow + 1), np.uint8)) > 0
    out = np.full_like(work_gray, 255)
    out[mask] = work_gray[mask]
    return out


def read_page_text(
    page_gray: np.ndarray,
    work_gray: np.ndarray,
    scale: float,
    layout: PageLayout,
    engine: TextEngine,
) -> PageText:
    """OCR mọi vùng chữ giữa các hệ và phân loại từng dòng (xem docstring module)."""
    if not layout.systems or layout.interline <= 0:
        return PageText()
    il = layout.interline
    source = ocr_source(page_gray, work_gray, scale, layout)
    factor = _zoom_factor(page_gray, layout, scale)
    content_h = min(layout.height, work_gray.shape[0] * scale)
    systems = layout.systems
    page = PageText()
    for index in range(-1, len(systems)):
        y0 = 0.0 if index < 0 else systems[index].bottom + 0.6 * il
        y1 = systems[index + 1].top - 0.6 * il if index + 1 < len(systems) else content_h
        if y1 - y0 < 1.2 * il:
            continue
        words = _ocr_band(source, scale, y0, y1, factor, engine)
        lines = _group_lines(words)
        _classify_band(lines, index, systems, il, y1)
        page.lines.extend(lines)
    _drop_oversized(page, il)
    return page


def _zoom_factor(page_gray: np.ndarray, layout: PageLayout, scale: float) -> float:
    """Hệ số phóng vùng chữ theo chiều cao chữ đo được (không có chữ thì theo khoảng dòng kẻ ~ 1/2 chiều cao chữ)."""
    mask, count = text_mask(page_gray, layout)
    heights: list[int] = []
    if count:
        n, _labels, stats, _c = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
        heights = [int(stats[i][3]) for i in range(1, n) if stats[i][4] > 8]
    text_px = (float(np.median(heights)) if heights else 2.0 * layout.interline) / max(scale, 1e-6)
    return min(3.0, max(1.0, _TARGET_TEXT_PX / max(1.0, text_px)))


def _ocr_band(source: np.ndarray, scale: float, y0: float, y1: float, factor: float, engine: TextEngine) -> list[OcrWord]:
    top, bottom = int(max(0, y0 / scale)), int(min(source.shape[0], y1 / scale))
    crop = source[top:bottom]
    if crop.size == 0 or crop.min() > 200:
        return []
    if factor > 1.01:
        crop = cv2.resize(crop, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)
    pad = 12
    padded = cv2.copyMakeBorder(crop, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=255)
    out: list[OcrWord] = []
    for w in engine.read_words(padded):
        to_page = lambda v, off: ((v - pad) / factor + off) * scale  # noqa: E731
        left = to_page(w.left, 0)
        top_px = to_page(w.top, top)
        out.append(
            OcrWord(
                text=w.text,
                left=int(round(left)),
                top=int(round(top_px)),
                width=max(1, int(round(w.width / factor * scale))),
                height=max(1, int(round(w.height / factor * scale))),
                confidence=w.confidence,
                line_id=w.line_id,
            )
        )
    return out


def _group_lines(words: list[OcrWord]) -> list[TextLine]:
    """Gom từ thành dòng theo tâm dọc (dấu tiếng Việt làm khung từ cao thấp khác nhau nên dùng tâm, ngưỡng nửa cỡ chữ)."""
    if not words:
        return []
    heights = [w.height for w in words]
    tolerance = 0.55 * statistics.median(heights)
    ordered = sorted(words, key=lambda w: w.top + w.height / 2)
    groups: list[list[OcrWord]] = []
    for w in ordered:
        center = w.top + w.height / 2
        if groups:
            last = groups[-1]
            last_center = statistics.median(x.top + x.height / 2 for x in last)
            if abs(center - last_center) <= tolerance:
                last.append(w)
                continue
        groups.append([w])
    lines = []
    for group in groups:
        group.sort(key=lambda w: w.left)
        lines.append(
            TextLine(
                words=group,
                top=float(statistics.median(w.top for w in group)),
                bottom=float(statistics.median(w.bottom for w in group)),
            )
        )
    return lines


def _classify_band(lines: list[TextLine], index: int, systems, il: float, band_bottom: float) -> None:
    """Phân loại các dòng của vùng dưới hệ ``index`` (``-1``: vùng trên hệ đầu)."""
    next_top = systems[index + 1].top if index + 1 < len(systems) else None
    for line in lines:
        tokens = [w.text for w in line.words]
        chordish = sum(1 for t in tokens if is_chord(t)) / max(1, len(tokens))
        near_next = next_top is not None and next_top - line.bottom <= 4.5 * il
        if chordish >= 0.6 or (near_next and chordish >= 0.4 and line is lines[-1]):
            line.kind = KIND_CHORDS
            line.system = index + 1
        elif all(re.fullmatch(r"[\d\W]+", t) for t in tokens):
            line.kind = KIND_OTHER
        else:
            line.kind = KIND_LYRICS if index >= 0 else KIND_OTHER
            line.system = index

    if index < 0:
        return
    staff_bottom = systems[index].bottom
    block = [ln for ln in lines if ln.kind == KIND_LYRICS]
    previous: Optional[TextLine] = None
    ordinal = 0
    for line in block:
        if previous is None:
            if line.top - staff_bottom > 8.0 * il:  # chữ ở xa khuông: không phải lời của hệ này
                line.kind = KIND_OTHER
                continue
        elif line.top - previous.bottom > 1.8 * max(previous.height, line.height):
            line.kind = KIND_OTHER  # cách khối lời quá xa (tiêu đề, ghi chú cuối trang)
            continue
        ordinal += 1
        _apply_labels(line, ordinal)
        previous = line


def _apply_labels(line: TextLine, ordinal: int) -> None:
    """Đọc nhãn số lời ở đầu dòng; bỏ nhãn số lời và nhãn điệp khúc khỏi danh sách từ."""
    number: Optional[int] = None
    labels: list[str] = []
    kept: list[OcrWord] = []
    for position, w in enumerate(line.words):
        verse = VERSE_RE.match(w.text)
        if position == 0 and verse:
            number = int(verse.group(1))
            labels.append(w.text)
            continue
        if position == 0 and len(line.words) > 1 and VERSE_OCR_ONE_RE.match(w.text):
            number = 1
            labels.append(w.text)
            continue
        if LABEL_RE.match(w.text):
            labels.append(w.text)
            continue
        kept.append(w)
    line.words = kept or line.words
    line.number = number if number is not None else ordinal
    line.label = " ".join(labels) or None


def _drop_oversized(page: PageText, il: float) -> None:
    """Dòng "lời ca" cao hơn hẳn các dòng lời khác (tiêu đề bài thứ hai) -> OTHER."""
    lyric = [ln for ln in page.lines if ln.kind == KIND_LYRICS and ln.words]
    if len(lyric) < 2:
        return
    typical = statistics.median(statistics.median(w.height for w in ln.words) for ln in lyric)
    for ln in lyric:
        if statistics.median(w.height for w in ln.words) > 1.7 * typical:
            ln.kind = KIND_OTHER
    # Đánh lại số lời theo thứ tự nếu có dòng bị loại giữa khối mà không có nhãn số
    for system in {ln.system for ln in lyric}:
        block = [ln for ln in page.lines if ln.kind == KIND_LYRICS and ln.system == system]
        if all(ln.label is None or not VERSE_RE.match(ln.label.split()[0]) for ln in block):
            for ordinal, ln in enumerate(block, start=1):
                ln.number = ordinal
