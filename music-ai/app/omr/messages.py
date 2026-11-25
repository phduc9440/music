"""Cảnh báo và chỗ máy tự sửa dạng cấu trúc cho web (OMR-11, OMR-14).

Các bước của pipeline vẫn sinh câu tiếng Việt (``ctx.warnings``, ``report.notes``) như cũ, đọc được trong log và giữ cho
``result_data.warnings`` cũ. Mô-đun này đặt ngay cạnh nơi sinh câu và chuyển chúng thành mục có ``code`` + ``params`` +
``page``/``system``/``measure`` để web dựng câu theo ngôn ngữ người đọc và nhảy tới trang, không phải tách số trang bằng
biểu thức chính quy ở phía web (đổi câu chữ ở đây không làm hỏng web). Câu chưa có mã vẫn có ``page`` và ``text`` (phần
sau tiền tố "Trang N, ..."), web hiện nguyên văn.

Khi sửa một câu cảnh báo ở pipeline, sửa luôn mẫu tương ứng ở đây (``tests/test_messages.py`` kiểm các mẫu chính).
"""

from __future__ import annotations

import re
from typing import Optional

# ---------------------------------------------------------------------------------------------- cảnh báo

_PREFIX = re.compile(r"^Trang\s+(\d+)(?:,\s*hệ\s+(\d+))?(?:,\s*ô nhịp\s+(\d+))?\s*[,:]?\s*(.*)$", re.S)
"""Tiền tố vị trí do music-ai ghi: "Trang 2", "Trang 2, hệ 3", "Trang 2, ô nhịp 5", kèm dấu phẩy/hai chấm."""

_WARNING_CODES: list[tuple[str, re.Pattern[str], tuple[str, ...]]] = [
    ("PAGE_LANDSCAPE", re.compile(r"^nằm ngang, đã thu nhỏ"), ()),
    ("PAGE_BORDER_CROPPED", re.compile(r"^đã cắt dải viền đều màu"), ()),
    ("PAGE_SKEW_TOO_LARGE", re.compile(r"^góc nghiêng ước lượng ([\d.]+)° vượt quá (\d+)°"), ("angle", "max")),
    ("PAGE_NO_STAFF", re.compile(r"^không có khuông nhạc"), ()),
    ("PAGE_NO_NOTES", re.compile(r"^không nhận diện được nốt nào nên đã bỏ qua"), ()),
    ("PAGE_ONLY_RESTS", re.compile(r"^kết quả chỉ có dấu lặng"), ()),
    ("PAGE_TRUNCATED", re.compile(r"^kết quả chạm giới hạn độ dài của model"), ()),
    ("PAGE_LOOP_TRIMMED", re.compile(r"^model sinh lặp, đã cắt (\d+) dòng lặp"), ("count",)),
    ("PAGE_MEASURE_MISMATCH", re.compile(r"^đọc được (\d+) ô nhịp trong khi ảnh có (\d+) ô"), ("found", "expected")),
    ("PAGE_STAFF_MISMATCH", re.compile(r"^đọc được (\d+) khuông trong khi ảnh có (\d+) khuông"), ("found", "expected")),
    ("SYSTEM_MEASURE_MISMATCH", re.compile(r"^đọc ra (\d+) ô nhịp trong khi ảnh có (\d+) ô"), ("found", "expected")),
    ("BARLINES_INSERTED", re.compile(r"^model bỏ sót vạch nhịp, đã tự chèn (\d+) vạch nhịp"), ("count",)),
    ("TEXT_ABOVE_STAFF", re.compile(r"^có chữ phía trên khuông"), ()),
    ("TEMPO_DEFAULT", re.compile(r"^Không đọc được nhịp độ trên bản gốc, đang dùng (\d+) BPM"), ("bpm",)),
]


def text_above_message(page: int) -> str:
    """Câu cảnh báo OMR-13: trang có chữ phía trên khuông (tên hợp âm, nhịp độ...) mà OMR chưa đọc."""
    return (
        f"Trang {page}: có chữ phía trên khuông (thường là tên hợp âm hoặc nhịp độ) mà hệ thống chưa nhận diện, "
        "hợp âm in trên bản gốc không có trong bản số"
    )


