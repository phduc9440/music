"""Ký hiệu nhạc đọc thẳng từ PDF vector (O-13): đầu nốt, chấm dôi, dấu hóa, khóa, dấu lặng.

PDF xuất từ phần mềm chép nhạc vẽ mỗi ký hiệu bằng một ký tự của font nhạc (:class:`app.omr.vector_pdf.Glyph`), nên vị
trí từng đầu nốt, chấm dôi là chính xác tuyệt đối thay vì phải dò trên ảnh bằng OpenCV như :mod:`app.omr.pitch_check`.
Hai họ mã ký tự:

* **SMuFL** (MuseScore: Leland, Bravura...; Dorico; Finale bản mới): mã chuẩn ở vùng U+E000–U+EFFF, vd. U+E0A4 đầu nốt đen.
* **Sonata/Maestro** (Sibelius: Opus, OpusStd; Finale/Encore cũ: Maestro, Anastasia...): mã một byte theo bảng Sonata
  (0xCF đầu nốt đen, 0xFA đầu nốt trắng, "w" nốt tròn, "." chấm, "#" thăng, "b" giáng...). Tùy font và thư viện đọc PDF,
  byte này hiện ra dưới dạng U+F0xx (font ký hiệu), ký tự MacRoman ("œ" = 0xCF) hoặc Latin-1; :func:`_sonata_codes` thử
  cả hai cách đọc và chọn cách cho nhiều đầu nốt hơn.

Họ mã được nhận theo chính các ký tự của font (đa số ở vùng SMuFL hay không), không theo tên font: Finale xuất font nhúng
không tên ("F1"). Mã đã đối chiếu trên PDF thật: Opus (Ave Maria - Gomez), OpusStd (Đời Con Thuộc Về Chúa), Anastasia
(Đêm Hồng Ân), Leland (Giấc Mơ Trưa).

Tọa độ đi qua ba hệ: điểm PDF -> pixel ảnh vẽ từ PDF -> ảnh trang đã tiền xử lý (``PageResult.transform``). Trước khi dùng,
:func:`build_page` kiểm lại trên ảnh: đầu nốt đen phải nằm trên mực và đúng nửa khoảng dòng kẻ; không đạt (đọc nhầm mã
font, lệch tọa độ) thì bỏ, mọi bước quay về dò ảnh như cũ.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Iterable, Optional

import numpy as np

from app.omr.layout import PageLayout
from app.omr.pitch_check import Head
from app.omr.vector_pdf import Glyph, PageText

log = logging.getLogger(__name__)

HEAD = "head"
DOT = "dot"
ACCIDENTAL = "accidental"
CLEF = "clef"
REST = "rest"

_SMUFL: dict[int, tuple[str, str]] = {
    0xE0A0: (HEAD, "whole"),  # noteheadDoubleWhole
    0xE0A2: (HEAD, "whole"),
    0xE0A3: (HEAD, "half"),
    0xE0A4: (HEAD, "black"),
    0xE0D9: (HEAD, "half"),  # noteheadDiamondHalf
    0xE0DB: (HEAD, "black"),  # noteheadDiamondBlack
    0xE1E7: (DOT, ""),  # augmentationDot (chấm staccato là mã khác: E4A2/E4A3)
    0xE260: (ACCIDENTAL, "flat"),
    0xE261: (ACCIDENTAL, "natural"),
    0xE262: (ACCIDENTAL, "sharp"),
    0xE263: (ACCIDENTAL, "sharp"),  # thăng kép
    0xE264: (ACCIDENTAL, "flat"),  # giáng kép
    0xE050: (CLEF, "G"),
    0xE052: (CLEF, "G"),  # khóa Sol 8 dưới
    0xE053: (CLEF, "G"),
    0xE05C: (CLEF, "C"),
    0xE062: (CLEF, "F"),
    **{code: (REST, "") for code in range(0xE4E2, 0xE4EB)},  # restDoubleWhole .. rest128th
}

_SONATA: dict[int, tuple[str, str]] = {
    0xCF: (HEAD, "black"),
    0xF6: (HEAD, "black"),  # đầu nốt đen thứ hai của Anastasia (Finale/Encore)
    0xE2: (HEAD, "black"),  # đầu nốt hình thoi đen (Anastasia)
    0xFA: (HEAD, "half"),
    0xE1: (HEAD, "half"),  # đầu nốt hình thoi trắng (Anastasia)
    0x77: (HEAD, "whole"),
    0x2E: (DOT, ""),  # cùng mã cho chấm dôi và chấm staccato: phân biệt theo vị trí (:func:`_augmentation_dots`)
    0x23: (ACCIDENTAL, "sharp"),
    0x62: (ACCIDENTAL, "flat"),
    0x6E: (ACCIDENTAL, "natural"),
    0x26: (CLEF, "G"),
    0x3F: (CLEF, "F"),
    0x42: (CLEF, "C"),
    0xCE: (REST, ""),  # lặng đen
    0xE4: (REST, ""),  # lặng đơn
    0xC5: (REST, ""),  # lặng kép
    0xB7: (REST, ""),  # lặng tròn
    0xEE: (REST, ""),  # lặng trắng
}

_SONATA_HEADS = {code for code, (kind, _d) in _SONATA.items() if kind == HEAD}


@dataclass(frozen=True)
class Mark:
    """Một ký hiệu đã phân loại. ``x`` là tâm theo chiều ngang, ``y`` là đường chân chữ (tâm đầu nốt/chấm/dấu hóa)."""

    kind: str
    detail: str
    x: float
    y: float


# ====================================================================== phân loại mã font


def classify(page: PageText) -> list[Mark]:
    """Các ký hiệu nhận ra được trên một trang (tọa độ điểm PDF). Ký tự font nhạc không có trong bảng (dầm, đuôi móc,
    dấu nhấn, số chỉ nhịp...) bị bỏ qua."""
    return [mark for _glyph, mark in classify_glyphs(page) if mark is not None]


def classify_glyphs(page: PageText) -> list[tuple[Glyph, Optional[Mark]]]:
    """Từng ký tự font nhạc kèm ký hiệu nhận ra (None nếu không có trong bảng), theo thứ tự font rồi thứ tự trên trang."""
    by_font: dict[str, list[Glyph]] = {}
    for glyph in page.glyphs:
        by_font.setdefault(glyph.font, []).append(glyph)
    out: list[tuple[Glyph, Optional[Mark]]] = []
    for glyphs in by_font.values():
        for glyph, code in zip(glyphs, _font_codes(glyphs)):
            mark = Mark(code[0], code[1], (glyph.x0 + glyph.x1) / 2.0, glyph.y) if code is not None else None
            out.append((glyph, mark))
    return out


def _font_codes(glyphs: list[Glyph]) -> list[Optional[tuple[str, str]]]:
    chars = [g.char for g in glyphs]
    smufl = sum(1 for c in chars if 0xE000 <= ord(c[0]) <= 0xEFFF)
    if smufl >= 0.5 * len(chars):
        return [_SMUFL.get(ord(c[0])) for c in chars]
    return [_SONATA.get(code) if code is not None else None for code in _sonata_codes(chars)]


def _sonata_codes(chars: list[str]) -> list[Optional[int]]:
    """Byte mã Sonata của từng ký tự. Ký tự ngoài ASCII đọc được theo MacRoman hoặc Latin-1 tùy font: chọn cách cho nhiều
    đầu nốt hơn (cả hai cách đều đọc U+F0xx -> 0xxx và ASCII như nhau)."""

    def decode(char: str, encoding: str) -> Optional[int]:
        code = ord(char[0])
        if 0xF000 <= code <= 0xF0FF:
            return code - 0xF000
        if code < 0x80:
            return code
        try:
            raw = char[0].encode(encoding)
        except UnicodeEncodeError:
            return None
        return raw[0] if len(raw) == 1 else None

    best: list[Optional[int]] = []
    best_heads = -1
    for encoding in ("mac_roman", "latin-1"):
        codes = [decode(c, encoding) for c in chars]
        heads = sum(1 for c in codes if c in _SONATA_HEADS)
        if heads > best_heads:
            best, best_heads = codes, heads
    return best


def summary(marks: Iterable[Mark]) -> dict[str, int]:
    """Số ký hiệu theo loại (ghi vào ``measureCheck`` để biết đã đọc được gì từ PDF)."""
    out: dict[str, int] = {}
    for mark in marks:
        out[mark.kind] = out.get(mark.kind, 0) + 1
    return out


# ====================================================================== đặt lên ảnh trang


def to_image(marks: list[Mark], page: PageText, source_shape: tuple[int, ...], transform: np.ndarray) -> list[Mark]:
    """Đổi tọa độ điểm PDF -> ảnh trang đã tiền xử lý. ``source_shape``: kích thước ảnh vẽ từ trang PDF (đưa vào tiền
    xử lý); ``transform``: ``PageResult.transform``."""
    if not marks or page.width <= 0 or page.height <= 0:
        return []
    sx, sy = source_shape[1] / page.width, source_shape[0] / page.height
    points = np.array([[m.x * sx, m.y * sy, 1.0] for m in marks]).T
    mapped = transform @ points
    return [Mark(m.kind, m.detail, float(x), float(y)) for m, x, y in zip(marks, mapped[0], mapped[1])]


@dataclass
class GlyphPage:
    """Ký hiệu của một trang đã gán vào hệ/khuông của bố cục (tọa độ ảnh trang đã tiền xử lý)."""

    heads: list[Head]
    dots: list[tuple[int, float]] = field(default_factory=list)
    """Chấm dôi ``(chỉ số hệ, x)`` (chấm staccato đã bị loại)."""

    system_staves: list[int] = field(default_factory=list)
    """Số khuông của từng hệ (theo bố cục)."""

    def measure(self, system: int, x0: float, x1: float) -> dict:
        """Bằng chứng của một ô (hệ ``system``, ``x0 <= x < x1``): số đầu nốt, số chấm dôi, vị trí khuông các đầu nốt của
        từng khuông (trên xuống, mỗi khuông theo thứ tự x rồi từ thấp lên cao)."""
        heads = [h for h in self.heads if h.system == system and x0 <= h.x < x1]
        staves: list[list[int]] = []
        count = self.system_staves[system] if system < len(self.system_staves) else 0
        for staff in range(count):
            own = sorted((h for h in heads if h.staff == staff), key=lambda h: (round(h.x), h.step))
            staves.append([h.step for h in own])
        return {
            "heads": len(heads),
            "dots": sum(1 for s, x in self.dots if s == system and x0 <= x < x1),
            "staves": staves,
        }


MIN_HEADS = 8
"""Ít hơn số đầu nốt này thì không đủ để kiểm việc đặt ký hiệu lên ảnh."""

_MIN_ON_INK = 0.85
"""Tỉ lệ đầu nốt đen tối thiểu phải nằm trên mực của ảnh."""

_MIN_ON_STEP = 0.85
"""Tỉ lệ đầu nốt tối thiểu phải nằm đúng dòng kẻ/khe (lệch <= 0,3 nửa khoảng dòng kẻ)."""

_MAX_LEDGER = 5.0
"""Đầu nốt cách khuông gần nhất quá số khoảng dòng kẻ này (sơ đồ hợp âm, ô chú thích...) thì bỏ."""


def build_page(marks: list[Mark], layout: PageLayout, image: np.ndarray) -> Optional[GlyphPage]:
    """Gán ký hiệu (tọa độ ảnh) vào hệ/khuông của bố cục và kiểm lại trên ảnh. None nếu bố cục chưa có hệ, quá ít đầu nốt
    hoặc ký hiệu không khớp ảnh (khi đó không dùng PDF cho trang này)."""
    if not layout.systems or layout.interline <= 0:
        return None
    il = layout.interline
    staves = [(si, ti, staff) for si, system in enumerate(layout.systems) for ti, staff in enumerate(system.staves)]
    heads: list[Head] = []
    offsets: list[float] = []
    black: list[tuple[float, float]] = []
    anchors: list[tuple[int, float, float, bool]] = []  # (hệ, x, y, là đầu nốt)
    for mark in marks:
        if mark.kind not in (HEAD, REST):
            continue
        si, ti, staff = min(staves, key=lambda item: max(0.0, item[2].top - mark.y, mark.y - item[2].bottom))
        if max(0.0, staff.top - mark.y, mark.y - staff.bottom) > _MAX_LEDGER * il:
            continue
        anchors.append((si, mark.x, mark.y, mark.kind == HEAD))
        if mark.kind != HEAD:
            continue
        exact = (staff.bottom - mark.y) / (il / 2.0)
        step = int(round(exact))
        offsets.append(abs(exact - step))
        heads.append(Head(system=si, staff=ti, x=mark.x, step=step))
        if mark.detail == "black":
            black.append((mark.x, mark.y))
    if len(heads) < MIN_HEADS:
        return None
    on_step = float(np.mean(np.array(offsets) <= 0.3))
    on_ink = _share_on_ink(black, image, il) if black else 1.0
    if on_step < _MIN_ON_STEP or on_ink < _MIN_ON_INK:
        log.info("Ký hiệu PDF không khớp ảnh trang (đúng dòng kẻ %.2f, trên mực %.2f): bỏ qua", on_step, on_ink)
        return None
    dots = _augmentation_dots([m for m in marks if m.kind == DOT], anchors, staves, il)
    return GlyphPage(heads=heads, dots=dots, system_staves=[len(system.staves) for system in layout.systems])


def _share_on_ink(points: list[tuple[float, float]], image: np.ndarray, il: float) -> float:
    """Tỉ lệ điểm mà ô nhỏ quanh nó (0,7 x 0,4 khoảng dòng kẻ) phần lớn là mực."""
    h, w = image.shape[:2]
    ink = image < 128
    rx, ry = max(1, int(round(0.35 * il))), max(1, int(round(0.2 * il)))
    good = 0
    for x, y in points:
        cx, cy = int(round(x)), int(round(y))
        if not (0 <= cx < w and 0 <= cy < h):
            continue
        window = ink[max(0, cy - ry) : cy + ry + 1, max(0, cx - rx) : cx + rx + 1]
        if window.size and float(window.mean()) >= 0.6:
            good += 1
    return good / float(len(points))


def _augmentation_dots(
    dots: list[Mark], anchors: list[tuple[int, float, float, bool]], staves: list, il: float
) -> list[tuple[int, float]]:
    """Chấm dôi trong số các chấm: nằm bên phải một đầu nốt/dấu lặng (0,4–3 khoảng dòng kẻ, cùng độ cao trong 0,75 khoảng;
    dấu lặng thì 2 khoảng) hoặc ngay sau một chấm dôi khác (chấm dôi kép). Chấm nằm thẳng trên/dưới một đầu nốt là chấm
    staccato (font họ Sonata dùng chung mã với chấm dôi)."""
    out: list[tuple[int, float]] = []
    accepted: list[tuple[int, float, float]] = []
    for dot in sorted(dots, key=lambda d: d.x):
        if not staves:
            break
        si, _ti, staff = min(staves, key=lambda item: max(0.0, item[2].top - dot.y, dot.y - item[2].bottom))
        if max(0.0, staff.top - dot.y, dot.y - staff.bottom) > _MAX_LEDGER * il:
            continue
        if any(head and s == si and abs(dot.x - x) <= 0.45 * il and abs(dot.y - y) <= 3.5 * il for s, x, y, head in anchors):
            continue  # staccato
        after_note = any(
            s == si and 0.4 * il <= dot.x - x <= 3.0 * il and abs(dot.y - y) <= (0.75 if head else 2.0) * il
            for s, x, y, head in anchors
        )
        after_dot = any(s == si and 0.3 * il <= dot.x - x <= 1.2 * il and abs(dot.y - y) <= 0.3 * il for s, x, y in accepted)
        if after_note or after_dot:
            out.append((si, dot.x))
            accepted.append((si, dot.x, dot.y))
    return out


# ====================================================================== gắn vào bản đồ ô nhịp


def attach(entries: list[dict], pages: dict[int, GlyphPage], layouts: dict[int, PageLayout]) -> int:
    """Ghi bằng chứng PDF của từng ô vào ``entry["_glyph"]`` (chỉ ô có khung đúng ô trên ảnh, không phải khung cả hệ).
    Trả số ô được gắn."""
    count = 0
    for entry in entries:
        entry.pop("_glyph", None)
        page = pages.get(entry.get("page"))
        layout = layouts.get(entry.get("page"))
        box, system = entry.get("box"), entry.get("system")
        if page is None or layout is None or not box or not system or not entry.get("_exact"):
            continue
        entry["_glyph"] = page.measure(int(system) - 1, float(box[0]), float(box[2]))
        count += 1
    return count
