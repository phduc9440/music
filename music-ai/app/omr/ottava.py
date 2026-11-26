"""Xử lý dấu chuyển quãng tám ``*8va``/``*8ba`` mà Transcoda sinh ra không có thật trên ảnh.

Bằng chứng (storage của dự án, 18 bản nhạc đã chạy): kern của ít nhất 6 bản có ``*8va`` dù ảnh không có đường 8va nào;
đều là bản giọng hát/thánh ca (khuông đơn) — loại khuông gần như không bao giờ dùng 8va. Model ghi ``*8va`` rồi viết nốt
**cao hơn một quãng tám** so với nốt in trên ảnh (bài "Dâng": hệ 5 ra G5/B♭5 thay vì G4/B♭4, 20 lỗi quãng tám trên 99 nốt).

Cách sửa: với khuông được chọn (mặc định: khuông đơn/giọng hát), bỏ dòng ``*8va``/``*8ba`` và đưa các nốt trong phạm vi
của nó về đúng quãng tám in trên ảnh (``*8va`` -> hạ 12 nửa cung, ``*8ba`` -> nâng 12). Khuông piano giữ nguyên vì 8va
có thật trong nhạc piano; khi đó chỉ cảnh báo để người dùng kiểm tra.

Chế độ (``OMR_OTTAVA``): ``auto`` (mặc định, như trên), ``drop`` (mọi khuông), ``keep`` (không đổi gì).
"""

from __future__ import annotations

import re
from typing import Callable, Optional

from app.omr.merge import TAB, MergeResult

MODE_AUTO = "auto"
MODE_DROP = "drop"
MODE_KEEP = "keep"
MODES = (MODE_AUTO, MODE_DROP, MODE_KEEP)

_OPEN = {"*8va": 12, "*8ba": -12, "*15ma": 24, "*15ba": -24}
_CLOSE = {"*X8va", "*X8ba", "*X15ma", "*X15ba"}
_PITCH_RE = re.compile(r"([a-gA-G])\1*")


def shift_token(token: str, semitones: int) -> str:
    """Dời mọi nốt trong token kern (kể cả hợp âm cách nhau bằng dấu cách) đi ``semitones`` (bội số của 12)."""
    octaves = semitones // 12
    if octaves == 0:
        return token
    return " ".join(_shift_sub(sub, octaves) for sub in token.split(" "))


def _shift_sub(sub: str, octaves: int) -> str:
    if "r" in sub:
        return sub
    match = _PITCH_RE.search(sub)
    if not match:
        return sub
    letters = match.group(0)
    letter = letters[0]
    # Quãng tám dạng số: c = 4, cc = 5, C = 3, CC = 2
    octave = 4 + len(letters) - 1 if letter.islower() else 3 - (len(letters) - 1)
    octave += octaves
    if octave >= 4:
        new = letter.lower() * (octave - 3)
    else:
        new = letter.upper() * (4 - octave)
    return sub[: match.start()] + new + sub[match.end():]


def resolve_ottava(
    result: MergeResult, drop_staff: Callable[[int], bool]
) -> tuple[MergeResult, int, list[int]]:
    """Bỏ ``*8va``... trên các khuông ``drop_staff(chỉ_số_khuông_từ_trên_xuống) == True``.

    Trả ``(kết quả mới, số token nốt đã dời, danh sách khuông (từ trên xuống) còn giữ 8va)``. Theo dõi ``*^``/``*v``
    để biết cột nào thuộc khuông nào.
    """
    spines = result.spines
    columns: list[int] = list(range(spines))  # chỉ số spine (trái -> phải) của từng cột
    state: list[int] = [0] * spines  # số nửa cung đang chuyển (theo cột)
    shifted = 0
    kept: set[int] = set()
    new_lines: list[str] = []
    new_pages: list[int] = []
    pages = result.line_pages or [1] * len(result.lines)

    def top_down(spine: int) -> int:
        return spines - 1 - spine

    for line, page in zip(result.lines, pages):
        tokens = line.split(TAB)
        if len(tokens) != len(columns):
            new_lines.append(line)
            new_pages.append(page)
            continue
        if line.startswith("*"):
            if any(t in ("*^", "*v") for t in tokens):
                columns, state = _split_join(tokens, columns, state)
                new_lines.append(line)
                new_pages.append(page)
                continue
            out = []
            for i, tok in enumerate(tokens):
                staff = top_down(columns[i])
                if tok in _OPEN:
                    if drop_staff(staff):
                        state[i] = _OPEN[tok]
                        out.append("*")
                        continue
                    kept.add(staff)
                elif tok in _CLOSE:
                    if drop_staff(staff):
                        state[i] = 0
                        out.append("*")
                        continue
                out.append(tok)
            if all(t == "*" for t in out):
                continue  # dòng chỉ còn diễn giải rỗng: bỏ
            new_lines.append(TAB.join(out))
            new_pages.append(page)
            continue
        if line.startswith("=") or line.startswith("!"):
            new_lines.append(line)
            new_pages.append(page)
            continue
        out = []
        for i, tok in enumerate(tokens):
            if state[i] and tok != ".":
                # *8va: model đã ghi nốt cao hơn nốt in một quãng tám -> hạ xuống
                new = shift_token(tok, -state[i])
                shifted += int(new != tok)
                out.append(new)
            else:
                out.append(tok)
        new_lines.append(TAB.join(out))
        new_pages.append(page)

    if shifted == 0 and len(new_lines) == len(result.lines):
        return result, 0, sorted(kept)
    text = "\n".join([result.header, *new_lines, TAB.join(["*-"] * spines)]) + "\n"
    return (
        MergeResult(
            text=text,
            spines=spines,
            warnings=list(result.warnings),
            line_pages=new_pages,
            lines=new_lines,
            header=result.header,
        ),
        shifted,
        sorted(kept),
    )


