"""Nhánh lời ca (app/omr/lyrics): âm tiết, phân loại dòng, cột đầu nốt, căn âm tiết - nốt, chèn MusicXML."""

import xml.etree.ElementTree as ET
from fractions import Fraction

import cv2
import numpy as np
import pytest

from app.eval.score import read_musicxml
from app.omr.layout import analyze_layout
from app.omr.lyrics import align
from app.omr.lyrics.musicxml_lyrics import add_lyric, collect_attacks, select_target
from app.omr.lyrics.noteheads import notehead_columns
from app.omr.lyrics.ocr import OcrWord, create_text_engine
from app.omr.lyrics.regions import KIND_CHORDS, KIND_LYRICS, KIND_OTHER, TextLine, _apply_labels, _classify_band, is_chord
from app.omr.lyrics.step import LyricsPage, recognize_lyrics
from app.omr.lyrics.syllables import BEGIN, END, MIDDLE, SINGLE, finalize, split_line
from tests.xml_samples import note, part, score


def w(text, left, width=30, top=100, conf=90.0):
    return OcrWord(text=text, left=left, top=top, width=width, height=20, confidence=conf, line_id=(1, 1, 1))


# ---------------------------------------------------------------- âm tiết


def test_vietnamese_words_are_single_syllables():
    syl = finalize(split_line([w("Nguyện", 0), w("dâng", 50), w("Chúa", 100)]))
    assert [s.text for s in syl] == ["Nguyện", "dâng", "Chúa"]
    assert all(s.syllabic == SINGLE for s in syl)


def test_hyphen_tokens_and_inline_hyphens():
    syl = finalize(split_line([w("Đa", 0), w("-", 40, 8), w("vit", 60), w("Al-le-lu-ia", 120, 120)]))
    assert [s.text for s in syl] == ["Đa", "vit", "Al", "le", "lu", "ia"]
    assert [s.syllabic for s in syl] == [BEGIN, END, BEGIN, MIDDLE, MIDDLE, END]
    assert syl[2].x < syl[3].x < syl[4].x < syl[5].x


def test_extender_and_punctuation():
    syl = finalize(split_line([w("Glo", 0), w("___", 40, 60), w("ry", 120), w(",", 152, 4)]))
    assert syl[0].extend is True
    assert syl[-1].text == "ry,"


# ---------------------------------------------------------------- phân loại dòng


class _Sys:
    def __init__(self, top, bottom):
        self.top, self.bottom = top, bottom


def line(*words):
    ws = list(words)
    return TextLine(words=ws, top=min(x.top for x in ws), bottom=max(x.bottom for x in ws))


def test_chord_regex():
    for token in ["F", "Am", "C7", "Bb", "Em(b5)", "Csus4", "G7/B", "F#m", "Gdim"]:
        assert is_chord(token), token
    for token in ["Nguyện", "con", "Chúa", "bàn"]:
        assert not is_chord(token), token


def test_classify_lyrics_chords_and_labels():
    il = 9.0
    systems = [_Sys(100, 136), _Sys(330, 366)]
    lyr1 = line(w("1.", 40, top=160), w("Nguyện", 80, top=160), w("dâng", 150, top=160))
    lyr2 = line(w("2.", 40, top=190), w("Đoàn", 80, top=190), w("con", 150, top=190))
    lyr3 = line(w("Đk:", 40, top=220), w("Xin", 80, top=220), w("Cha", 150, top=220))
    chords = line(w("F", 80, top=300), w("Am", 150, top=300), w("Dm", 220, top=300))
    lines = [lyr1, lyr2, lyr3, chords]
    _classify_band(lines, 0, systems, il, 330)
    assert [ln.kind for ln in lines] == [KIND_LYRICS, KIND_LYRICS, KIND_LYRICS, KIND_CHORDS]
    assert (lyr1.number, lyr2.number, lyr3.number) == (1, 2, 3)
    assert [x.text for x in lyr3.words] == ["Xin", "Cha"] and lyr3.label == "Đk:"
    assert chords.system == 1


def test_far_text_is_not_lyrics():
    il = 9.0
    systems = [_Sys(100, 136), _Sys(600, 636)]
    title = line(w("Alleluia", 80, 200, top=400))
    _classify_band([title], 0, systems, il, 600)
    assert title.kind == KIND_OTHER


def test_ocr_one_label():
    ln = line(w("I.", 40), w("Trên", 80), w("đồng", 140))
    _apply_labels(ln, 1)
    assert ln.number == 1 and [x.text for x in ln.words] == ["Trên", "đồng"]


