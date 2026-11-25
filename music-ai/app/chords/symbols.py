"""Nốt thêm / biến hóa / bỏ bớt của hợp âm AutoHarmonizer → ``<degree>`` MusicXML và chữ hiển thị gõ lại được.

Từ vựng của model (``autoharmonizer/chords.json``) có 24 kind chuẩn và khoảng 400 hợp âm mang thêm phần sửa kiểu music21:
``"G7 alter #5 add #9"``, ``"A-sus add 7 add 9"``, ``"C7 subtract 5 add b9"``... Trước đây chỉ ghi kind nên G7(#5,#9)
thành G7. Giờ mỗi phần sửa thành một ``<degree>`` (giá trị theo gam trưởng: 9 = quãng chín trưởng, alter -1 = hạ nửa cung)
và chữ hiển thị theo cách gõ của Editor (``harmony.ts``: "7(#5,#9)", "9sus4", "6/9", "madd9"...), để trình phát đánh đúng
các nốt và người dùng sửa lại hợp âm vẫn ra đúng hợp âm đó.

Quy ước: "add 7" không dấu của music21 trong từ vựng này là quãng bảy thứ (7sus4 là hợp âm phổ biến nhất có phần sửa), nên
ghi ``degree-value 7, degree-alter -1``.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

Mod = tuple[str, int, int]
"""(add | alter | subtract, bậc 1..13, số nửa cung nâng/hạ so với bậc tự nhiên của gam trưởng)."""

_MOD = re.compile(r"\b(add|alter|subtract) ([#b]?)(\d+)")
_ACC = {"": 0, "#": 1, "b": -1}
_TRIADS = {"major", "minor", "augmented", "diminished", "suspended-fourth", "suspended-second", "power"}

# Quãng (nửa cung) các nốt của từng kind, giống bảng KIND_INTERVALS của web (chordNotes.ts)
KIND_INTERVALS: dict[str, tuple[int, ...]] = {
    "major": (0, 4, 7),
    "minor": (0, 3, 7),
    "augmented": (0, 4, 8),
    "diminished": (0, 3, 6),
    "dominant": (0, 4, 7, 10),
    "major-seventh": (0, 4, 7, 11),
    "minor-seventh": (0, 3, 7, 10),
    "diminished-seventh": (0, 3, 6, 9),
    "augmented-seventh": (0, 4, 8, 10),
    "half-diminished": (0, 3, 6, 10),
    "major-minor": (0, 3, 7, 11),
    "major-sixth": (0, 4, 7, 9),
    "minor-sixth": (0, 3, 7, 9),
    "dominant-ninth": (0, 4, 7, 10, 14),
    "major-ninth": (0, 4, 7, 11, 14),
    "minor-ninth": (0, 3, 7, 10, 14),
    "dominant-11th": (0, 4, 7, 10, 14, 17),
    "major-11th": (0, 4, 7, 11, 14, 17),
    "minor-11th": (0, 3, 7, 10, 14, 17),
    "dominant-13th": (0, 4, 7, 10, 14, 21),
    "major-13th": (0, 4, 7, 11, 14, 21),
    "minor-13th": (0, 3, 7, 10, 14, 21),
    "suspended-second": (0, 2, 7),
    "suspended-fourth": (0, 5, 7),
    "power": (0, 7),
}


def modifications(figure: str) -> list[Mod]:
    """Các phần sửa trong tên music21 của hợp âm, theo thứ tự ghi."""
    out: list[Mod] = []
    for kind, acc, value in _MOD.findall(figure):
        alter = _ACC[acc]
        if kind == "add" and value == "7" and not acc:
            alter = -1
        out.append((kind, int(value), alter))
    return out


def natural_semitones(value: int) -> int:
    index = value - 1
    return (0, 2, 4, 5, 7, 9, 11)[index % 7] + 12 * (index // 7)


def pitch_classes(kind: str, mods: list[Mod]) -> set[int]:
    """Lớp cao độ (0-11, tính từ gốc) mà hợp âm phải vang: kind + các phần sửa (để kiểm tra trình phát của web)."""
    tones = list(KIND_INTERVALS[kind])
    for mtype, value, alter in mods:
        natural = natural_semitones(value)
        if mtype == "add":
            tones.append(natural + alter)
        elif mtype == "alter":
            tones = [t for t in tones if (t - natural) % 12 != 0] + [natural + alter]
        else:
            tones = [t for t in tones if (t - natural - alter) % 12 != 0]
    return {t % 12 for t in tones}


def _token(mtype: str, value: int, alter: int, triad: bool) -> str:
    acc = {-2: "bb", -1: "b", 0: "", 1: "#", 2: "##"}[alter]
    if mtype == "subtract":
        return f"no{value}"
    if mtype == "alter":
        return f"{acc}{value}"
    if value == 7:
        return "7" if alter == -1 else "maj7"
    if value in (2, 4, 5) or triad:
        return f"add{acc}{value}"
    return f"{acc}{value}"


def chord_text(kind: str, base_text: str, mods: list[Mod]) -> str:
    """Chữ hiển thị sau tên gốc, ví dụ ``"7(b9,#11)"``, ``"13sus4"``, ``"6/9"``, ``"madd9"``."""
    rest = list(mods)
    base = base_text
    triad = kind in _TRIADS
    if kind in ("suspended-fourth", "suspended-second"):
        sus = "sus4" if kind == "suspended-fourth" else "sus2"
        if ("add", 7, -1) in rest:
            rest.remove(("add", 7, -1))
            ext = "7"
            if ("add", 9, 0) in rest:
                rest.remove(("add", 9, 0))
                ext = "9"
                # "13sus4" hiểu là có cả 9; chỉ có 7 và 13 thì ghi "7sus4(13)"
                if ("add", 13, 0) in rest:
                    rest.remove(("add", 13, 0))
                    ext = "13"
            base, triad = ext + sus, False
        else:
            base = sus
    elif kind in ("major-sixth", "minor-sixth") and ("add", 9, 0) in rest:
        rest.remove(("add", 9, 0))
        base, triad = base_text + "/9", False
    tokens = [_token(*m, triad) for m in rest]
    if not tokens:
        return base
    single = tokens[0]
    joinable = (base or single.startswith(("add", "no", "maj"))) and not (base[-1:].isdigit() and single[0].isdigit())
    if len(tokens) == 1 and joinable:
        return base + single
    return f"{base}({','.join(tokens)})"


def append_degrees(harmony: ET.Element, mods: list[Mod]) -> None:
    """Thêm các ``<degree>`` sau ``<bass>`` (trước ``<staff>``/``<offset>`` theo thứ tự của MusicXML)."""
    for mtype, value, alter in mods:
        degree = ET.SubElement(harmony, "degree")
        ET.SubElement(degree, "degree-value").text = str(value)
        ET.SubElement(degree, "degree-alter").text = str(alter)
        ET.SubElement(degree, "degree-type").text = mtype


def degrees_of(harmony: ET.Element) -> tuple[Mod, ...]:
    """Các ``<degree>`` đang ghi trong một ``<harmony>`` (đọc lại hợp âm có sẵn trong ô bị khóa)."""
    out: list[Mod] = []
    for degree in harmony.findall("degree"):
        try:
            value = int(float(degree.findtext("degree-value") or 0))
            alter = int(float(degree.findtext("degree-alter") or 0))
        except ValueError:
            continue
        out.append(((degree.findtext("degree-type") or "add").strip(), value, alter))
    return tuple(sorted(out))
