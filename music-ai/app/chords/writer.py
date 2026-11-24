"""Chèn ``<harmony>`` vào MusicXML gốc.

Chỉ thêm phần tử ``<harmony>`` vào bè giai điệu, không đổi gì khác (khóa, nhịp, part-list, thứ tự phần tử), để
``SuggestionDiffer`` phía Java thấy đúng các ô được thêm hợp âm. Phần mở đầu file (khai báo XML, DOCTYPE) được giữ nguyên.

Vị trí: ngay trước nốt có cao độ của khuông giai điệu bắt đầu đúng chỗ đổi hợp âm. Không có nốt như vậy (nốt dài, nốt nối)
thì gắn vào nốt gần nhất kèm ``<offset>`` (đơn vị divisions): ưu tiên nốt đang vang (bắt đầu trước, offset dương), không thì
nốt kế tiếp (offset âm). Mỗi nốt mang tối đa một ``<harmony>`` vì editor chỉ giữ một hợp âm cho mỗi nốt; không còn nốt trống
nào để gắn thì bỏ hợp âm đó.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from fractions import Fraction

from app.convert.score_xml import child_int, current_divisions

# Giữ đúng tiền tố xlink (MusicXML dùng xlink:href); thiếu dòng này ElementTree ghi thành ns0:href
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")


def divisions_per_measure(measures: list[ET.Element]) -> list[int]:
    """Giá trị ``divisions`` đang hiệu lực ở đầu mỗi ô (ô đổi divisions giữa chừng hiếm gặp, lấy giá trị cuối ô trước)."""
    out, current = [], 1
    for measure in measures:
        first = measure.find("attributes")
        if first is not None:
            current = current_divisions(first, current)
        out.append(current)
    return out


def _staff_of(note: ET.Element) -> int:
    return child_int(note, "staff") or 1


def _anchors(measure: ET.Element, divisions: int, staff: int) -> list[tuple[int, Fraction]]:
    """(chỉ số phần tử, vị trí phách đen trong ô) của các nốt có cao độ thuộc khuông ``staff`` (bỏ nốt hoa mỹ, nốt trong
    hợp âm ``<chord/>``): những nốt có thể mang ``<harmony>``. Nốt nối từ ô trước cũng tính (bắt đầu ở đầu ô)."""
    pos = Fraction(0)
    anchors: list[tuple[int, Fraction]] = []  # (chỉ số phần tử, vị trí) của các nốt có cao độ thuộc khuông giai điệu
    for index, element in enumerate(list(measure)):
        tag = element.tag
        if tag == "attributes":
            divisions = current_divisions(element, divisions)
        elif tag == "forward":
            pos += Fraction(child_int(element, "duration") or 0, divisions)
        elif tag == "backup":
            pos -= Fraction(child_int(element, "duration") or 0, divisions)
        elif tag == "note":
            duration = child_int(element, "duration")
            if duration is None or element.find("grace") is not None or element.find("chord") is not None:
                continue
            if _staff_of(element) == staff and element.find("pitch") is not None:
                anchors.append((index, pos))
            pos += Fraction(duration, divisions)
    return anchors


def anchor_positions(measure: ET.Element, divisions: int, staff: int) -> set[Fraction]:
    """Các vị trí trong ô (phách đen) có nốt bắt đầu để gắn hợp âm mà không cần ``<offset>``.

    Hợp âm có ``<offset>`` hiện ở nốt mang nó nhưng khi phát lại vang ở ``nốt + offset``, nên người dùng thấy một hợp âm mà
    nghe ra hợp âm khác. Vì vậy gợi ý hợp âm chỉ đổi hợp âm ở các vị trí này."""
    return {pos for _, pos in _anchors(measure, divisions, staff)}


def insert_harmony(measure: ET.Element, divisions: int, target: Fraction, harmony: ET.Element, staff: int) -> bool:
    """Chèn ``harmony`` cho vị trí ``target`` (phách đen trong ô). Trả False nếu không có nốt trống để gắn."""
    anchors = _anchors(measure, divisions, staff)
    if not anchors:
        _set_offset(harmony, int(target * divisions))
        measure.insert(_first_note_index(measure), harmony)
        return True

    free = [(i, p) for i, p in anchors if not _has_harmony(measure, i)]
    exact = [(i, p) for i, p in free if p == target]
    sounding = [(i, p) for i, p in free if p < target]
    following = [(i, p) for i, p in free if p > target]
    if exact:
        anchor = exact[0]
    elif sounding and sounding[-1] == max((a for a in anchors if a[1] < target), key=lambda a: a[1]):
        anchor = sounding[-1]  # nốt đang vang lúc đổi hợp âm
    elif following:
        anchor = following[0]
    else:
        return False
    index, start = anchor
    _set_offset(harmony, int((target - start) * divisions))
    measure.insert(index, harmony)
    return True


def _has_harmony(measure: ET.Element, index: int) -> bool:
    """Nốt ở ``index`` đã có ``<harmony>`` đứng liền trước chưa."""
    return index > 0 and measure[index - 1].tag == "harmony"


def _first_note_index(measure: ET.Element) -> int:
    for index, element in enumerate(measure):
        if element.tag == "note":
            return index
    return len(measure)


def _set_offset(harmony: ET.Element, offset: int) -> None:
    if offset == 0:
        return
    el = ET.Element("offset")
    el.text = str(offset)
    staff = harmony.find("staff")
    if staff is not None:
        harmony.insert(list(harmony).index(staff), el)
    else:
        harmony.append(el)


def serialize(prolog: str, root: ET.Element) -> bytes:
    return (prolog + ET.tostring(root, encoding="unicode")).encode("utf-8")
