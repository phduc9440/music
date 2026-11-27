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


def test_lenient_moves_an_early_join_below_the_long_note():
    # Bè dưới: 8F (bè 1) cùng 4F (bè 2); model gộp ngay sau móc đơn rồi viết tiếp nốt của bè 1 sau chỗ gộp. music21 khi
    # đó đặt các nốt sau chỗ gộp ra sau nốt đen, khuông dưới lệch nửa phách và ô dài 9/8.
    text = kern(
        "**kern|**kern",
        "*M4/4|*M4/4",
        "=1|=1",
        "8E-|8e-",
        "8E-|8g",
        "8E-|8g",
        "8E-|8g",
        "*^|*",
        "8F[|4F|8f",
        "*v|*v|*",
        "8F]|8e-",
        "4F 4A|8f",
        ".|8g",
        "==|==",
        "*-|*-",
    )
    page, _ = clean(1, text)
    result = merge.merge_pages([page], lenient=True)
    assert any("đã dời chỗ gộp" in w for w in result.warnings)
    body = result.lines[result.lines.index(f"*^{T}*") :]
    assert body[:4] == [f"*^{T}*", f"8F[{T}4F{T}8f", f"8F]{T}.{T}8e-", f"*v{T}*v{T}*"]
    assert body[4] == f"4F 4A{T}8f"
    assert len(result.line_pages) == len(result.lines)


def test_split_timing_counts_notes_of_other_staves():
    # Hai giọng cùng ngân nốt đen trong khi khuông trên có hai móc đơn: dòng "." ở giữa không phải giọng hết nốt
    lines = [f"*M2/4{T}*M2/4", f"=1{T}=1", f"*^{T}*", f"4F{T}4A{T}8c", f".{T}.{T}8d", f"4G{T}4B{T}4e", f"*v{T}*v{T}*", f"=2{T}=2"]
    pages_ = [1] * len(lines)
    assert merge.repair_split_segments(lines, pages_) == []


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


# ---------------------------------------------------------------- gộp spine khi chưa tách


def _three_spines(*rows: str) -> str:
    return "\n".join(["**kern\t**kern\t**kern", "*clefF4\t*clefG2\t*clefG2", "*M3/4\t*M3/4\t*M3/4", *rows])


def test_join_without_split_is_cut_so_the_merged_kern_keeps_its_columns():
    raw = _three_spines(
        "4C\t4c\t4e",
        "=1\t=1\t=1",
        "*\t*v\t*v",  # gộp hai khuông chưa từng tách: các dòng sau chỉ còn hai cột
        "4D\t4d f",
        "=2\t=2",
        "4E\t4e",
    )
    page, warnings = merge.clean_page(2, raw)
    assert page is not None
    assert any("gộp spine sai" in w for w in warnings)
    assert all(len(line.split("\t")) == 3 for line in page.body)
    result = merge.merge_pages([page])
    assert {len(line.split("\t")) for line in result.lines} == {3}


def test_split_then_join_of_the_same_spine_is_kept():
    raw = _three_spines(
        "4C\t4c\t4e",
        "*\t*\t*^",
        "4D\t4d\t4f\t4a",
        "*\t*\t*v\t*v",
        "4E\t4e\t4g",
        "=1\t=1\t=1",
    )
    page, warnings = merge.clean_page(1, raw)
    assert page is not None and warnings == []
    assert merge.first_invalid_join(page.body, 3) is None


def test_lone_join_marker_is_invalid():
    assert merge.first_invalid_join(["4C\t4c", "*\t*v", "4D\t4d"], 2) == 1


def _result_from(body: list[str], spines: int = 1) -> merge.MergeResult:
    header = "\t".join(["**kern"] * spines)
    text = "\n".join([header, *body, "\t".join(["*-"] * spines)]) + "\n"
    return merge.MergeResult(
        text=text, spines=spines, warnings=[], line_pages=[1] * len(body), lines=list(body), header=header
    )


def test_missing_barline_is_restored_from_durations():
    body = ["*clefG2", "*M2/4", "8aL", "8bJ", "8ccL", "8aJ", "=", "2g", "4ff", "4dd", "=", "8bL", "8ddJ", "4ee", "=="]
    fixed = merge.split_merged_measures_at(_result_from(body))[0]
    assert sum(1 for ln in fixed.lines if ln.startswith("=") and ln != "==") == 3
    assert fixed.lines[fixed.lines.index("2g") + 1] .startswith("=")
    assert any("bỏ sót vạch nhịp" in w for w in fixed.warnings)
    assert merge.bad_measures(fixed) == []


def test_measure_with_wrong_total_is_left_alone():
    body = ["*M2/4", "8a", "8b", "8cc", "=", "2g", "4ff", "=", "4b", "4d", "=="]
    fixed = merge.split_merged_measures_at(_result_from(body))[0]
    assert fixed.lines == body


