"""PDF xuất thẳng từ phần mềm chép nhạc (Sibelius, Finale, MuseScore...): đọc lớp chữ để xóa chữ chính xác và lấy tên bài.

PDF loại này không phải ảnh: ký hiệu nhạc là ký tự của một font nhạc (Opus/OpusStd của Sibelius, Maestro của Finale,
Leland/Bravura/Emmentaler của MuseScore theo chuẩn SMuFL), còn lời ca, tên hợp âm, tên bài là chữ thường. Biết ký tự nào
thuộc font nào thì:

* **xóa chữ chính xác** (:func:`erase_text`): chỉ xóa những mảng mực nằm trọn trong khung một đoạn chữ thường, nên không
  bao giờ xóa nhầm chấm dôi, số liên ba (font nhạc) hay nốt (chạm khuông). Khung nhạc đưa vào model sạch như dữ liệu
  train; bước xóa chữ bằng ảnh (:mod:`app.omr.textstrip`) chạy sau chỉ còn ít việc;
* **đọc tên bài, tác giả, nhịp độ** (:func:`page_text`): chữ to nhất đầu trang 1 là tên bài, dòng căn phải ngay dưới là
  tác giả, "♩ = 60"/"q = 60" là nhịp độ. Lời ca không đưa vào bản số.

Mô-đun chỉ làm việc trên danh sách :class:`TextSpan` (tọa độ điểm PDF, gốc trên-trái) nên test được mà không cần
PyMuPDF; :func:`read_spans` là chỗ duy nhất gọi PyMuPDF (``page.get_text("dict")``).
"""

from __future__ import annotations

import re
import statistics
import unicodedata
from dataclasses import dataclass
from typing import Iterable, Optional

import cv2
import numpy as np

_MUSIC_FONT_NAMES = (
    "opus", "maestro", "petrucci", "engraver", "jazz", "leland", "bravura", "petaluma", "emmentaler", "gonville",
    "sebastian", "finale", "november", "mscore", "musescore", "broadway", "inkpen", "reprise", "helsinki", "norfolk",
    "golden age", "lilyjazz", "feta", "musejazz", "kousaku", "chopin", "tamburo", "ekmelos", "fughetta",
)
"""Tên (viết thường) có chứa một trong các chuỗi này là font nhạc. Font nhúng không tên (Finale xuất "F1") nhận ra bằng
:data:`_SYMBOL_SHARE`."""

_SYMBOL_SHARE = 0.6
"""Font không tên mà từ tỉ lệ này ký tự trở lên nằm ở vùng riêng (U+E000–U+F8FF, nơi các font nhạc đặt ký hiệu) cũng là
font nhạc (Finale xuất PDF với font con "F1" chứa ký tự U+F0xx)."""

MIN_MUSIC_GLYPHS = 20
"""Trang có ít nhất bấy nhiêu ký tự font nhạc mới coi là trang nhạc vector (PDF scan có vài chữ OCR thì không)."""

_TEMPO = re.compile("(?:\u2669|\U0001D15F|q|[\ue1d0-\ue1ef]|[\ueca0-\uecbf]|\uf071)\\s*=\\s*(\\d{2,3})")
"""Nhịp độ in trên bản: nốt đen (ký tự ♩, chữ "q" của font Opus, nốt SMuFL ở vùng nốt lẻ E1D0– hoặc vùng ký hiệu nhịp
máy ECA0–) "=" số."""

_CHORD = re.compile(r"^[A-G](?:#|b|\u266f|\u266d)?(?:m|maj|min|dim|aug|sus|add|M|\u00b0|\u00f8)*\d*(?:/[A-G](?:#|b|\u266f|\u266d)?)?$")
"""Tên hợp âm (Am, G/B, Gsus4, F#dim...): không phải tên tác giả dù nằm bên phải đầu trang."""

