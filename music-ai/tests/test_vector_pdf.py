"""PDF xuất từ phần mềm chép nhạc (app/omr/vector_pdf.py): font nhạc, xóa chữ theo lớp chữ, tên bài/tác giả/nhịp độ.

Lớp chữ của 4 PDF thật (trang 1) được lưu sẵn ở ``tests/fixtures/vector_pdf/*.json`` (đoạn chữ cùng font trên một dòng,
tọa độ điểm PDF) nên các test không cần PyMuPDF; riêng :func:`read_spans` cần PyMuPDF và tự bỏ qua nếu chưa cài.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

from app.omr import vector_pdf
from app.omr.vector_pdf import PageText, TextSpan

FIXTURES = Path(__file__).parent / "fixtures" / "vector_pdf"


def fixture(name: str) -> PageText:
    data = json.loads((FIXTURES / f"{name}-p1.json").read_text(encoding="utf-8"))
    return PageText(data["width"], data["height"], [TextSpan(**s) for s in data["spans"]])


@pytest.mark.parametrize(
    "name, expected",
    [
        ("Doi_Con_Thuoc_Ve_Chua", {"title": "Đời Con Thuộc Về Chúa", "composer": "Thiên Hưng"}),  # Sibelius (OpusStd)
        ("Ave_Maria_Gomez", {"title": "AVE MARIA", "composer": "William GOMEZ", "tempoBpm": 60}),  # Sibelius, "q = 60"
        ("Dem_Hong_An", {"title": "ĐÊM HỒNG ÂN", "composer": "Phùng Minh Mẫn"}),  # Finale, font nhạc không tên
        # MuseScore 4 (SMuFL): tác giả căn phải ngang tên bài, có dòng "Lời Thơ:", "Soạn Piano:" và tên hợp âm bên phải
        ("Giac_Mo_Trua", {"title": "Giấc Mơ Trưa", "composer": "Giáng Son - Thùy Chi", "tempoBpm": 60}),
    ],
)
def test_title_composer_and_tempo_come_from_the_text_layer(name, expected):
    page = fixture(name)
    assert page.is_music
    assert vector_pdf.page_text(page) == expected


def test_music_fonts_by_name_or_by_private_use_characters():
    assert vector_pdf.is_music_font("ABCDEF+OpusStd")
    assert vector_pdf.is_music_font("QDCAAA+Leland") and vector_pdf.is_music_font("Bravura_Text")
    assert vector_pdf.is_music_font("CIDFont+F1", "")  # Finale: font con không tên
    assert not vector_pdf.is_music_font("CIDFont+F3", "Đêm nay trên cao")
    assert not vector_pdf.is_music_font("TimesNewRomanPSMT", "")
    assert vector_pdf.music_fonts(fixture("Dem_Hong_An").spans) == {"CIDFont+F1"}


def test_scanned_pdf_with_a_few_ocr_words_is_not_vector_music():
    page = PageText(600, 800, [TextSpan("Times", "Ave Maria", 18, 100, 50, 300, 70)])
    assert not page.is_music and not vector_pdf.is_music_pdf([page])


def test_chord_names_are_counted_so_the_warning_survives_text_removal():
    assert vector_pdf.chord_names(fixture("Giac_Mo_Trua")) >= 10
    assert vector_pdf.chord_names(fixture("Dem_Hong_An")) >= 10
    assert vector_pdf.chord_names(fixture("Doi_Con_Thuoc_Ve_Chua")) == 0  # bài không in hợp âm


def _page_with_lyric_and_stem():
    gray = np.full((200, 400), 255, np.uint8)
    for k in range(5):
        cv2.line(gray, (10, 40 + 10 * k), (390, 40 + 10 * k), 0, 1)
    cv2.putText(gray, "con", (100, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 0, 2)
    cv2.line(gray, (130, 60), (130, 150), 0, 2)  # thân nốt đi xuyên qua khung chữ
    return gray


def test_erase_text_removes_only_blobs_fully_inside_text_boxes():
    gray = _page_with_lyric_and_stem()
    out, count = vector_pdf.erase_text(gray, [(95, 115, 160, 145)])
    assert count >= 2  # các chữ của "con" (trừ phần dính thân nốt)
    assert (out[60:150, 129:132] < 128).sum() >= 80  # thân nốt còn nguyên
    assert (out[40:81, 10:390] < 128).sum() == (gray[40:81, 10:390] < 128).sum()  # khuông không đổi
    assert (out[118:145, 100:125] < 128).sum() == 0  # chữ "c" bị xóa


def test_protected_band_is_never_erased():
    gray = _page_with_lyric_and_stem()
    protect = np.zeros(gray.shape, bool)
    protect[110:150, :] = True
    out, count = vector_pdf.erase_text(gray, [(95, 115, 160, 145)], protect)
    assert count == 0 and np.array_equal(out, gray)


def test_clean_vector_pages_sets_page_text_and_chord_pages():
    from app.omr.pipeline import _clean_vector_pages

    page = fixture("Giac_Mo_Trua")
    gray = np.full((int(page.height * 2), int(page.width * 2)), 255, np.uint8)
    ctx = SimpleNamespace(task_id="t", chord_pages=set(), page_text={}, vector_pdf=None)
    pages = [(1, gray)]
    _clean_vector_pages(ctx, pages, [page])
    assert ctx.page_text["title"] == "Giấc Mơ Trưa" and ctx.page_text["tempoBpm"] == 60
    assert ctx.vector_pdf == {"pages": 1, "erasedText": 0} and ctx.chord_pages == {1}

    scanned = SimpleNamespace(task_id="t", chord_pages=set(), page_text={}, vector_pdf=None)
    _clean_vector_pages(scanned, [(1, gray)], [PageText(600, 800, [TextSpan("Times", "Ave", 12, 0, 0, 30, 12)])])
    assert scanned.vector_pdf is None and scanned.page_text == {}


def test_read_spans_with_pymupdf(tmp_path):
    pymupdf = pytest.importorskip("pymupdf")
    document = pymupdf.open()
    page = document.new_page(width=595, height=842)
    page.insert_text((72, 80), "Giac Mo Trua", fontsize=22, fontname="helv")
    page.insert_text((400, 110), "Giang Son", fontsize=10, fontname="helv")
    text = vector_pdf.read_spans(page)
    assert (text.width, text.height) == (595, 842)
    titles = [s for s in text.spans if s.text.strip() == "Giac Mo Trua"]
    assert titles and titles[0].size == pytest.approx(22, abs=0.5) and titles[0].y1 > titles[0].y0
    assert not text.is_music