def test_two_spines_are_split_only_where_all_staves_are_aligned():
    body = ["*M2/4\t*M2/4", "2g\t4a", ".\t4b", "2a\t2c", "=="]
    fixed = merge.split_merged_measures_at(_result_from(body, 2))[0]
    assert [ln.split("\t")[0] for ln in fixed.lines][3].startswith("=")
    held = ["*M2/4\t*M2/4", "1g\t4a", ".\t4b", ".\t2c", "=="]
    assert merge.split_merged_measures_at(_result_from(held, 2))[0].lines == held


def test_split_reports_which_measures_were_split():
    body = ["*M2/4", "8a", "8b", "8cc", "8a", "=", "2g", "4ff", "4dd", "=", "4b", "4d", "=="]
    fixed, ordinals = merge.split_merged_measures_at(_result_from(body))
    assert ordinals == [2]
    assert merge.count_measures(fixed.lines) == 4


# ---------------------------------------------------------------------- vạch nhịp chỉ có ở một số spine


def _body(text: str) -> list[str]:
    return [line for line in text.strip("\n").split("\n")]


def test_partial_barline_becomes_full_when_other_spine_measure_is_complete():
    # tay trái đủ 2/4 thì tới vạch; model chỉ ghi vạch cho tay phải (tay phải lại thiếu một móc kép)
    body = _body(kern(
        "*clefF4|*clefG2",
        "*M2/4|*M2/4",
        "8C|8c",
        "8G|16e",
        ".|8g",
        "8c|.",
        "8G|16g",
        ".|=",
        "8C|2c",
        "8G|.",
        "8c|.",
        "8G|.",
        "=|=",
    ))
    fixed, count = merge.repair_partial_barlines(body)
    assert count == 1
    assert "=\t=" in fixed and ".\t=" not in fixed
    assert merge.count_measures(fixed) == 2


def test_partial_barline_with_a_note_is_moved_where_durations_fit():
    # giọng hát (cột phải) ghi vạch ở dòng còn một nốt móc đơn của piano: đặt vạch trước nốt đó thì cả ba spine đủ 4/4
    body = _body(kern(
        "*clefF4|*clefG2|*clefG2",
        "*M4/4|*M4/4|*M4/4",
        "2D|8f#|4d",
        ".|8A|.",
        ".|8d|4d",
        ".|8f#|.",
        "2D|8d|2d",
        ".|8A|.",
        ".|8r|.",
        ".|8f#|.",
        ".|8d|=",
        "2F#|8A|1a",
        ".|8c#|.",
        ".|8f#|.",
        ".|8r|.",
        "2F#|8c#|.",
        ".|8f#|.",
        ".|8a|.",
        "=|=|=",
    ))
    fixed, count = merge.repair_partial_barlines(body)
    assert count == 1
    position = fixed.index("=\t=\t=")
    assert fixed[position + 1] == ".\t8d\t."
    assert not any(merge._is_partial_barline(line) for line in fixed)


def test_partial_barline_uses_most_common_measure_length_without_meter():
    # trang sau của bản nhiều trang không in lại *M: số chỉ nhịp suy từ các ô khác của trang
    body = _body(kern(
        "*clefF4|*clefG2",
        "=|=",
        "2C|2c",
        "=|=",
        "2D|2d",
        "=|=",
        "4C|4c",
        "4D|4d",
        ".|=",
        "2E|2e",
        "=|=",
        "2F|2f",
        "=|=",
    ))
    fixed, count = merge.repair_partial_barlines(body)
    assert count == 1 and not any(merge._is_partial_barline(line) for line in fixed)


def test_partial_barline_inside_spine_split_is_left_alone():
    body = _body(kern(
        "*clefF4|*clefG2",
        "*M2/4|*M2/4",
        "*^|*",
        "4C|4E|4c",
        ".|.|=",
        "4D|4F|4d",
        "*v|*v|*",
        "=|=",
    ))
    fixed, count = merge.repair_partial_barlines(body)
    assert count == 0 and fixed == body


def test_clean_page_repairs_partial_barlines_and_warns():
    text = kern(
        "**kern|**kern",
        "*clefF4|*clefG2",
        "*M2/4|*M2/4",
        "4C|4c",
        "4G|4g",
        ".|=",
        "2C|2e",
        "=|=",
        "*-|*-",
    )
    page, warnings = merge.clean_page(1, text)
    assert page is not None
    assert merge.count_measures(page.body) == 2
    assert any("vạch nhịp chỉ ở một số khuông" in w for w in warnings)


def test_partial_barline_is_kept_when_dropping_it_would_merge_two_measures():
    # piano đọc sai trường độ ở cả hai ô (5/8 rồi 3/8); khuông giọng đúng 2/4 | 2/4. Bỏ vạch lẻ thì số ô "sai" ít hơn
    # nhưng giọng thành ô 4/4: phải giữ vạch (chấm theo độ lệch trường độ, không theo số ô sai)
    body = _body(kern(
        "*clefF4|*clefG2",
        "*M2/4|*M2/4",
        "=|=",
        "8C|2r",
        "8C|.",
        "8C|.",
        "8C|.",
        "8C|.",
        ".|=",
        "8C|4g",
        "8C|4a",
        "8C|.",
        "=|=",
    ))
    fixed, count = merge.repair_partial_barlines(body)
    assert count == 1 and merge.count_measures(fixed) == 2


