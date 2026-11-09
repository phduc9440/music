from fractions import Fraction

import pytest

from app.omr import merge
from tests.kern_samples import PAGE_1, PAGE_2_BARE, PAGE_2_REPEATED, T, kern


def clean(number, text, **kw):
    page, warnings = merge.clean_page(number, text, **kw)
    return page, warnings


# ------------------------------------------------------------------ làm sạch từng trang


def test_clean_page_strips_header_and_terminator():
    page, warnings = clean(1, PAGE_1)
    assert warnings == []
    assert page.header == f"**kern{T}**kern" and page.spines == 2
    assert page.body[0].startswith("*clefF4") and page.body[-1] == f"=3{T}=3"
    assert all(not ln.startswith("**") and ln != f"*-{T}*-" for ln in page.body)


def test_clean_page_drops_page_with_only_rests():
    # Model không đọc được ảnh thường sinh một dãy dấu lặng dài: không có nốt nào thì bỏ trang
    body = "".join(f"2r\n={i}\n" for i in range(1, 8))
    page, warnings = clean(1, f"**kern\n*clefG2\n*M3/4\n{body}")
    assert page is None
    assert any("chỉ có dấu lặng" in w for w in warnings)


def test_has_pitched_note():
    assert merge.has_pitched_note("4c#")
    assert merge.has_pitched_note(f"4r{T}4ee-")
    assert merge.has_pitched_note("4c 4e")
    assert not merge.has_pitched_note(f"4r{T}2r")
    assert not merge.has_pitched_note("=1") and not merge.has_pitched_note("*clefG2") and not merge.has_pitched_note(".")


def test_clean_page_handles_windows_newlines_bom_and_blank_lines():
    raw = "﻿" + PAGE_1.replace("\n", "\r\n") + "\r\n\r\n"
    page, _ = clean(1, raw)
    assert page is not None and len(page.body) == 13


def test_clean_page_unescapes_literal_tabs_and_newlines():
    literal = PAGE_1.replace("\n", "\\n").replace(T, "\\t")
    page, _ = clean(1, literal)
    assert page is not None and page.spines == 2


def test_clean_page_drops_text_before_header():
    page, _ = clean(1, "rác ở đầu\n" + PAGE_1)
    assert page is not None and page.header.startswith("**kern")


def test_page_without_kern_header_is_dropped():
    page, warnings = clean(2, "không có gì cả\n4c\t4e\n")
    assert page is None and warnings == ["Trang 2: kết quả nhận diện không có **kern nên đã bỏ qua trang này"]


def test_page_without_kern_header_gets_one_from_first_interpretation_line():
    raw = "*clefF4\t*clefG2\n*M4/4\t*M4/4\n4c\t4e\n=1\t=1\n"
    page, warnings = clean(1, raw)
    assert page is not None and warnings == []
    assert page.header == "**kern\t**kern"
    assert page.body[0] == "*clefF4\t*clefG2" and page.spines == 2


def test_page_without_notes_is_dropped():
    empty = kern("**kern|**kern", "*clefF4|*clefG2", "=1|=1", "*-|*-")
    page, warnings = clean(3, empty)
    assert page is None and "Trang 3: không nhận diện được nốt nào" in warnings[-1]


def test_runaway_repetition_is_collapsed():
    rows = ["**kern|**kern", "*M3/4|*M3/4", "=1|=1", "4c|4e"] + ["4d|4f"] * 200
    page, warnings = clean(1, kern(*rows), max_repeat=24)
    assert page.body.count(f"4d{T}4f") == 1
    assert warnings == ["Trang 1: model sinh lặp, đã cắt 199 dòng lặp"]


def test_short_repeats_are_kept():
    rows = ["**kern|**kern", "=1|=1", "4c|4e"] + ["4r|4r"] * 10
    page, warnings = clean(1, kern(*rows), max_repeat=24)
    assert page.body.count(f"4r{T}4r") == 10 and warnings == []


def test_truncated_page_drops_last_line_and_warns():
    page, warnings = clean(1, PAGE_1.replace(f"*-{T}*-\n", ""), truncated=True)
    assert page.body[-1] == f"4r{T}4r"  # dòng "=3" cuối bị bỏ
    assert "chạm giới hạn" in warnings[0]


# ------------------------------------------------------------------ ghép