_LABEL = re.compile(r"^\s*[^\s:]{1,20}(?:\s[^\s:]{1,20}){0,3}\s*:")
"""Dòng dạng "Web: ...", "Lời Thơ: ...", "Soạn Piano: ..." ở đầu trang không phải tên tác giả."""


@dataclass(frozen=True)
class TextSpan:
    """Một đoạn chữ cùng font trên một dòng, tọa độ theo điểm PDF (gốc trên-trái, y hướng xuống)."""

    font: str
    text: str
    size: float
    x0: float
    y0: float
    x1: float
    y1: float


@dataclass
class PageText:
    """Lớp chữ của một trang PDF."""

    width: float
    height: float
    spans: list[TextSpan]

    @property
    def music_glyphs(self) -> int:
        return sum(len(s.text.strip()) for s in self.spans if is_music_font(s.font, s.text))

    @property
    def is_music(self) -> bool:
        return self.music_glyphs >= MIN_MUSIC_GLYPHS


# ====================================================================== đọc PDF


def read_spans(page) -> PageText:
    """Lớp chữ của một trang PyMuPDF (``page.get_text("dict")``): mỗi span là một đoạn chữ cùng font trên một dòng."""
    data = page.get_text("dict")
    spans: list[TextSpan] = []
    for block in data.get("blocks", []):
        if block.get("type", 0) != 0:
            continue  # khối ảnh
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not text.strip():
                    continue
                x0, y0, x1, y1 = span["bbox"]
                spans.append(TextSpan(span.get("font", ""), text, float(span.get("size", 0.0)), x0, y0, x1, y1))
    return PageText(float(page.rect.width), float(page.rect.height), spans)


# ====================================================================== phân loại font


def font_name(raw: str) -> str:
    """Tên font bỏ tiền tố font con ("ABCDEF+Opus" -> "Opus")."""
    return raw.split("+", 1)[-1]


def is_music_font(raw_name: str, sample: str = "") -> bool:
    """Font chứa ký hiệu nhạc: tên quen thuộc của font nhạc, hoặc phần lớn ký tự ở vùng riêng Unicode."""
    name = font_name(raw_name).lower()
    if any(key in name for key in _MUSIC_FONT_NAMES):
        return True
    chars = [c for c in sample if not c.isspace()]
    if not chars:
        return False
    private = sum(1 for c in chars if 0xE000 <= ord(c) <= 0xF8FF or c == "\ufffd")
    return private / len(chars) >= _SYMBOL_SHARE


def music_fonts(spans: Iterable[TextSpan]) -> set[str]:
    """Các font nhạc trên trang, xét cả font (gộp mọi span cùng font) chứ không xét từng span lẻ."""
    by_font: dict[str, list[str]] = {}
    for span in spans:
        by_font.setdefault(span.font, []).append(span.text)
    return {font for font, texts in by_font.items() if is_music_font(font, "".join(texts))}


def is_music_pdf(pages: list[PageText]) -> bool:
    """PDF nhạc vector: có ít nhất một trang đủ ký tự font nhạc."""
    return any(page.is_music for page in pages)


# ====================================================================== xóa chữ


def text_boxes(page: PageText, scale_x: float, scale_y: float) -> list[tuple[int, int, int, int]]:
    """Khung (pixel trên ảnh đã vẽ) của mọi đoạn chữ KHÔNG thuộc font nhạc."""
    musical = music_fonts(page.spans)
    boxes = []
    for span in page.spans:
        if span.font in musical:
            continue
        boxes.append(
            (
                int(np.floor(span.x0 * scale_x)),
                int(np.floor(span.y0 * scale_y)),
                int(np.ceil(span.x1 * scale_x)),
                int(np.ceil(span.y1 * scale_y)),
            )
        )
    return boxes


