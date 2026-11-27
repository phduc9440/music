"""Ô nhịp thiếu hợp lệ: ô ngắn hơn số chỉ nhịp nhưng đúng cách ghi nhạc, không phải lỗi nhận diện.

Bản in không có ký hiệu riêng cho "ô này nối với ô kia": người đọc tự hiểu qua trường độ. Có ba trường hợp:

* :data:`PICKUP`: ô lấy đà (ô đầu bài ngắn hơn số chỉ nhịp).
* :data:`CLOSING`: ô cuối bài ngắn, cộng với ô lấy đà vừa đủ một ô (phần còn lại của ô lấy đà).
* :data:`SPLIT_HEAD` + :data:`SPLIT_TAIL`: một ô bị vạch nhịp chia làm hai phần đứng liền nhau, mỗi phần ngắn hơn số
  chỉ nhịp nhưng cộng lại vừa đủ. Hay gặp ở chỗ chuyển đoạn: cuối phiên khúc và đầu điệp khúc (thường rơi đúng chỗ
  xuống dòng), hai bên vạch đôi, hai bên dấu lặp. Hai phần phải cùng số chỉ nhịp.

Ô ngắn đứng một mình ở giữa bài (không có phần bù liền kề) vẫn là ô thiếu nốt, không thuộc các trường hợp trên. Cặp ô
ngắn chỉ được coi là một ô chia đôi khi hai ô kề bên nó đủ trường độ (hoặc là ô đầu/cuối bài): cả một dãy ô ngắn bằng
nửa số chỉ nhịp là dấu hiệu đọc sai số chỉ nhịp (2/4 đọc thành 4/4), không phải nhiều chỗ chuyển đoạn liên tiếp.

Module chỉ làm việc trên dãy độ dài, không phụ thuộc kern hay music21, nên bước kiểm tra trường độ của OMR (theo kern)
và bước xuất MusicXML (theo music21) dùng chung một quy tắc. Đơn vị độ dài tùy bên gọi (nốt tròn hay nốt đen), miễn là
độ dài ô và số chỉ nhịp cùng đơn vị.
"""

from __future__ import annotations

from fractions import Fraction
from typing import Optional, Sequence

PICKUP = "pickup"
CLOSING = "closing"
SPLIT_HEAD = "split-head"
SPLIT_TAIL = "split-tail"
SPLIT_ROLES = (SPLIT_HEAD, SPLIT_TAIL)


def classify(lengths: Sequence[Optional[Fraction]], meters: Sequence[Optional[Fraction]]) -> dict[int, str]:
    """Vai trò của các ô thiếu hợp lệ: ``{chỉ số ô (từ 0): vai trò}``; ô không có trong kết quả là ô bình thường hoặc
    ô thiếu không giải thích được.

    ``lengths[i]``: độ dài ô ``i`` (mọi khuông có nốt phải dài bằng nhau; None nếu không tính được hoặc các khuông lệch
    nhau). ``meters[i]``: số chỉ nhịp có hiệu lực ở ô ``i`` (None nếu chưa biết). Hai dãy phải dài bằng nhau.
    """
    if len(lengths) != len(meters):
        raise ValueError("lengths và meters phải dài bằng nhau")
    count = len(lengths)

    def short(index: int) -> bool:
        length, meter = lengths[index], meters[index]
        return length is not None and meter is not None and 0 < length < meter

    def settled(index: int) -> bool:
        """Ô kề bên một ô chia đôi: ngoài bài, ô đầu/cuối bài hoặc ô đủ trường độ."""
        if index <= 0 or index >= count - 1:
            return True
        return lengths[index] is not None and lengths[index] == meters[index]

    roles: dict[int, str] = {}
    if count and short(0):
        roles[0] = PICKUP
    index = 1
    while index + 1 < count:
        if (
            short(index)
            and short(index + 1)
            and meters[index] == meters[index + 1]
            and lengths[index] + lengths[index + 1] == meters[index]  # type: ignore[operator]
            and settled(index - 1)
            and settled(index + 2)
        ):
            roles[index] = SPLIT_HEAD
            roles[index + 1] = SPLIT_TAIL
            index += 2
            continue
        index += 1
    last = count - 1
    if (
        last > 0
        and last not in roles
        and short(last)
        and roles.get(0) == PICKUP
        and meters[0] == meters[last]
        and lengths[0] + lengths[last] == meters[last]  # type: ignore[operator]
    ):
        roles[last] = CLOSING
    return roles


def split_partner(roles: dict[int, str], index: int) -> Optional[int]:
    """Chỉ số phần còn lại của ô bị chia đôi chứa ô ``index``; None nếu ô ``index`` không phải ô chia đôi."""
    role = roles.get(index)
    if role == SPLIT_HEAD:
        return index + 1
    if role == SPLIT_TAIL:
        return index - 1
    return None