def pages(*texts):
    return [clean(i, t)[0] for i, t in enumerate(texts, start=1)]


def test_merge_keeps_single_header_and_terminator_and_numbers_measures():
    result = merge.merge_pages(pages(PAGE_1, PAGE_2_BARE))
    lines = result.text.rstrip("\n").split("\n")
    assert lines[0] == f"**kern{T}**kern" and lines[-1] == f"*-{T}*-"
    assert sum(1 for ln in lines if ln.startswith("**")) == 1
    assert sum(1 for ln in lines if ln == f"*-{T}*-") == 1
    barlines = [ln.split(T)[0] for ln in lines if ln.startswith("=")]
    # trang 1 có =1 =2 =3; vạch =1 mở đầu trang 2 trùng chỗ nối nên bị bỏ; vạch kế tiếp của trang 2 đánh số tiếp là =4
    assert barlines == ["=1", "=2", "=3", "=4", "=="]
    numbers = [int(b[1:]) for b in barlines if b[1:].isdigit()]
    assert numbers == list(range(1, len(numbers) + 1))
    assert barlines[-1] == "=="


def test_seam_barline_is_not_duplicated():
    result = merge.merge_pages(pages(PAGE_1, PAGE_2_BARE))
    barline_rows = [i for i, ln in enumerate(result.lines) if merge.is_barline(ln)]
    # không có hai vạch nhịp liền nhau (giữa chúng phải có dữ liệu)
    for a, b in zip(barline_rows, barline_rows[1:]):
        assert any(merge.is_data_line(ln) for ln in result.lines[a:b])


def test_second_page_inherits_clef_key_and_meter():
    result = merge.merge_pages(pages(PAGE_1, PAGE_2_BARE))
    seam = result.lines.index(f"4D{T}4d")
    inherited = result.lines[seam - 4 : seam]
    assert f"*clefF4{T}*clefG2" in inherited
    assert f"*k[f#]{T}*k[f#]" in inherited
    assert f"*M3/4{T}*M3/4" in inherited
    assert f"*G:{T}*G:" in inherited


def test_repeated_prologue_is_removed():
    result = merge.merge_pages(pages(PAGE_1, PAGE_2_REPEATED))
    assert result.lines.count(f"*clefF4{T}*clefG2") == 1
    assert result.lines.count(f"*M3/4{T}*M3/4") == 1


def test_changed_key_signature_on_page_two_is_kept():
    changed = PAGE_2_REPEATED.replace(f"*k[f#]{T}*k[f#]", f"*k[f#c#]{T}*k[f#c#]")
    result = merge.merge_pages(pages(PAGE_1, changed))
    assert f"*k[f#c#]{T}*k[f#c#]" in result.lines and f"*k[f#]{T}*k[f#]" in result.lines


def test_midscore_final_barline_becomes_normal_barline():
    page1 = PAGE_1.replace(f"=3{T}=3", f"=={T}==")
    result = merge.merge_pages(pages(page1, PAGE_2_BARE))
    assert not any(ln.startswith("==") for ln in result.lines[:-1])


def test_line_pages_follow_page_origin():
    result = merge.merge_pages(pages(PAGE_1, PAGE_2_BARE))
    assert len(result.line_pages) == len(result.lines)
    assert result.line_pages[0] == 1 and result.line_pages[-1] == 2


def test_single_page_merge_is_valid():
    result = merge.merge_pages(pages(PAGE_1))
    assert result.text.startswith("**kern") and result.text.endswith(f"*-{T}*-\n")


# ------------------------------------------------------------------ số spine


def three_spines(text):
    return "\n".join(
        T.join(row.split(T) + [("**dynam" if row.startswith("**") else "*" if row.startswith("*") else "." if not row.startswith("=") else row.split(T)[0])])
        for row in text.rstrip("\n").split("\n")
    ) + "\n"


def test_extra_spine_is_dropped_with_warning():
    result = merge.merge_pages(pages(PAGE_1, three_spines(PAGE_2_BARE)))
    assert result.spines == 2
    assert all(len(ln.split(T)) == 2 for ln in result.lines)
    assert any("Trang 2" in w and "căn theo trang đầu" in w for w in result.warnings)


