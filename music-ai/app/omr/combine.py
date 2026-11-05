"""Ghép kern của nhiều ảnh cắt riêng của CÙNG MỘT hệ (khuông giọng, grand staff piano) thành kern một hệ nhiều spine.

Dùng khi Transcoda đọc cả hệ (giọng + piano) mà thiếu khuông, nhưng đọc từng phần riêng thì đúng (khuông đơn và grand
staff đều là loại nó làm tốt). Mỗi ảnh cắt cho một kern có tiến trình thời gian riêng, nên không thể dán cột cạnh nhau:
phải ghép theo ô nhịp rồi theo thời điểm vào của từng dòng.

Quy tắc, cố ý chặt để không sinh ra nhạc sai âm thầm (mọi sai lệch đều ném :class:`CombineError` để bên gọi quay về
kết quả khác và ghi cảnh báo):

* các luồng phải có **cùng số ô nhịp** (hai ảnh độc lập cùng đếm ra số ô là một phép kiểm chéo tốt);
* ô nhịp có dòng diễn giải giữa chừng (đổi khóa/nhịp) hoặc đang tách/gộp spine (``*^``/``*v``) thì không ghép được;
* ô nhịp mà trường độ một luồng khác luồng đầu (luồng đầu là piano, phần model đọc tốt nhất) thì luồng đó được thay bằng
  một dấu lặng trọn ô kèm cảnh báo, thay vì để dòng ``.`` treo.
"""

from __future__ import annotations

from fractions import Fraction
from typing import Optional

from app.omr import merge
from app.omr.merge import TAB, PageKern

_FALLBACK_CLEF = "*clefG2"


class CombineError(Exception):
    """Không ghép được các luồng một cách đáng tin; thông điệp là lý do (tiếng Việt, đưa thẳng vào cảnh báo)."""


# ====================================================================== tách ô nhịp


def split_measures(page: PageKern) -> tuple[list[str], list[list[str]], Optional[str]]:
    """``(dòng_diễn_giải_đầu_trang, các_ô_nhịp, token_vạch_nhịp_cuối)``; mỗi ô nhịp là danh sách dòng dữ liệu."""
    body = page.body
    prologue = body[: merge._prologue_length(body)]
    segments: list[list[str]] = []
    current: list[str] = []
    final_bar: Optional[str] = None
    for line in body[len(prologue) :]:
        if merge.is_barline(line):
            if current:
                segments.append(current)
            current = []
            final_bar = line.split(TAB)[0]
        elif line.startswith("!"):
            continue
        elif line.startswith("*"):
            raise CombineError("có dòng diễn giải (đổi khóa/nhịp hoặc tách spine) giữa ô nhịp")
        else:
            current.append(line)
    if current:
        segments.append(current)
    return prologue, segments, final_bar


def row_onsets(rows: list[str], width: int) -> tuple[list[tuple[Fraction, list[str]]], Fraction]:
    """Thời điểm vào (tính theo nốt tròn, từ đầu ô nhịp) của từng dòng và tổng trường độ của ô nhịp."""
    following = [Fraction(0)] * width
    now = Fraction(0)
    result: list[tuple[Fraction, list[str]]] = []
    for row in rows:
        fields = row.split(TAB)
        if len(fields) != width:
            raise CombineError("ô nhịp đang tách/gộp spine")
        result.append((now, fields))
        for column, token in enumerate(fields):
            if token == ".":
                continue
            duration = merge.token_duration(token)
            if duration:
                following[column] = now + duration
        later = [value for value in following if value > now]
        if later:
            now = min(later)
    return result, max(following)


# ====================================================================== ghép


def _combine_prologue(prologues: list[list[str]], widths: list[int]) -> list[str]:
    """Dòng khóa/dấu hóa/khóa điệu/nhịp ghép từ các luồng: luồng nào thiếu loại nào thì lấy giá trị chung (nhịp, dấu hóa)
    hoặc khóa Sol (khóa nhạc)."""
    per_stream: list[dict[str, list[str]]] = []
    for prologue, width in zip(prologues, widths):
        kinds: dict[str, list[str]] = {}
        for line in prologue:
            fields = line.split(TAB)
            if len(fields) != width:
                continue
            kind = merge.classify(fields[0])
            if kind and all(merge.classify(token) == kind for token in fields):
                kinds[kind] = fields
        per_stream.append(kinds)

    lines: list[str] = []
    for kind in merge.INHERITED_KINDS:
        if not any(kind in kinds for kinds in per_stream):
            continue
        shared = next((kinds[kind][0] for kinds in per_stream if kind in kinds), "*")
        fallback = _FALLBACK_CLEF if kind == merge.KIND_CLEF else shared
        row: list[str] = []
        for kinds, width in zip(per_stream, widths):
            row.extend(kinds.get(kind, [fallback] * width))
        lines.append(TAB.join(row))
    return lines


def _rest_stream(width: int, duration: Fraction) -> Optional[tuple[list[tuple[Fraction, list[str]]], Fraction]]:
    token = merge.rest_token(duration)
    if token is None:
        return None
    return [(Fraction(0), [token] * width)], duration


def combine_streams(streams: list[PageKern], number: int) -> tuple[PageKern, list[str]]:
    """Ghép ``streams`` (thứ tự cột từ trái sang phải, tức khuông dưới lên trên) thành kern một hệ.

    Trả ``(kern_hệ, cảnh_báo)``; ném :class:`CombineError` nếu không ghép được.
    """
    if len(streams) < 2:
        raise CombineError("cần ít nhất hai luồng để ghép")
    widths = [stream.spines for stream in streams]
    parsed = [split_measures(stream) for stream in streams]
    counts = [len(segments) for _, segments, _ in parsed]
    if len(set(counts)) != 1 or counts[0] == 0:
        raise CombineError(f"các ảnh cắt riêng cho số ô nhịp khác nhau {counts}")

    warnings: list[str] = []
    body = _combine_prologue([p for p, _, _ in parsed], widths)
    mismatched = 0
    for index in range(counts[0]):
        timed = [row_onsets(segments[index], width) for (_, segments, _), width in zip(parsed, widths)]
        target = timed[0][1]
        if target <= 0:
            raise CombineError(f"ô nhịp {index + 1}: luồng đầu không có trường độ")
        for position in range(1, len(timed)):
            if timed[position][1] != target:
                replacement = _rest_stream(widths[position], target)
                if replacement is None:
                    raise CombineError(f"ô nhịp {index + 1}: trường độ lệch giữa các ảnh cắt riêng và không bù được")
                timed[position] = replacement
                mismatched += 1

        onsets = sorted({onset for rows, _ in timed for onset, _ in rows})
        for onset in onsets:
            groups = [[fields for at, fields in rows if at == onset] for rows, _ in timed]
            for k in range(max(len(group) for group in groups)):
                row: list[str] = []
                for group, width in zip(groups, widths):
                    row.extend(group[k] if k < len(group) else ["."] * width)
                body.append(TAB.join(row))
        last = index == counts[0] - 1
        final = parsed[0][2] if last and parsed[0][2] and parsed[0][2].startswith("==") else "="
        body.append(TAB.join([final] * sum(widths)))

    if mismatched:
        warnings.append(
            f"{mismatched} ô nhịp có trường độ lệch giữa khuông giọng và piano khi đọc riêng, "
            "khuông đó được thay bằng dấu lặng trọn ô"
        )
    header = TAB.join(["**kern"] * sum(widths))
    return PageKern(number=number, header=header, body=body), warnings