# ---------------------------------------------------------------------- spine trùng lặp (đọc riêng một khuông)


def test_duplicate_spines_of_a_single_staff_read_collapse_to_one():
    text = kern(
        "**kern|**kern", "*clefG2|*clefG2", "*M3/4|*M3/4", "=1|=1",
        "2b(L|2b", "16qqa|.", "4cc)|4cc", "=2|=2", "4b|4b", "2a|2a", "=3|=3",
        "*^|*",  # dòng tách spine thừa ở cuối (model dừng giữa chừng)
    )
    page = merge.clean_page(1, text)[0]
    collapsed = merge.collapse_duplicate_spines(page, 1)
    assert collapsed is not None and collapsed.spines == 1
    assert [line for line in collapsed.body if merge.is_data_line(line)] == ["2b(L", "16qqa", "4cc)", "4b", "2a"]
    assert merge.collapse_duplicate_spines(merge.clean_page(1, PAGE_1)[0], 1) is None  # hai khuông piano khác nhau


def test_rest_only_read_is_kept_only_when_allowed():
    rests = kern("**kern", "*clefG2", "*M4/4", "=1", "1r", "=2", "1r", "=3", "*-")
    assert merge.clean_page(1, rests)[0] is None  # đọc cả trang ra toàn dấu lặng: model hỏng
    assert merge.clean_page(1, rests, allow_rests_only=True)[0] is not None  # đọc riêng khuông giọng đang im


# ---------------------------------------------------------------------- liên ba mất số 3


def test_sixteenth_triplets_read_as_plain_sixteenths_are_restored():
    # 4.g 16b 16a 8.a 16f# | [e g# b] [dd b g#] liên ba móc kép bị đọc thành 6 móc kép thường: ô dài 9/8
    body = _body(kern(
        "*clefG2", "*M4/4", "=1", "4.g", "16b", "16a", "8.a", "16f#", "16e", "16g#", "16b", "16dd", "16b", "16g#", "=2",
    ))
    fixed, count = merge.repair_triplets(body)
    assert count == 2
    assert fixed[-7:-1] == ["24e", "24g#", "24b", "24dd", "24b", "24g#"]
    assert fixed[3:8] == ["4.g", "16b", "16a", "8.a", "16f#"]  # nhóm phải bắt đầu đúng phách con: f# không bị gộp


def test_triplet_repair_uses_the_known_meter_when_the_read_has_none():
    body = _body(kern("*clefG2", "=1", "4b", "8.a#", "16f#", "8.an", "16g", "16f#", "16a", "16b", "16cc", "16a", "16f#", "=2"))
    assert merge.repair_triplets(body)[1] == 0  # không biết số chỉ nhịp, không đoán từ 1 ô
    fixed, count = merge.repair_triplets(body, Fraction(1))
    assert count == 2 and fixed[-7:-1] == ["24f#", "24a", "24b", "24cc", "24a", "24f#"]


def test_whole_measure_of_plain_notes_or_shared_excess_is_not_turned_into_triplets():
    # tay trái 12 móc đơn trong ô 4/4 (model đọc thừa ô): đổi hết thành liên ba thì "vừa" nhưng sai
    all_eighths = _body(kern("*clefF4", "*M4/4", "=1", *(["8G", "8r"] * 6), "=2"))
    assert merge.repair_triplets(all_eighths)[1] == 0
    # spine khác cũng dài dư đúng chừng ấy: lỗi cấu trúc (ô bị gộp), không phải liên ba
    shared = _body(kern(
        "*clefF4|*clefG2", "*M2/4|*M2/4", "=1|=1",
        "8C|4g", "8C|.", "8C|16a", "8C|16a", "8C|16a", "=2|=2",
    ))
    assert merge.repair_triplets(shared)[1] == 0


def test_clean_page_reports_triplet_repair():
    text = kern("**kern", "*clefG2", "*M2/4", "=1", "8g", "16a", "16b", "16cc", "4dd", "=2", "*-")
    page, warnings = merge.clean_page(1, text)
    assert "24a" in page.body and any("liên ba" in w for w in warnings)


def test_triplet_in_a_measure_that_changes_the_meter_is_restored():
    # Giấc Mơ Trưa ô 16: bài 4/4, ô này đổi sang 2/4 ngay sau vạch nhịp; ba móc kép luyến là liên ba bị mất số 3
    body = _body(kern(
        "*clefF4|*clefG2", "*M4/4|*M4/4", "=1|=1", "1C|1c", "=2|=2", "*M2/4|*M2/4",
        "8DL|8ddL", "8A|16cc(L", ".|16dd", "8d|16cc)JJ", ".|8aL", "8fJ|8ccJ", "=3|=3",
    ))
    fixed, count = merge.repair_triplets(body)
    assert count == 1
    treble = [line.split("\t")[1] for line in fixed if line[:1].isdigit() or line.startswith(".")]
    assert treble[2:5] == ["24cc(L", "24dd", "24cc)JJ"]