def test_missing_spine_is_padded():
    one = kern("**kern", "=1", "4c", "4d", "=2", "==", "*-")
    result = merge.merge_pages(pages(PAGE_1, one))
    assert all(len(ln.split(T)) == 2 for ln in result.lines)
    assert any(ln == f"4c{T}." for ln in result.lines)


def test_ragged_page_with_different_spines_cannot_be_aligned():
    ragged = kern("**kern|**kern|**kern", "=1|=1|=1", "4c|4e|4g", "*^|*|*", "4c|4c|4e|4g")
    with pytest.raises(merge.MergeSpineMismatch) as exc:
        merge.merge_pages(pages(PAGE_1, ragged))
    assert exc.value.page_number == 2 and exc.value.expected == 2 and exc.value.found == 3


def test_spine_split_inside_a_page_is_allowed_when_headers_match():
    split = kern(
        "**kern|**kern", "=1|=1", "4c|4e", "*|*^", "4d|4f|4a", "*|*v|*v", "4e|4g", "=2|=2", "==|==", "*-|*-"
    )
    result = merge.merge_pages(pages(PAGE_1, split))
    assert f"4d{T}4f{T}4a" in result.lines


# ------------------------------------------------------------------ trường độ


@pytest.mark.parametrize(
    "token,expected",
    [
        ("4c", Fraction(1, 4)),
        ("8.e-", Fraction(3, 16)),
        ("2..g", Fraction(7, 8)),
        ("12g", Fraction(1, 12)),
        ("4r", Fraction(1, 4)),
        ("[4c", Fraction(1, 4)),
        ("4c]L", Fraction(1, 4)),
        ("1C", Fraction(1)),
        ("0C", Fraction(2)),
        ("00C", Fraction(4)),
        ("4c 4e 4g", Fraction(1, 4)),
        ("3%2c", Fraction(2, 3)),
        (".", None),
        ("8cqL", None),
    ],
)
def test_token_duration(token, expected):
    assert merge.token_duration(token) == expected


def test_complete_measures_have_no_warnings():
    result = merge.merge_pages(pages(PAGE_1, PAGE_2_BARE))
    assert merge.check_measures(result) == []


def test_wrong_measure_length_is_reported_with_page_and_measure():
    # Vạch =3 cuối trang 1 mở ô nhịp 3, nên ô đầu của trang 2 là ô nhịp 3; làm nó dài 4/4 thay vì 3/4
    bad = PAGE_2_BARE.replace(f"4E{T}4e", f"2E{T}2e")
    result = merge.merge_pages(pages(PAGE_1, bad))
    warnings = merge.check_measures(result)
    assert len(warnings) == 1
    assert warnings[0].startswith("Trang 2, ô nhịp 3:")


def test_pickup_and_last_measure_may_be_short():
    pickup = kern(
        "**kern|**kern", "*M3/4|*M3/4", "4c|4e", "=1|=1", "4c|4e", "4d|4f", "4e|4g", "=2|=2", "4c|4e", "==|==", "*-|*-"
    )
    result = merge.merge_pages(pages(pickup))
    assert merge.check_measures(result) == []


def test_pickup_longer_than_a_measure_is_reported():
    long_pickup = kern("**kern|**kern", "*M3/4|*M3/4", "1c|1e", "=1|=1", "4c|4e", "==|==", "*-|*-")
    assert len(merge.check_measures(merge.merge_pages(pages(long_pickup)))) == 1


def test_measures_with_spine_split_are_not_checked():
    split = kern("**kern|**kern", "*M3/4|*M3/4", "=1|=1", "4c|4e", "*|*^", "2d|2f|2a", "*|*v|*v", "=2|=2", "==|==", "*-|*-")
    assert merge.check_measures(merge.merge_pages(pages(split))) == []


def test_many_problems_are_summarised():
    rows = ["**kern|**kern", "*M3/4|*M3/4"]
    for n in range(1, 16):
        rows += [f"=|=", "2c|2e"]
    rows += ["==|==", "*-|*-"]
    warnings = merge.check_measures(merge.merge_pages(pages(kern(*rows))))
    assert len(warnings) == merge.MAX_WARNINGS_PER_KIND + 1 and "Còn" in warnings[-1]


# ------------------------------------------------------------------ metadata


