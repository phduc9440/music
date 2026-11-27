"""Dấu luyến bị đọc thành dấu nối, kiểm bằng đầu nốt trên ảnh (app/omr/tie_check.py)."""

from __future__ import annotations

from app.omr import merge, tie_check
from app.omr.layout import PageLayout, Staff, System
from app.omr.pitch_check import Head
from tests.kern_samples import kern

IL = 8.0

# Ô 13 của "Lòng Con Ước Ao" (điệp khúc, giọng Sol thứ): khuông trên là bè Mi♭-Sol, Sol-Si♭ x3, rồi Fa-La luyến sang
# Mi♭-Si♭; khuông dưới tách hai bè: Fa (móc đơn) luyến sang Sol, cùng Fa (nốt đen), rồi hợp âm Fa-La.
# Model đọc cả hai dấu luyến thành dấu nối và chép cao độ: "8f[ 8f]" và "8F[ 8F] 8A".
MEASURE = kern(
    "**kern|**kern",
    "*clefF4|*clefG2",
    "*k[b-e-]|*k[b-e-]",
    "*M4/4|*M4/4",
    "=1|=1",
    "8E- 8B-L|8e- 8gL",
    "8E- 8B-J|8g 8b-J",
    "8E- 8B-L|8g 8b-L",
    "8E- 8B-J|8g 8b-J",
    "*^|*",
    "8F[L|4F|8f[ 8aL",
    "8F] 8AJ|.|8f] 8b-J",
    "*v|*v|*",
    "4F 4A|8f 8aL",
    ".|8e- 8gJ",
    "==|==",
    "*-|*-",
)

# Vị trí khuông in trên ảnh (0 = dòng kẻ dưới cùng): khóa Sol Mi4 = 0, khóa Fa Sol2 = 0
TREBLE = [{0, 2}, {2, 4}, {2, 4}, {2, 4}, {1, 3}, {0, 4}, {1, 3}, {0, 2}]
BASS = [{5, 9}, {5, 9}, {5, 9}, {5, 9}, {6}, {7}, {6, 8}]


def _layout() -> PageLayout:
    treble = Staff(top=100, bottom=132, left=30, right=600, lines=5, role="PIANO")
    bass = Staff(top=200, bottom=232, left=30, right=600, lines=5, role="PIANO")
    system = System(staves=[treble, bass], connected=True, barlines=[600], measures=1, bars_closed=True)
    return PageLayout(width=1050, height=1485, interline=IL, systems=[system], confident=True)


def _heads(treble: list[set[int]], bass: list[set[int]]) -> list[Head]:
    heads = []
    for staff, onsets in ((0, treble), (1, bass)):
        for k, steps in enumerate(onsets):
            heads += [Head(system=0, staff=staff, x=60.0 + 60 * k, step=s) for s in steps]
    return heads


def _lines(text: str) -> list[str]:
    page, _ = merge.clean_page(1, text)
    assert page is not None
    return merge.merge_pages([page], lenient=True).lines


def test_slur_misread_as_tie_takes_the_pitch_printed_on_the_image():
    lines = _lines(MEASURE)
    out, report = tie_check.fix_page(lines, 2, _heads(TREBLE, BASS), _layout())
    assert report.slurs == 2
    changed = {lines[i]: out[i] for i in report.lines}
    # nốt cuối lấy cao độ theo ảnh (Mi giáng theo hóa biểu / Sol), nốt La bịa trong hợp âm bị bỏ, dấu nối thành luyến
    assert changed["8F] 8AJ\t.\t8f] 8b-J"] == "8G)J\t.\t8e-) 8b-J"
    assert changed["8F[L\t4F\t8f[ 8aL"] == "8F(L\t4F\t8f( 8aL"


def test_tie_confirmed_by_the_image_is_kept():
    lines = _lines(MEASURE.replace("8F] 8AJ|.|8f] 8b-J", "8F]J|.|8f] 8b-J").replace("|", "\t"))
    treble = TREBLE[:5] + [{1, 4}] + TREBLE[6:]  # ảnh in đúng Fa nối Fa
    bass = BASS[:5] + [{6}] + BASS[6:]
    out, report = tie_check.fix_page(lines, 2, _heads(treble, bass), _layout())
    assert report.slurs == 0 and out == lines


def test_other_mismatches_are_left_alone():
    lines = _lines(MEASURE)
    tie_end = next(i for i, line in enumerate(lines) if line.startswith("8F] 8AJ"))
    # thêm một chỗ lệch khác ở khuông trên: ảnh của khuông đó không đủ tin, chỉ khuông dưới được sửa
    treble = [{0, 3}] + TREBLE[1:]
    out, report = tie_check.fix_page(lines, 2, _heads(treble, BASS), _layout())
    assert report.slurs == 1
    assert out[tie_end] == "8G)J\t.\t8f] 8b-J" and out[tie_end - 1] == "8F(L\t4F\t8f[ 8aL"
    # ảnh có nhiều đầu nốt hơn kern ở thời điểm lệch: không đoán
    bass = BASS[:5] + [{7, 9, 11}] + BASS[6:]
    out, report = tie_check.fix_page(lines, 2, _heads(treble, bass), _layout())
    assert report.slurs == 0 and out == lines


def test_page_with_a_different_measure_count_is_skipped():
    lines = _lines(MEASURE)
    layout = _layout()
    layout.systems[0].barlines = [300, 600]
    layout.systems[0].measures = 2
    out, report = tie_check.fix_page(lines, 2, _heads(TREBLE, BASS), layout)
    assert out == lines and report.slurs == 0
