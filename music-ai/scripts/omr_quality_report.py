"""Báo cáo chất lượng nhận diện: người dùng phải sửa bao nhiêu sau khi số hóa (dùng cho báo cáo đồ án).

Với mỗi bản nhạc trong storage có nguồn OMR (có thư mục ``kern`` hoặc ``pages``) và từ hai phiên bản MusicXML trở lên,
so phiên bản đầu (``v1``, do OMR sinh) với phiên bản mới nhất (đã sửa) bằng ``app/analysis/diff.py``, rồi ghi:

* ``reports/omr-quality.csv``: mỗi bản nhạc một dòng (tỉ lệ ô sửa, ô OMR sinh thừa/bỏ sót, lỗi nốt theo loại);
* ``reports/omr-quality.md``: bảng tóm tắt cộng dòng tổng.

Chạy từ thư mục music-ai, không cần model, không cần music21, không gọi Java::

    python scripts/omr_quality_report.py                       # storage mặc định ../music-be/storage
    python scripts/omr_quality_report.py --storage /đường/dẫn/storage --out reports

Giới hạn: script chỉ đọc storage nên không biết ai là người sửa; "bản đã sửa" là phiên bản có số lớn nhất còn giữ (BE chỉ
giữ 20 bản mới nhất, nếu ``v1`` đã bị dọn thì bỏ qua bản nhạc đó). Bản nhạc chỉ có một phiên bản (chưa ai sửa) không đưa
vào bảng vì chưa có gì để đo.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.analysis import diff  # noqa: E402
from app.convert.errors import ConversionError  # noqa: E402

DEFAULT_STORAGE = Path(__file__).resolve().parents[2] / "music-be" / "storage"
_VERSION = re.compile(r"^v(\d+)\.musicxml$")

COLUMNS = [
    "scoreId",
    "baseVersion",
    "targetVersion",
    "baseMeasures",
    "targetMeasures",
    "same",
    "edited",
    "deleted",
    "added",
    "measureEditRate",
    "baseNotes",
    "noteErrors",
    "noteErrorRate",
    *diff.ERROR_TYPES,
]


def versions_of(score_dir: Path) -> dict[int, Path]:
    found: dict[int, Path] = {}
    for path in (score_dir / "musicxml").glob("v*.musicxml"):
        match = _VERSION.match(path.name)
        if match:
            found[int(match.group(1))] = path
    return found


def is_omr_score(score_dir: Path) -> bool:
    return (score_dir / "kern").is_dir() or (score_dir / "pages").is_dir()


def collect(storage: Path) -> tuple[list[dict], list[str]]:
    rows: list[dict] = []
    skipped: list[str] = []
    for score_dir in sorted((storage / "scores").iterdir()) if (storage / "scores").is_dir() else []:
        if not score_dir.is_dir() or not is_omr_score(score_dir):
            continue
        found = versions_of(score_dir)
        if len(found) < 2 or 1 not in found:
            if found:
                skipped.append(f"{score_dir.name[:8]}: chỉ có {sorted(found)}, chưa có bản đã sửa hoặc đã mất v1")
            continue
        base, target = 1, max(found)
        try:
            result = diff.diff_files(found[base], found[target])
        except ConversionError as exc:
            skipped.append(f"{score_dir.name[:8]}: {exc}")
            continue
        summary = result["summary"]
        row = {
            "scoreId": score_dir.name,
            "baseVersion": base,
            "targetVersion": target,
            **{k: summary[k] for k in COLUMNS[3:13]},
            **summary["byType"],
        }
        rows.append(row)
    return rows, skipped


def totals(rows: list[dict]) -> dict:
    total = {c: sum(r[c] for r in rows) for c in COLUMNS[3:9] + ["baseNotes", "noteErrors", *diff.ERROR_TYPES]}
    measures = total["same"] + total["edited"] + total["deleted"] + total["added"]
    total["measureEditRate"] = round((measures - total["same"]) / measures, 4) if measures else 0.0
    total["noteErrorRate"] = round(total["noteErrors"] / total["baseNotes"], 4) if total["baseNotes"] else 0.0
    return total


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(path: Path, rows: list[dict], skipped: list[str]) -> None:
    lines = [
        "# Chất lượng nhận diện: công sửa sau khi số hóa",
        "",
        "So phiên bản v1 (do OMR sinh) với phiên bản đã sửa mới nhất của từng bản nhạc.",
        "",
        "| Bản nhạc | v | Ô bản OMR | Ô giữ nguyên | Ô sửa | OMR thừa | OMR sót | Tỉ lệ ô bị sửa | Lỗi nốt | Tỉ lệ lỗi nốt |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            f"| {r['scoreId'][:8]} | v1→v{r['targetVersion']} | {r['baseMeasures']} | {r['same']} | {r['edited']} "
            f"| {r['deleted']} | {r['added']} | {pct(r['measureEditRate'])} | {r['noteErrors']} | {pct(r['noteErrorRate'])} |"
        )
    if rows:
        t = totals(rows)
        lines.append(
            f"| **Tổng ({len(rows)} bản)** | | | {t['same']} | {t['edited']} | {t['deleted']} | {t['added']} "
            f"| **{pct(t['measureEditRate'])}** | {t['noteErrors']} | **{pct(t['noteErrorRate'])}** |"
        )
        lines += ["", "## Lỗi nốt theo loại (các ô đã sửa)", "", "| Loại | Số lỗi |", "|---|---|"]
        labels = {
            "PITCH": "Sai cao độ",
            "ACCIDENTAL": "Sai dấu hóa",
            "DURATION": "Sai trường độ",
            "TIMING": "Lệch vị trí trong ô",
            "EXTRA": "Nốt thừa",
            "MISSING": "Nốt thiếu",
        }
        lines += [f"| {labels[k]} | {t[k]} |" for k in diff.ERROR_TYPES]
    else:
        lines.append("| (chưa có bản nhạc nào được sửa sau khi số hóa) | | | | | | | | | |")
    if skipped:
        lines += ["", "## Bỏ qua", ""] + [f"- {s}" for s in skipped]
    lines += [
        "",
        "Ô OMR thừa là ô model sinh ra mà người dùng phải xóa (thường do lặp ô nhịp); ô OMR sót là ô người dùng phải thêm.",
        "Mỗi nốt của ô thừa/sót được tính là một lỗi nốt.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--storage", type=Path, default=DEFAULT_STORAGE, help="gốc storage (có thư mục scores/)")
    parser.add_argument("--out", type=Path, default=Path("reports"), help="thư mục ghi báo cáo")
    args = parser.parse_args()

    rows, skipped = collect(args.storage)
    args.out.mkdir(parents=True, exist_ok=True)
    write_csv(args.out / "omr-quality.csv", rows)
    write_markdown(args.out / "omr-quality.md", rows, skipped)
    print(f"{len(rows)} bản nhạc, {len(skipped)} bỏ qua. Đã ghi {args.out / 'omr-quality.csv'} và omr-quality.md")
    if rows:
        t = totals(rows)
        print(f"Tỉ lệ ô bị sửa {pct(t['measureEditRate'])}, tỉ lệ lỗi nốt {pct(t['noteErrorRate'])}")


if __name__ == "__main__":
    main()