def test_extract_metadata():
    meta = merge.extract_metadata(merge.merge_pages(pages(PAGE_1, PAGE_2_BARE)))
    assert meta.time_signature == "3/4" and meta.tempo_bpm == 96 and meta.staff_count == 2
    assert meta.key_signature == "G major"
    assert meta.measure_count == 4  # 2 ô ở trang 1 + 2 ô ở trang 2


def test_key_signature_without_designation_falls_back_to_major_name():
    text = kern("**kern|**kern", "*k[b-e-]|*k[b-e-]", "=1|=1", "4c|4e", "=2|=2", "==|==", "*-|*-")
    assert merge.extract_metadata(merge.merge_pages(pages(text))).key_signature == "Bb major"


def test_minor_key_designation():
    text = kern("**kern|**kern", "*d:|*d:", "=1|=1", "4d|4f", "==|==", "*-|*-")
    assert merge.extract_metadata(merge.merge_pages(pages(text))).key_signature == "D minor"


def test_missing_metadata_is_none():
    text = kern("**kern|**kern", "=1|=1", "4d|4f", "==|==", "*-|*-")
    meta = merge.extract_metadata(merge.merge_pages(pages(text)))
    assert meta.key_signature is None and meta.time_signature is None and meta.tempo_bpm is None


# ------------------------------------------------------------------ căn mềm (kết quả model thật)


def test_lenient_pads_page_with_fewer_spines_and_closes_open_splits():
    three = kern("**kern|**kern|**kern", "*clefF4|*clefG2|*clefG2", "=1|=1|=1", "4c|4e|4g", "*|*^|*", "4d|4f|4a|4b", "=2|=2|=2|=2")
    two = kern("**kern|**kern", "*clefF4|*clefG2", "=1|=1", "4c|4e", "=2|=2")
    result = merge.merge_pages(pages(two, three, three), lenient=True)
    assert result.spines == 3 and result.header == f"**kern{T}**kern{T}**kern"
    assert any("Trang 1" in w and "thêm 1 cột" in w for w in result.warnings)
    # Trang 1 được thêm cột bên phải: khóa nhạc lấy theo spine đó ở trang khác, mỗi ô một dấu lặng dài bằng ô
    assert result.lines[0] == f"*clefF4{T}*clefG2{T}*clefG2"
    assert f"4c{T}4e{T}4r" in result.lines
    # Trang 2 kết thúc khi còn tách: có dòng gộp trước trang 3 và trước *-
    joins = [ln for ln in result.lines if ln == f"*{T}*v{T}*v{T}*"]
    assert len(joins) == 2
    assert result.text.rstrip("\n").endswith(f"*-{T}*-{T}*-")


def _split_case(first_voice_rows, second_voice_rows):
    rows = [f"{a}{T}{b}" for a, b in zip(first_voice_rows, second_voice_rows)]
    return kern(
        "**kern", "*M4/4", "=1", "4d", "4e", "4f", "*^", *rows, "*v|*v", "=2", "4c", "==", "*-"
    ).replace("|", T)


def test_lenient_cuts_extra_note_in_a_split_segment():
    # Giọng 1 thừa một nốt 16 so với giọng 2 (dòng cuối có "." ở giọng 2 khi giọng 2 đã hết nốt)
    text = _split_case(["8c(", "16d)", "16e(", "16f)"], ["8a", "8g", ".", "."])
    page, _ = clean(1, text)
    result = merge.merge_pages([page], lenient=True)
    assert any("ô nhịp 1" in w and "đã cắt 1 dòng thừa" in w for w in result.warnings)
    assert f"16f){T}." not in result.lines


def test_lenient_leaves_balanced_split_untouched():
    text = _split_case(["8c(", "16d)", "16e("], ["8a", "8g", "."])
    page, _ = clean(1, text)
    result = merge.merge_pages([page], lenient=True)
    assert not any("hai giọng" in w for w in result.warnings)


# ------------------------------------------------------------------ vai trò khuông, độn cột, thống kê ô nhịp