def _split_join(tokens: list[str], columns: list[int], state: list[int]) -> tuple[list[int], list[int]]:
    new_cols: list[int] = []
    new_state: list[int] = []
    i = 0
    while i < len(tokens):
        if tokens[i] == "*^":
            new_cols += [columns[i], columns[i]]
            new_state += [state[i], state[i]]
            i += 1
        elif tokens[i] == "*v":
            j = i
            while j < len(tokens) and tokens[j] == "*v":
                j += 1
            new_cols.append(columns[i])
            new_state.append(state[i])
            i = j
        else:
            new_cols.append(columns[i])
            new_state.append(state[i])
            i += 1
    return new_cols, new_state


def fix_text(text: str, mode: str, roles_top_down: Optional[list[str]] = None) -> tuple[str, int]:
    """Sửa 8va trên kern thô của MỘT lần đọc (một trang hoặc một hệ), trước khi làm sạch và ghép.

    Phạm vi của ``*8va`` model sinh ra chỉ nằm trong lần đọc đó: ghép xong mới sửa thì ``*8va`` của hệ trước "rò" sang
    các hệ đọc riêng phía sau (đo trên bài "Dâng": làm F1 tụt từ 0,794 xuống 0,753). Trả ``(kern đã sửa, số token dời)``.
    """
    if mode == MODE_KEEP or ("8va" not in text and "8ba" not in text and "15m" not in text):
        return text, 0
    lines = text.replace("\\n", "\n").split("\n")
    header_index = next((i for i, ln in enumerate(lines) if ln.startswith("**")), None)
    first = header_index if header_index is not None else next(
        (i for i, ln in enumerate(lines) if ln.startswith("*")), None
    )
    if first is None:
        return text, 0
    spines = lines[first].count(TAB) + 1
    start = first + 1 if header_index is not None else first
    body = lines[start:]
    trailing = [ln for ln in body if ln.strip()]
    header = lines[header_index] if header_index is not None else TAB.join(["**kern"] * spines)
    fake = MergeResult(text=text, spines=spines, lines=trailing, header=header, line_pages=[1] * len(trailing))
    fixed, shifted, _kept = resolve_ottava(fake, drop_rule(mode, roles_top_down, spines))
    if shifted == 0 and len(fixed.lines) == len(trailing):
        return text, 0
    out = lines[:start] + fixed.lines
    return "\n".join(out) + "\n", shifted


def drop_rule(mode: str, roles_top_down: Optional[list[str]], spines: int) -> Callable[[int], bool]:
    """Hàm chọn khuông cần bỏ 8va theo chế độ. ``auto``: khuông vai trò SINGLE; không biết vai trò thì chỉ bản một khuông."""
    if mode == MODE_KEEP:
        return lambda staff: False
    if mode == MODE_DROP:
        return lambda staff: True
    if roles_top_down is not None and len(roles_top_down) == spines:
        return lambda staff: roles_top_down[staff] != "PIANO"
    return lambda staff: spines == 1
