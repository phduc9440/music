"""Xem nhanh ký hiệu nhạc đọc được từ một PDF (O-11, O-13), không cần model. Chạy từ thư mục music-ai:

    python scripts/pdf_glyphs.py ../music-be/storage/benchmark-inputs/Giac_Mo_Trua.pdf

Mỗi trang in: loại trang (PDF vector có font nhạc hay không), các font nhạc, số ký hiệu theo loại (đầu nốt,
chấm, dấu hóa, khóa, dấu lặng) và các mã ký tự font nhạc chưa có trong bảng của ``app/omr/glyphs.py`` (dầm, đuôi móc, số
chỉ nhịp... là bình thường; dùng để bổ sung bảng khi gặp font mới). Trang vector mà ``head`` bằng 0 nghĩa là mã font chưa
được nhận: pipeline sẽ dò đầu nốt trên ảnh như cũ.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.omr import glyphs, vector_pdf  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pdf", type=Path)
    args = parser.parse_args()
    import pymupdf  # noqa: PLC0415 - chỉ script này cần PyMuPDF thật

    with pymupdf.open(args.pdf) as document:
        for index, page in enumerate(document, start=1):
            text = vector_pdf.read_spans(page)
            kind = "vector" if text.is_music else "không phải PDF vector"
            pairs = glyphs.classify_glyphs(text)
            fonts = sorted(vector_pdf.font_name(f) for f in vector_pdf.music_fonts(text.spans))
            print(f"Trang {index}: {kind}, font nhạc {fonts}")
            print(f"  ký hiệu: {glyphs.summary(mark for _g, mark in pairs if mark is not None)}")
            unknown = Counter((vector_pdf.font_name(g.font), g.char) for g, mark in pairs if mark is None)
            if unknown:
                listed = ", ".join(f"{font} U+{ord(char[0]):04X} x{count}" for (font, char), count in unknown.most_common(12))
                print(f"  mã chưa nhận: {listed}")


if __name__ == "__main__":
    main()
