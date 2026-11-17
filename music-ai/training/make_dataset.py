"""Tạo dữ liệu fine-tune Transcoda cho đúng miền bản nhạc của Smart Music AI (chạy trên Kaggle, không chạy trên Mac).

Vì sao cần: Transcoda v1 chỉ train trên ảnh Verovio render của nhạc piano/thính phòng; bản nhạc của dự án chủ yếu là
**thánh ca/bài hát tiếng Việt một khuông có lời và hợp âm**, ảnh chụp điện thoại (xem ``docs/omr-architecture-v2.md``).
Dữ liệu ở đây giữ đúng cách Transcoda được train (ảnh trang 1050x1485 -> ``**kern`` chỉ có nhạc), chỉ đổi miền:

1. **Tổng hợp** (nguồn MusicXML có giấy phép mở, ví dụ OpenScore Lieder - CC0, PDMX bản public domain):
   * giữ/thêm lời ca, thay bằng âm tiết tiếng Việt ngẫu nhiên có dấu (1-5 lời), thêm tên hợp âm (``<harmony>``) để model
     học BỎ QUA chữ; nhãn kern KHÔNG có lời (như Transcoda);
   * xuất các biến thể: chỉ khuông giọng hát (một khuông), giọng hát + piano, piano 2 khuông;
   * render bằng Verovio (font, cỡ, mật độ ngẫu nhiên), thu về 1050 rộng, biến dạng ảnh chụp/scan (``augment.py``).
2. **Thật** (ít, quý): ảnh gốc người dùng tải lên + MusicXML người dùng đã sửa tay trong editor (storage
   ``scores/<id>/musicxml/vN.musicxml`` với N > 1). Chỉ dùng khi chắc bản sửa khớp ảnh; KHÔNG dùng bản có trong
   ``benchmark/cases.json`` (đó là tập test).

Nhãn kern PHẢI đi qua bộ chuẩn hóa của Transcoda (21 bước; bài báo: bỏ chuẩn hóa thì OMR-NED 18,7% -> 82,5%). Bộ chuẩn
hóa nằm trong repo gốc (AGPL-3.0, ``github.com/btrkeks/transcoda``); script này gọi nó qua ``--normalizer-cmd`` (lệnh
nhận file kern ở ``{input}``, ghi ra ``{output}``) để không chép mã AGPL vào dự án. Không có chuẩn hóa thì script dừng
(trừ khi ``--allow-unnormalized`` để thử nhanh).

Chia train/val **theo bản nhạc** (mọi trang, mọi biến thể của một bản nằm cùng một tập) để không rò rỉ.

Đầu ra::

    OUT/train/images/<id>.png   OUT/train/labels/<id>.krn   OUT/train/manifest.jsonl
    OUT/val/...

Ví dụ (Kaggle)::

    pip install verovio cairosvg
    python training/make_dataset.py --musicxml-dir /kaggle/input/lieder --out /kaggle/working/data \\
        --pages 20000 --normalizer-cmd "python /kaggle/working/transcoda/<script chuẩn hóa> {input} {output}"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import shlex
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterable, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

VI_ONSETS = ["", "b", "c", "ch", "d", "đ", "g", "gi", "h", "k", "kh", "l", "m", "n", "ng", "nh", "ph", "qu", "r", "s",
             "t", "th", "tr", "v", "x"]
VI_RHYMES = ["a", "ai", "an", "ang", "anh", "ao", "âm", "ân", "âng", "ê", "em", "en", "ênh", "i", "in", "inh", "o", "oa",
             "oan", "ong", "ô", "ôi", "ông", "ơ", "ơi", "ơn", "u", "ua", "uân", "ung", "ư", "ưa", "ương", "yêu"]
TONES = ["", "́", "̀", "̉", "̃", "̣"]  # sắc, huyền, hỏi, ngã, nặng
CHORDS = ["C", "Dm", "Em", "F", "G", "G7", "Am", "Bb", "C7", "D7", "Gm", "Em(b5)", "Csus4", "A7"]


def vietnamese_syllable(rng: random.Random) -> str:
    """Âm tiết tiếng Việt ngẫu nhiên (có thể không có nghĩa) với dấu thanh đặt ở nguyên âm chính."""
    import unicodedata  # noqa: PLC0415

    syllable = rng.choice(VI_ONSETS) + rng.choice(VI_RHYMES)
    tone = rng.choice(TONES)
    if tone:
        vowels = [i for i, ch in enumerate(syllable) if unicodedata.normalize("NFD", ch)[0] in "aeiouy"]
        if vowels:
            pos = vowels[len(vowels) // 2] if len(vowels) > 1 else vowels[0]
            syllable = syllable[: pos + 1] + tone + syllable[pos + 1 :]
    syllable = unicodedata.normalize("NFC", syllable)
    return syllable.capitalize() if rng.random() < 0.08 else syllable


def add_text_distractors(xml: bytes, rng: random.Random, verses: int, chords: bool) -> bytes:
    """Thay/thêm lời ca tiếng Việt (``verses`` lời) vào mọi nốt của part đầu tiên, thêm tên hợp âm. Nhạc giữ nguyên."""
    root = ET.fromstring(xml)
    parts = root.findall("part")
    if not parts:
        return xml
    for note in root.iter("note"):
        for lyric in note.findall("lyric"):
            note.remove(lyric)
    for measure in parts[0].findall("measure"):
        if chords and rng.random() < 0.6:
            harmony = ET.Element("harmony")
            root_el = ET.SubElement(harmony, "root")
            name = rng.choice(CHORDS)
            ET.SubElement(root_el, "root-step").text = name[0]
            ET.SubElement(harmony, "kind", {"text": name[1:]}).text = "minor" if "m" in name[1:2] else "major"
            measure.insert(0, harmony)
        for note in measure.findall("note"):
            if note.find("rest") is not None or note.find("chord") is not None:
                continue
            for number in range(1, verses + 1):
                lyric = ET.SubElement(note, "lyric", {"number": str(number)})
                ET.SubElement(lyric, "syllabic").text = "single"
                ET.SubElement(lyric, "text").text = vietnamese_syllable(rng)
    return ET.tostring(root, encoding="utf-8")


def keep_parts(xml: bytes, indices: list[int]) -> bytes:
    """Chỉ giữ các part theo chỉ số (biến thể "chỉ giọng hát", "chỉ piano")."""
    root = ET.fromstring(xml)
    parts = root.findall("part")
    keep_ids = {parts[i].get("id") for i in indices if i < len(parts)}
    part_list = root.find("part-list")
    for p in parts:
        if p.get("id") not in keep_ids:
            root.remove(p)
    if part_list is not None:
        for sp in list(part_list.findall("score-part")):
            if sp.get("id") not in keep_ids:
                part_list.remove(sp)
    return ET.tostring(root, encoding="utf-8")


def strip_non_kern_spines(humdrum: str) -> str:
    """Bỏ mọi spine không phải ``**kern`` (``**text`` lời ca, ``**dynam``...) khỏi Humdrum: nhãn chỉ có nhạc.

    Giả định spine không phải kern không tách/gộp (``*^``/``*v``), đúng với ``**text``/``**dynam`` do Verovio xuất.
    Dòng có số cột khác số spine đang theo dõi bị giữ nguyên các cột kern theo vị trí; nếu không xác định được thì bỏ.
    """
    out: list[str] = []
    kinds: list[str] = []
    for line in humdrum.splitlines():
        if line.startswith("!!"):
            continue
        cols = line.split("\t")
        if line.startswith("**"):
            kinds = cols
        if not kinds:
            continue
        if any(c in ("*^", "*v") for c in cols):
            new_kinds = []
            i = 0
            while i < len(cols):
                if cols[i] == "*^":
                    new_kinds += [kinds[i], kinds[i]]
                    i += 1
                elif cols[i] == "*v":
                    j = i
                    while j < len(cols) and cols[j] == "*v":
                        j += 1
                    new_kinds.append(kinds[i])
                    i = j
                else:
                    new_kinds.append(kinds[i])
                    i += 1
            kept = [c for c, k in zip(cols, kinds) if k == "**kern"]
            kinds = new_kinds
        else:
            if len(cols) != len(kinds):
                continue
            kept = [c for c, k in zip(cols, kinds) if k == "**kern"]
        if kept and not all(c.startswith("!") for c in kept):
            out.append("\t".join(kept))
    return "\n".join(out) + "\n"


def split_of(piece_id: str, val_fraction: float) -> str:
    """Tập (train/val) theo băm của mã bản nhạc: ổn định giữa các lần chạy, không rò rỉ trang giữa hai tập."""
    digest = int(hashlib.sha1(piece_id.encode("utf-8")).hexdigest()[:8], 16)
    return "val" if digest / 0xFFFFFFFF < val_fraction else "train"


def excluded_inputs(cases_path: Path) -> set[str]:
    """Tên file ảnh/PDF của bộ benchmark: không bao giờ được đưa vào dữ liệu train."""
    if not cases_path.is_file():
        return set()
    cases = json.loads(cases_path.read_text(encoding="utf-8"))["cases"]
    return {Path(c["input"]).name for c in cases if c.get("input")} | {
        run for c in cases for run in c.get("storedRuns", [])
    }


def render_pages(xml: bytes, rng: random.Random) -> Iterable[tuple[str, "object"]]:
    """Render MusicXML bằng Verovio: trả ``(kern của trang, ảnh xám 1050 rộng)`` cho từng trang."""
    import cairosvg  # noqa: PLC0415
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415
    import verovio  # noqa: PLC0415

    tk = verovio.toolkit()
    tk.setOptions(
        {
            "pageWidth": 2100,
            "pageHeight": 2970,
            "scale": rng.choice([35, 40, 45, 50]),
            "font": rng.choice(["Leipzig", "Bravura", "Leland", "Gootville", "Petaluma"]),
            "spacingSystem": rng.choice([6, 9, 12]),
            "lyricSize": rng.choice([3.5, 4.0, 4.5, 5.0]),
            "header": "none",
            "footer": "none",
            "breaks": "auto",
            "adjustPageHeight": False,
        }
    )
    if not tk.loadData(xml.decode("utf-8")):
        return
    for page in range(1, tk.getPageCount() + 1):
        svg = tk.renderToSVG(page)
        png = cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=1050, background_color="white")
        img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
        # Kern của riêng trang: Verovio xuất Humdrum cho cả bản; với nhãn từng trang cần cắt theo ô nhịp của trang
        # (tk.getTimesForElement / ô đầu-cuối của trang). Đơn giản và an toàn: chỉ dùng bản vừa một trang.
        if tk.getPageCount() == 1:
            yield strip_non_kern_spines(tk.getHumdrum()), img


def normalize(kern: str, command: Optional[str]) -> Optional[str]:
    if not command:
        return kern
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.krn", Path(tmp) / "out.krn"
        src.write_text(kern, encoding="utf-8")
        args = [part.format(input=str(src), output=str(dst)) for part in shlex.split(command)]
        done = subprocess.run(args, capture_output=True, text=True, timeout=60)
        if done.returncode != 0 or not dst.is_file():
            return None
        return dst.read_text(encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--musicxml-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--pages", type=int, default=20000)
    parser.add_argument("--val-fraction", type=float, default=0.05)
    parser.add_argument("--normalizer-cmd", default="")
    parser.add_argument("--allow-unnormalized", action="store_true")
    parser.add_argument("--cases", type=Path, default=Path(__file__).resolve().parents[1] / "benchmark" / "cases.json")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    if not args.normalizer_cmd and not args.allow_unnormalized:
        raise SystemExit("Cần --normalizer-cmd (bộ chuẩn hóa kern của Transcoda); xem docstring")

    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    from training.augment import degrade  # noqa: PLC0415

    rng = random.Random(args.seed)
    np_rng = np.random.default_rng(args.seed)
    excluded = excluded_inputs(args.cases)
    sources = sorted(p for p in args.musicxml_dir.rglob("*") if p.suffix.lower() in (".musicxml", ".xml", ".mxl"))
    written = 0
    manifests = {}
    for path in sources:
        if written >= args.pages:
            break
        if path.name in excluded:
            continue
        piece = path.stem
        split = split_of(piece, args.val_fraction)
        data = path.read_bytes()
        n_parts = len(ET.fromstring(data).findall("part"))
        variants = [("full", list(range(n_parts)))]
        if n_parts >= 2:
            variants += [("voice", [0]), ("piano", list(range(1, n_parts)))]
        for name, parts in variants:
            xml = keep_parts(data, parts)
            if name != "piano":
                xml = add_text_distractors(xml, rng, verses=rng.choice([1, 1, 2, 3, 4, 5]), chords=rng.random() < 0.6)
            for page_index, (kern, img) in enumerate(render_pages(xml, rng)):
                label = normalize(kern, args.normalizer_cmd)
                if label is None:
                    continue
                profile = rng.choice(["clean", "scan", "photo", "photo"])
                img = degrade(img, np_rng, profile)
                sample = f"{piece}-{name}-{page_index:02d}"
                folder = args.out / split
                (folder / "images").mkdir(parents=True, exist_ok=True)
                (folder / "labels").mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(folder / "images" / f"{sample}.png"), img)
                (folder / "labels" / f"{sample}.krn").write_text(label, encoding="utf-8")
                manifests.setdefault(split, []).append(
                    {"id": sample, "piece": piece, "variant": name, "profile": profile,
                     "image": f"images/{sample}.png", "label": f"labels/{sample}.krn"}
                )
                written += 1
    for split, rows in manifests.items():
        with (args.out / split / "manifest.jsonl").open("w", encoding="utf-8") as fh:
            for row in rows:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Đã ghi {written} trang: " + ", ".join(f"{k}={len(v)}" for k, v in manifests.items()))


if __name__ == "__main__":
    main()