# ---------------------------------------------------------------- cột đầu nốt


def staff_image(heads, hollow=(), chord_at=(), width=900, spacing=12):
    img = np.full((200, width), 255, np.uint8)
    top = 60
    for k in range(5):
        cv2.line(img, (20, top + k * spacing), (width - 20, top + k * spacing), 0, 1)
    for x in heads:
        y = top + 4 * spacing - spacing // 2  # khe dưới cùng (F4)
        thickness = 2 if x in hollow else -1
        cv2.ellipse(img, (x, y), (7, 5), -20, 0, 360, 0, thickness)
        cv2.line(img, (x + 6, y), (x + 6, y - 3 * spacing), 0, 1)
        if x in chord_at:
            cv2.ellipse(img, (x, y - spacing), (7, 5), -20, 0, 360, 0, thickness)
    return img, top, top + 4 * spacing, spacing


def test_notehead_columns_filled_hollow_and_chords():
    xs = [120, 260, 400, 540, 700]
    img, top, bottom, il = staff_image(xs, hollow=(260, 700), chord_at=(400,))
    cols = notehead_columns(img, top, bottom, 60, 880, il)
    assert len(cols) == len(xs)
    assert all(abs(c - x) < il for c, x in zip(cols, xs))


# ---------------------------------------------------------------- căn âm tiết


def test_estimate_attack_x_uses_columns_or_interpolates():
    timing = [(Fraction(0), Fraction(2)), (Fraction(2), Fraction(1))]
    assert align.estimate_attack_x(timing, Fraction(3), 0, 300, [60, 230]) == [(60, True), (230, True)]
    out = align.estimate_attack_x(timing, Fraction(3), 0, 300, [60])
    assert out[0] == (60, True) and out[1][1] is False and out[1][0] > 60
    proportional = align.estimate_attack_x(timing, Fraction(3), 0, 300, [])
    assert proportional[0][0] < proportional[1][0]


def test_align_system_melisma_and_far_syllable():
    attacks = [align.Attack(1, i + 1, Fraction(i), x=x, exact=True) for i, x in enumerate([100, 200, 300, 400])]
    syl = finalize(split_line([w("Glo", 85), w("ri", 285), w("a", 385), w("xa", 2000)]))
    res = align.align_system(attacks, [(1, syl)], interline=10)
    placed = {(p.measure, p.attack): p.syllable.text for p in res.placements}
    assert placed == {(1, 1): "Glo", (1, 3): "ri", (1, 4): "a"}  # nốt 2 là melisma, không có lời
    assert [s.text for _n, s in res.dropped] == ["xa"]


# ---------------------------------------------------------------- MusicXML


def melody_xml(measures=2):
    notes = [[note("F", 4, 2), note("G", 4, 1)] for _ in range(measures)]
    return score(part("P1", 1, ("G", 2), notes))


def test_select_target_and_collect_attacks():
    root = ET.fromstring(melody_xml())
    p, staff, reason = select_target(root)
    assert p is not None and staff == 1 and reason is None
    measures = collect_attacks(p, staff)
    assert [len(m.attacks) for m in measures] == [2, 2]
    assert measures[0].length == 3


def test_add_lyric_respects_order_and_reads_back():
    root = ET.fromstring(melody_xml(1))
    p, staff, _ = select_target(root)
    m = collect_attacks(p, staff)[0]
    add_lyric(m.attacks[0][2], 2, "con", "single")
    add_lyric(m.attacks[0][2], 1, "Nguyện", "single")
    numbers = [el.get("number") for el in m.attacks[0][2].findall("lyric")]
    assert numbers == ["1", "2"]
    parsed = read_musicxml(ET.tostring(root))
    assert {(l.number, l.text) for l in parsed.lyrics} == {(1, "Nguyện"), (2, "con")}


# ---------------------------------------------------------------- tích hợp: trang tổng hợp + OCR giả


