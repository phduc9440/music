"""Ô nhịp thiếu hợp lệ: ô ngắn hơn số chỉ nhịp nhưng đúng cách ghi nhạc, không phải lỗi nhận diện.

Bản in không có ký hiệu riêng cho "ô này nối với ô kia": người đọc tự hiểu qua trường độ. Các trường hợp:

* :data:`PICKUP`: ô lấy đà (ô đầu bài ngắn hơn số chỉ nhịp).
* :data:`CLOSING`: ô cuối bài ngắn, cộng với ô lấy đà vừa đủ một ô (phần còn lại của ô lấy đà).
* :data:`SPLIT_HEAD` + :data:`SPLIT_TAIL`: một ô bị vạch nhịp chia làm hai phần đứng liền nhau, mỗi phần ngắn hơn số
  chỉ nhịp nhưng cộng lại vừa đủ. Hay gặp ở chỗ chuyển đoạn: cuối phiên khúc và đầu điệp khúc (thường rơi đúng chỗ
  xuống dòng), hai bên vạch đôi, hai bên dấu lặp. Hai phần phải cùng số chỉ nhịp.
* :data:`REPEAT_START` + :data:`REPEAT_END`: đoạn lặp mở đầu bằng một ô ngắn (lấy đà của đoạn) và ô ngay trước dấu lặp
  cuối đoạn ``:|`` ngắn đúng phần còn lại: khi hát lặp lại, ô cuối đoạn nối thẳng vào ô đầu đoạn. Đoạn lặp bắt đầu sau
  dấu lặp mở ``|:`` gần nhất, sau dấu lặp cuối đoạn trước đó, hoặc từ đầu bài (khi đó ô đầu là :data:`PICKUP`).

Ô ngắn đứng một mình ở giữa bài (không có phần bù liền kề) vẫn là ô thiếu nốt, không thuộc các trường hợp trên. Cặp ô
ngắn chỉ được coi là một ô chia đôi khi hai ô kề bên nó đủ trường độ (hoặc là ô đầu/cuối bài): cả một dãy ô ngắn bằng
nửa số chỉ nhịp là dấu hiệu đọc sai số chỉ nhịp (2/4 đọc thành 4/4), không phải nhiều chỗ chuyển đoạn liên tiếp.

Module chỉ làm việc trên dãy độ dài, không phụ thuộc kern hay music21, nên bước kiểm tra trường độ của OMR (theo kern)
và bước xuất MusicXML (theo music21) dùng chung một quy tắc. Đơn vị độ dài tùy bên gọi (nốt tròn hay nốt đen), miễn là
độ dài ô và số chỉ nhịp cùng đơn vị.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction
from typing import Optional, Sequence

PICKUP = "pickup"
CLOSING = "closing"
SPLIT_HEAD = "split-head"
SPLIT_TAIL = "split-tail"
REPEAT_START = "repeat-start"
REPEAT_END = "repeat-end"
SPLIT_ROLES = (SPLIT_HEAD, SPLIT_TAIL)
REPEAT_ROLES = (REPEAT_START, REPEAT_END)
COMPLEMENT_ROLES = SPLIT_ROLES + REPEAT_ROLES
"""Ô ngắn ở giữa bài vì có một ô khác bù cho nó (không phải ô đầu/cuối bài)."""
MISSING_AT_START = (PICKUP, SPLIT_TAIL, REPEAT_START)
"""Vai trò mà phần thiếu nằm ở đầu ô (các vai trò còn lại thiếu ở cuối ô)."""


@dataclass
class Analysis:
    roles: dict[int, str] = field(default_factory=dict)
    """``{chỉ số ô (từ 0): vai trò}`` của các ô thiếu hợp lệ."""
    partners: dict[int, int] = field(default_factory=dict)
    """Ô bù cho từng ô thiếu hợp lệ (hai chiều), trừ ô lấy đà không có ô cuối bù."""


def classify(
    lengths: Sequence[Optional[Fraction]],
    meters: Sequence[Optional[Fraction]],
    repeats: Optional[Sequence[tuple[bool, bool]]] = None,
) -> dict[int, str]:
    """Vai trò của các ô thiếu hợp lệ: ``{chỉ số ô (từ 0): vai trò}`` (xem :func:`analyze`)."""
    return analyze(lengths, meters, repeats).roles


def analyze(
    lengths: Sequence[Optional[Fraction]],
    meters: Sequence[Optional[Fraction]],
    repeats: Optional[Sequence[tuple[bool, bool]]] = None,
) -> Analysis:
    """Các ô thiếu hợp lệ và ô bù cho chúng; ô không có trong kết quả là ô bình thường hoặc ô thiếu không giải thích được.

    ``lengths[i]``: độ dài ô ``i`` (mọi khuông có nốt phải dài bằng nhau; None nếu không tính được hoặc các khuông lệch
    nhau). ``meters[i]``: số chỉ nhịp có hiệu lực ở ô ``i`` (None nếu chưa biết). ``repeats[i]``: ``(ô mở đầu bằng dấu
    lặp |:, ô kết thúc bằng dấu lặp :|)``; bỏ trống thì không xét đoạn lặp. Các dãy phải dài bằng nhau.
    """
    if len(lengths) != len(meters) or (repeats is not None and len(repeats) != len(lengths)):
        raise ValueError("lengths, meters và repeats phải dài bằng nhau")
    count = len(lengths)

    def short(index: int) -> bool:
        length, meter = lengths[index], meters[index]
        return length is not None and meter is not None and 0 < length < meter

    def settled(index: int) -> bool:
        """Ô kề bên một ô chia đôi: ngoài bài, ô đầu/cuối bài hoặc ô đủ trường độ."""
        if index <= 0 or index >= count - 1:
            return True
        return lengths[index] is not None and lengths[index] == meters[index]

    def complete(first: int, second: int) -> bool:
        return (
            short(first)
            and short(second)
            and meters[first] == meters[second]
            and lengths[first] + lengths[second] == meters[first]  # type: ignore[operator]
        )

    result = Analysis()
    roles, partners = result.roles, result.partners

    def pair(first: int, second: int, first_role: str, second_role: str) -> None:
        roles.setdefault(first, first_role)
        roles[second] = second_role
        partners[first], partners[second] = second, first

    if count and short(0):
        roles[0] = PICKUP
    index = 1
    while index + 1 < count:
        if complete(index, index + 1) and settled(index - 1) and settled(index + 2):
            pair(index, index + 1, SPLIT_HEAD, SPLIT_TAIL)
            index += 2
            continue
        index += 1
    if repeats is not None:
        section = 0  # ô mở đầu đoạn đang lặp
        for index, (opens, closes) in enumerate(repeats):
            if opens:
                section = index
            if not closes:
                continue
            free = section not in partners and index not in roles and roles.get(section) in (None, PICKUP)
            if section < index and free and complete(section, index):
                pair(section, index, REPEAT_START, REPEAT_END)
            section = index + 1
    last = count - 1
    if last > 0 and last not in roles and roles.get(0) == PICKUP and complete(0, last):
        roles[last] = CLOSING  # ô lấy đà có thể được bù cả ở cuối đoạn lặp lẫn ở cuối bài
        partners[last] = 0
        partners.setdefault(0, last)
    return result


def split_partner(roles: dict[int, str], index: int) -> Optional[int]:
    """Chỉ số phần còn lại của ô bị chia đôi chứa ô ``index``; None nếu ô ``index`` không phải ô chia đôi liền kề."""
    role = roles.get(index)
    if role == SPLIT_HEAD:
        return index + 1
    if role == SPLIT_TAIL:
        return index - 1
    return None