def tempo_default_message(bpm: int) -> str:
    """Câu cảnh báo OMR-13: không đọc được nhịp độ nên dùng mặc định."""
    return f"Không đọc được nhịp độ trên bản gốc, đang dùng {bpm} BPM; hãy sửa lại cho đúng bản gốc"


def warning_item(raw: str) -> dict:
    """Một câu cảnh báo -> ``{code, page, system, measure, params, text}`` (thiếu thì None/rỗng)."""
    page = system = measure = None
    rest = raw
    match = _PREFIX.match(raw)
    if match:
        page = int(match.group(1))
        system = int(match.group(2)) if match.group(2) else None
        measure = int(match.group(3)) if match.group(3) else None
        rest = match.group(4) or raw
    code, params = _match(rest, _WARNING_CODES)
    if code is None and match is None:  # câu không có tiền tố trang (vd. TEMPO_DEFAULT)
        code, params = _match(raw, _WARNING_CODES)
    return {"code": code, "page": page, "system": system, "measure": measure, "params": params, "text": rest}


def warning_items(warnings: list[str]) -> list[dict]:
    return [warning_item(w) for w in warnings]


# ---------------------------------------------------------------------------------------------- chỗ tự sửa

_FIX_CODES: list[tuple[str, re.Pattern[str], tuple[str, ...]]] = [
    ("OCTAVE_FIXED", re.compile(r"^sửa quãng tám (\d+) nốt"), ("count",)),
    ("OTTAVA_FIXED", re.compile(r"^model thêm dấu 8va .*đã đưa (\d+) nốt"), ("count",)),
    ("REREAD_REPLACED", re.compile(r"^đã sửa theo các lần đọc lại hệ"), ()),
    ("AI_REPLACED", re.compile(r"^đã sửa theo đối chiếu của AI"), ()),
]

_RHYTHM = re.compile(r"^Sửa trường độ ở ô ([\d,\s]+):")


def rhythm_fix_message(measures: list[int], triplets: int, dropped: int, dots: int) -> str:
    """Câu cho bước sửa trường độ, chỉ nêu các việc thực sự đã làm (không còn "0 chỗ...", OMR-14)."""
    parts = []
    if triplets:
        parts.append(f"{triplets} chỗ nhịp ba đọc nhầm")
    if dropped:
        parts.append(f"bỏ {dropped} nốt thừa trong hợp âm")
    if dots:
        parts.append(f"thêm {dots} chấm dôi")
    return f"Sửa trường độ ở ô {', '.join(map(str, measures))}: " + ", ".join(parts)


def fix_item(raw: str) -> dict:
    """Một câu "đã tự sửa" -> ``{code, page, measures, params, text}``."""
    rhythm = _RHYTHM.match(raw)
    if rhythm:
        measures = [int(m) for m in re.findall(r"\d+", rhythm.group(1))]
        params = {}
        for key, pattern in (
            ("triplets", r"(\d+) chỗ nhịp ba"),
            ("dropped", r"bỏ (\d+) nốt thừa"),
            ("dots", r"thêm (\d+) chấm dôi"),
        ):
            found = re.search(pattern, raw)
            params[key] = int(found.group(1)) if found else 0
        return {"code": "RHYTHM_FIXED", "page": None, "measures": measures, "params": params, "text": raw}
    page = None
    measures: list[int] = []
    rest = raw
    match = _PREFIX.match(raw)
    if match:
        page = int(match.group(1))
        if match.group(3):
            measures = [int(match.group(3))]
        rest = match.group(4) or raw
    code, params = _match(rest, _FIX_CODES)
    return {"code": code, "page": page, "measures": measures, "params": params, "text": rest}


def fix_items(notes: list[str]) -> list[dict]:
    return [fix_item(n) for n in notes]


def _match(
    text: str, table: list[tuple[str, re.Pattern[str], tuple[str, ...]]]
) -> tuple[Optional[str], dict]:
    for code, pattern, names in table:
        found = pattern.search(text)
        if found:
            params: dict = {}
            for name, value in zip(names, found.groups()):
                params[name] = float(value) if "." in value else int(value)
            return code, params
    return None, {}