class BlobOcr:
    """OCR giả: tìm cụm mực ngang (từ) trong ảnh và gán chữ theo thứ tự từ một danh sách cho trước."""

    name = "fake"

    def __init__(self, texts):
        self.texts = list(texts)

    def read_words(self, image):
        ink = (image < 128).astype(np.uint8)
        ink = cv2.dilate(ink, np.ones((3, 9), np.uint8))
        count, _l, stats, _c = cv2.connectedComponentsWithStats(ink)
        boxes = sorted((tuple(stats[i][:4]) for i in range(1, count) if stats[i][4] > 30), key=lambda b: (b[1] // 40, b[0]))
        out = []
        for (x, y, bw, bh) in boxes:
            if not self.texts:
                break
            out.append(OcrWord(self.texts.pop(0), int(x), int(y), int(bw), int(bh), 95.0, (1, 1, 1)))
        return out


def melody_page_with_lyrics(measures=3, spacing=16):
    """Một hệ một khuông, ``measures`` ô, mỗi ô 2 nốt (trắng, đen), chữ "la" dưới mỗi nốt."""
    width, height = 1050, 1485
    page = np.full((height, width), 255, np.uint8)
    left, right, top = 80, 980, 200
    bottom = top + 4 * spacing
    for k in range(5):
        cv2.line(page, (left, top + k * spacing), (right, top + k * spacing), 0, 2)
    cv2.line(page, (left + 20, top - 2 * spacing), (left + 20, bottom + spacing), 0, 4)  # "khóa"
    start = left + 110
    width_m = (right - start) / measures
    note_xs = []
    for m in range(measures):
        x = start + m * width_m
        for k, frac in enumerate((0.2, 0.6)):
            nx = int(x + frac * width_m)
            ny = bottom - spacing // 2
            cv2.ellipse(page, (nx, ny), (10, 7), -20, 0, 360, 0, 2 if k == 0 else -1)
            cv2.line(page, (nx + 9, ny), (nx + 9, ny - 3 * spacing), 0, 2)
            note_xs.append(nx)
        bx = int(start + (m + 1) * width_m) - 4
        cv2.line(page, (bx, top), (bx, bottom), 0, 2)
    for nx in note_xs:
        cv2.putText(page, "la", (nx - 12, bottom + 3 * spacing), cv2.FONT_HERSHEY_SIMPLEX, 0.7, 0, 2)
    return page, note_xs


def test_recognize_lyrics_end_to_end(tmp_path):
    page, note_xs = melody_page_with_lyrics()
    layout = analyze_layout(page)
    assert len(layout.systems) == 1 and layout.systems[0].measures == 3
    png = tmp_path / "page.png"
    cv2.imwrite(str(png), page)
    xml = tmp_path / "v1.musicxml"
    xml.write_bytes(melody_xml(3))
    from app.omr import measure_map as mm

    entries = [
        {"measure": i + 1, "page": 1, "system": 1, "box": mm._measure_box(layout, layout.systems[0], i), "flags": []}
        for i in range(3)
    ]
    texts = ["Nguyện", "dâng", "Chúa", "lễ", "tình", "yêu"]
    report = recognize_lyrics(xml, [LyricsPage(1, png, layout)], entries, BlobOcr(texts))
    assert report.status == "done", report.reason
    lyrics = read_musicxml(xml.read_bytes()).lyrics
    assert [(l.measure, l.attack, l.text) for l in sorted(lyrics, key=lambda l: (l.measure, l.attack))] == [
        (1, 1, "Nguyện"), (1, 2, "dâng"), (2, 1, "Chúa"), (2, 2, "lễ"), (3, 1, "tình"), (3, 2, "yêu"),
    ]
    assert report.summary()["lowConfidence"] == 0


def test_recognize_lyrics_skips_piano_only(tmp_path):
    xml = tmp_path / "v1.musicxml"
    from tests.xml_samples import piano_grand_staff

    xml.write_bytes(piano_grand_staff())
    from app.convert.musicxml import normalize_musicxml

    xml.write_bytes(normalize_musicxml(xml.read_bytes()).xml)
    report = recognize_lyrics(xml, [], [], BlobOcr([]))
    assert report.status == "skipped" and "piano" in (report.reason or "")


@pytest.mark.skipif(create_text_engine()[0] is None, reason="không có Tesseract vie/eng")
def test_tesseract_reads_rendered_lyrics(tmp_path):
    """Tesseract thật trên chữ ASCII vẽ bằng OpenCV: chạy được và đọc ra chữ ở đúng dòng."""
    page, _ = melody_page_with_lyrics()
    layout = analyze_layout(page)
    engine, _ = create_text_engine()
    from app.omr.lyrics.regions import read_page_text

    text = read_page_text(page, page, 1.0, layout, engine)
    lyrics = [ln for ln in text.lines if ln.kind == KIND_LYRICS]
    assert lyrics and sum(t.text.count("la") for t in lyrics) >= 4