def test_annotate_roles_adds_humdrum_instrument_codes_in_spine_order():
    three = kern("**kern|**kern|**kern", "*clefF4|*clefG2|*clefG2", "=1|=1|=1", "4c|4e|4g", "==|==|==", "*-|*-|*-")
    merged = merge.merge_pages(pages(three))
    annotated = merge.annotate_roles(merged, ["SINGLE", "PIANO", "PIANO"])
    assert annotated.lines[0] == f"*Ipiano{T}*Ipiano{T}*Ivox"  # spine trái = khuông dưới cùng
    assert annotated.text.splitlines()[1] == annotated.lines[0]
    assert len(annotated.line_pages) == len(annotated.lines)
    # chỉ có piano, chỉ có khuông đơn, hoặc sai số spine: giữ nguyên
    assert merge.annotate_roles(merged, ["PIANO", "PIANO", "PIANO"]) is merged
    assert merge.annotate_roles(merged, ["SINGLE", "SINGLE", "SINGLE"]) is merged
    assert merge.annotate_roles(merged, ["SINGLE", "PIANO"]) is merged


def test_rest_token_covers_plain_and_dotted_durations():
    assert merge.rest_token(Fraction(1)) == "1r"
    assert merge.rest_token(Fraction(3, 4)) == "2.r"
    assert merge.rest_token(Fraction(3, 8)) == "4.r"
    assert merge.rest_token(Fraction(7, 8)) == "2..r"
    assert merge.rest_token(Fraction(2)) == "0r"
    assert merge.rest_token(Fraction(5, 8)) is None


def test_pad_page_inherits_clef_and_meter_and_fills_measures_with_rests():
    two = merge.clean_page(1, kern("**kern|**kern", "*clefF4|*clefG2", "*M3/4|*M3/4", "4c|2e", "4d|.", "4e|4f", "=1|=1"))[0]
    padded = merge.pad_page(two, 3, [{}, {}, {"clef": "*clefG2"}])
    assert padded.header == f"**kern{T}**kern{T}**kern"
    assert padded.body[0] == f"*clefF4{T}*clefG2{T}*clefG2"
    assert padded.body[1] == f"*M3/4{T}*M3/4{T}*M3/4"  # nhịp chung: lấy theo chính dòng đó
    assert padded.body[2] == f"4c{T}2e{T}2.r" and padded.body[3] == f"4d{T}.{T}."
    assert merge.pad_page(padded, 2).header == f"**kern{T}**kern"


def test_measure_stats_counts_checked_and_wrong_measures():
    text = kern("**kern|**kern", "*M2/4|*M2/4", "=1|=1", "4c|2e", "4d|.", "=2|=2", "4c|4e", "=3|=3", "4c|4e", "4d|4f", "==|==")
    checked, bad = merge.measure_stats(merge.merge_pages(pages(text)))
    assert (checked, bad) == (3, 1)


def _melody_body(*measures):
    """Kern 1 spine, mỗi phần tử là nội dung một ô (các nốt cách nhau bằng dấu cách)."""
    rows = ["**kern", "*clefG2", "*M3/4"]
    for number, notes in enumerate(measures, start=1):
        rows += notes.split() + [f"={number}"]
    rows.append("*-")
    return merge.clean_page(1, kern(*rows))[0]


def test_drop_repeated_blocks_only_down_to_the_image_count():
    a, b, c, d = "2f 4g", "2a 4f", "4d 4e 4f", "2.c"
    page = _melody_body(a, b, c, d, b, c, d, b, c, d, a)  # khối (b c d) lặp 3 lần: 11 ô
    fixed, removed = merge.drop_repeated_blocks(page, 8)
    assert removed == 3 and merge.count_measures(fixed.body) == 8
    fixed, removed = merge.drop_repeated_blocks(page, 5)
    assert removed == 6 and merge.count_measures(fixed.body) == 5
    sigs = [tuple(ln for ln in chunk if merge.is_data_line(ln)) for chunk in merge.split_measures(fixed.body)]
    assert [" ".join(s) for s in sigs if s] == [a, b, c, d, a]


def test_drop_repeated_blocks_keeps_music_when_count_already_matches_or_no_exact_loop():
    a, b = "2f 4g", "2a 4f"
    page = _melody_body(a, b, a, b)
    assert merge.drop_repeated_blocks(page, 4) == (page, 0)  # nhạc lặp thật, số ô đã đúng
    single = _melody_body(a, a, b)
    assert merge.drop_repeated_blocks(single, 2)[1] == 0  # một ô chỉ lặp 2 lần: không chắc là lặp do model
    triple = _melody_body(a, a, a, b)
    fixed, removed = merge.drop_repeated_blocks(triple, 2)
    assert removed == 2 and merge.count_measures(fixed.body) == 2