def erase_text(gray: np.ndarray, boxes: list[tuple[int, int, int, int]], protect: Optional[np.ndarray] = None) -> tuple[np.ndarray, int]:
    """Xóa các mảng mực nằm TRỌN trong khung chữ (nới 2 px). Trả ``(ảnh mới, số mảng đã xóa)``.

    Nốt, thân nốt, dầm, dòng kẻ... đi xuyên qua khung chữ thì không nằm trọn trong khung nên được giữ; ``protect`` (mặt nạ
    bool, vd. dải khuông) là vùng không bao giờ xóa, phòng khi font nhạc bị nhận nhầm là chữ thường."""
    if not boxes:
        return gray, 0
    height, width = gray.shape
    inside = np.zeros((height, width), dtype=np.uint8)
    for x0, y0, x1, y1 in boxes:
        inside[max(0, y0 - 2) : min(height, y1 + 3), max(0, x0 - 2) : min(width, x1 + 3)] = 1
    background = float(np.percentile(gray, 90))
    ink = (gray < min(200.0, background - 40)).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    if count <= 1:
        return gray, 0
    total = np.bincount(labels.ravel(), minlength=count)
    covered = np.bincount(labels.ravel(), weights=inside.ravel(), minlength=count)
    erase = (covered >= total) & (np.arange(count) > 0)
    if protect is not None:
        touched = np.bincount(labels.ravel(), weights=protect.ravel().astype(np.float64), minlength=count)
        erase &= touched == 0
    if not erase.any():
        return gray, 0
    mask = cv2.dilate(erase[labels].astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    mask &= inside > 0
    out = gray.copy()
    out[mask] = 255
    return out, int(erase.sum())


def staff_bands(gray: np.ndarray) -> Optional[np.ndarray]:
    """Mặt nạ dải khuông (dòng kẻ ± 0,3 khoảng dòng kẻ) theo bố cục của chính ảnh vẽ; None nếu không dò được khuông."""
    from app.omr.layout import analyze_layout  # noqa: PLC0415 - tránh import vòng khi layout dùng mô-đun này

    layout = analyze_layout(gray)
    if not layout.systems or layout.interline <= 0:
        return None
    mask = np.zeros(gray.shape, dtype=bool)
    margin = 0.3 * layout.interline
    for system in layout.systems:
        for staff in system.staves:
            mask[max(0, int(staff.top - margin)) : int(staff.bottom + margin) + 1, :] = True
    return mask


def clean_page(gray: np.ndarray, page: PageText) -> tuple[np.ndarray, int]:
    """Ảnh trang đã xóa chữ thường theo lớp chữ PDF (giữ dải khuông). Trang không phải nhạc vector thì trả nguyên ảnh."""
    if not page.is_music or page.width <= 0 or page.height <= 0:
        return gray, 0
    scale_x, scale_y = gray.shape[1] / page.width, gray.shape[0] / page.height
    return erase_text(gray, text_boxes(page, scale_x, scale_y), staff_bands(gray))


# ====================================================================== tên bài, tác giả, nhịp độ


@dataclass
class _Line:
    text: str
    size: float
    x0: float
    x1: float
    y0: float
    y1: float


def _lines(spans: list[TextSpan], musical: set[str]) -> list[_Line]:
    """Gộp các span chữ thường cùng dòng (đáy lệch nhau < 40% cỡ chữ, cách nhau < 1,5 cỡ chữ) thành dòng, trên xuống."""
    ordered = sorted((s for s in spans if s.font not in musical), key=lambda s: (round(s.y1), s.x0))
    lines: list[list[TextSpan]] = []
    for span in ordered:
        for line in lines:
            last = line[-1]
            if abs(last.y1 - span.y1) < 0.4 * max(last.size, span.size) and span.x0 - last.x1 < 1.5 * max(last.size, span.size):
                line.append(span)
                break
        else:
            lines.append([span])
    out = []
    for line in lines:
        line.sort(key=lambda s: s.x0)
        text = ""
        for prev, span in zip([None] + line[:-1], line):
            gap = span.x0 - prev.x1 if prev else 0
            text += (" " if prev and gap > 0.15 * span.size and not text.endswith(" ") else "") + span.text
        out.append(
            _Line(
                unicodedata.normalize("NFC", " ".join(text.split())),
                max(s.size for s in line),
                min(s.x0 for s in line),
                max(s.x1 for s in line),
                min(s.y0 for s in line),
                max(s.y1 for s in line),
            )
        )
    return sorted(out, key=lambda l: (l.y0, l.x0))


def page_text(page: PageText) -> dict:
    """``{title, composer, tempoBpm}`` đọc từ lớp chữ trang 1 (thiếu thì không có khóa đó).

    * tên bài: dòng chữ cỡ lớn nhất ở 1/4 trên của trang, lớn hơn hẳn chữ thường (≥ 1,3 lần cỡ chữ trung vị);
    * tác giả: dòng căn phải (bắt đầu từ nửa phải trang) đầu tiên dưới tên bài trong 1/3 trên trang, không phải dòng
      dạng "Nhãn: ..." (Web:, Lời:, Soạn piano:);
    * nhịp độ: "♩ = 60" (ký tự nốt của font nhạc hoặc chữ "q" của font Opus) ở bất kỳ đâu trên trang, 20–300.
    """
    out: dict = {}
    musical = music_fonts(page.spans)
    lines = _lines(page.spans, musical)
    sizes = [s.size for s in page.spans if s.font not in musical and s.size > 0]
    if lines and sizes:
        body = statistics.median(sizes)
        top = [l for l in lines if l.y1 <= 0.25 * page.height and len(l.text) >= 2]
        if top:
            title = max(top, key=lambda l: (l.size, -l.y0))
            if title.size >= 1.3 * body:
                out["title"] = title.text
                for line in lines:
                    # dòng tác giả có thể bắt đầu ngang thân tên bài (chữ nhỏ căn phải) nhưng đáy phải thấp hơn tên bài
                    if line is title or line.y0 < title.y0 or line.y1 <= title.y1 or line.y1 > page.height / 3:
                        continue
                    if line.x0 < 0.5 * page.width or len(line.text) < 2 or _LABEL.match(line.text):
                        continue
                    if all(_CHORD.match(token) for token in line.text.split()):
                        continue  # tên hợp âm phía trên khuông đầu
                    out["composer"] = line.text
                    break
    tempo = _tempo(page.spans)
    if tempo:
        out["tempoBpm"] = tempo
    return out


def chord_names(page: PageText) -> int:
    """Số tên hợp âm in trên trang (đoạn chữ thường dạng Am, G/B, Gsus4). Chữ đã bị xóa khỏi ảnh nên cảnh báo "hợp âm
    trên bản gốc không có trong bản số" dựa vào số này thay vì dò chữ trên ảnh."""
    musical = music_fonts(page.spans)
    return sum(
        1
        for span in page.spans
        if span.font not in musical and span.text.split() and all(_CHORD.match(t) for t in span.text.split())
    )


def _tempo(spans: list[TextSpan]) -> Optional[int]:
    """Nhịp độ in trên trang: nối chữ (kể cả ký tự font nhạc) theo dòng rồi tìm "nốt đen = số"."""
    rows: list[list[TextSpan]] = []
    for span in sorted(spans, key=lambda s: (s.y0 + s.y1) / 2):
        middle = (span.y0 + span.y1) / 2
        row = next((r for r in rows if abs((r[0].y0 + r[0].y1) / 2 - middle) < 0.5 * max(r[0].size, span.size)), None)
        if row is None:
            rows.append([span])
        else:
            row.append(span)  # ký tự nốt của font nhạc lệch chân chữ vài điểm so với "= 60" nên gom theo tâm dòng
    for row in rows:
        text = "".join(s.text for s in sorted(row, key=lambda s: s.x0))
        match = _TEMPO.search(text)
        if match and 20 <= int(match.group(1)) <= 300:
            return int(match.group(1))
    return None
