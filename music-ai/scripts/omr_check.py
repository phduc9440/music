"""Đối chiếu bố cục trang với kern và đo các chế độ nhận diện lại (dùng cho báo cáo đồ án).

Hai cách dùng, chạy từ thư mục music-ai:

    # 1. Không cần model: so số khuông trên ảnh (bố cục) với số spine trong kern/page-NNN.krn đã lưu
    python scripts/omr_check.py 37ca0796-2b70-47e3-9d65-844bb0dfa366
    python scripts/omr_check.py --all

    # 2. Có model (máy đã cài torch/transformers): chạy lại Transcoda trên pages/*.png theo từng chế độ và in bảng
    python scripts/omr_check.py 37ca0796-... --run off,fallback,always

Thêm ``--dump DIR`` để lưu ảnh trang ảo và kern thô từng lần đọc (``DIR/<chế độ>/pNNN-sKK[-tag][-bN].png|.krn``) cùng
``systems.txt`` (mỗi hệ: số spine cần/đọc được, đọc cả hệ hay đọc riêng giọng/piano). Mở các file này ra đối chiếu với ảnh
để biết model sai ở đâu.

Chế độ 2 không ghi gì vào storage và không gọi Java. Các chỉ số:

* ``pagesOk``: số trang có số spine đúng bằng số khuông trên ảnh, đếm SAU khi độn cột nên có thể lạc quan;
* ``systemsOk``: số hệ đọc đúng số khuông THẬT (trước khi độn cột), trên tổng số hệ của các trang có bố cục tin cậy.
  Đây mới là chỉ số nên dùng để so các chế độ;
* ``measuresOk``: tỉ lệ ô nhịp có tổng trường độ khớp số chỉ nhịp trên bản ghép;
* ``s/page``: thời gian suy luận trung bình mỗi trang (kể cả nhận diện lại).
"""

from __future__ import annotations

import argparse
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.omr import merge, routing  # noqa: E402
from app.omr.layout import analyze_layout_file  # noqa: E402


def score_dirs(root: Path, ids: list[str], every: bool) -> list[Path]:
    scores = root / "scores"
    if every:
        return sorted(p for p in scores.iterdir() if (p / "pages").is_dir())
    return [scores / i for i in ids]


def offline_check(folder: Path) -> None:
    print(f"\n== {folder.name}")
    print(f"{'trang':>5}  {'khuông/hệ (ảnh)':<22} {'tin cậy':<8} {'vai trò':<24} {'spine kern':>10}  kết luận")
    for png in sorted((folder / "pages").glob("page-*.png")):
        number = int(png.stem.split("-")[1])
        layout = analyze_layout_file(png)
        kern_file = folder / "kern" / f"page-{number:03d}.krn"
        spines = "-"
        if kern_file.is_file():
            page, _ = merge.clean_page(number, kern_file.read_text(encoding="utf-8"))
            spines = str(page.spines) if page else "bỏ"
        expected = routing.expected_staves(layout)
        verdict = "?" if expected is None or spines in ("-", "bỏ") else ("OK" if int(spines) == expected else "SAI")
        roles = ",".join(layout.roles or []) or "-"
        print(
            f"{number:>5}  {str(layout.staff_counts):<22} {str(layout.confident):<8} {roles:<24} {spines:>10}  {verdict}"
        )


def model_run(folder: Path, modes: list[str], dump: Path | None = None) -> None:
    from app.omr.transcoda import TranscodaRecognizer  # noqa: PLC0415 - chỉ cần khi chạy model

    settings = get_settings()
    recognizer = TranscodaRecognizer(settings)
    recognizer.load()
    if not recognizer.model_loaded:
        raise SystemExit(f"Không nạp được model: {recognizer.error}")
    pngs = sorted((folder / "pages").glob("page-*.png"))
    layouts = {int(p.stem.split("-")[1]): analyze_layout_file(p) for p in pngs}

    def check() -> None:
        return None

    print(f"\n== {folder.name}: {len(pngs)} trang, thiết bị {recognizer.device}")
    print(f"{'chế độ':<10} {'pagesOk':>8} {'systemsOk':>10} {'measuresOk':>11} {'s/page':>8}  chi tiết")
    with tempfile.TemporaryDirectory(prefix="omr-check-") as work:
        full_cache: dict[int, tuple[str, bool, float]] = {}
        for mode in modes:
            started = time.monotonic()
            chosen: list[merge.PageKern] = []
            ok = counted = 0
            systems_ok = systems_total = 0
            details: list[str] = []
            report_lines: list[str] = []
            mode_dir = (dump / folder.name[:8] / mode) if dump else None
            if mode_dir:
                mode_dir.mkdir(parents=True, exist_ok=True)
            for png in pngs:
                number = int(png.stem.split("-")[1])
                if number not in full_cache:  # kết quả cả trang giống nhau ở mọi chế độ: chạy một lần, cộng thời gian
                    begin = time.monotonic()
                    result = recognizer.recognize(png, check)
                    full_cache[number] = (result.text, result.truncated, time.monotonic() - begin)
                text, truncated, _ = full_cache[number]
                page, _ = merge.clean_page(number, text, max_repeat=settings.max_repeat_lines, truncated=truncated)
                layout = layouts[number]
                expected = routing.expected_staves(layout)
                if routing.needs_fallback(mode, layout, page):
                    gray = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)

                    def recognize(image, index, beams, tag=None, n=number):
                        stem = f"p{n:03d}-s{index + 1:02d}" + (f"-{tag}" if tag else "") + (f"-b{beams}" if beams else "")
                        path = (mode_dir or Path(work)) / f"{stem}.png"
                        cv2.imwrite(str(path), image)
                        res = recognizer.recognize(path, check, **({"num_beams": beams} if beams else {}))
                        if mode_dir:
                            (mode_dir / f"{stem}.krn").write_text(res.text, encoding="utf-8")
                        return res.text, res.truncated

                    candidate, systems, _ = routing.recognize_by_systems(
                        number, gray, layout, recognize, settings.routing_retry_beams, lambda: True
                    )
                    good = sum(1 for r, s in zip(systems, layout.systems) if r.page and r.page.spines == len(s.staves))
                    for k, (r, sy) in enumerate(zip(systems, layout.systems), start=1):
                        got = r.page.spines if r.page else 0
                        report_lines.append(
                            f"trang {number} hệ {k}: cần {len(sy.staves)} spine, đọc {got} ({r.method}, {r.attempts} lần đọc)"
                        )
                    complete = all(r.page is not None for r in systems)
                    source, page, _, _ = routing.choose(
                        page, candidate if complete or page is None else None, expected or 0,
                        good / len(systems) if systems else 0.0,
                    )
                    details.append(f"tr{number}:{source}({good}/{len(systems)})")
                    if source == routing.SOURCE_SYSTEMS:
                        systems_ok += good
                elif page is not None and expected is not None and page.spines == expected:
                    systems_ok += len(layout.systems)  # đọc cả trang đúng số spine: coi mọi hệ đúng
                if expected is not None:
                    systems_total += len(layout.systems)
                    counted += 1
                    ok += int(page is not None and page.spines == expected)
                if page is not None:
                    chosen.append(page)
            seconds = time.monotonic() - started + sum(v[2] for v in full_cache.values())
            ratio = "-"
            if chosen:
                merged = merge.merge_pages(chosen, lenient=True)
                checked, bad = merge.measure_stats(merged)
                ratio = f"{(checked - bad) / checked:.1%}" if checked else "-"
            print(
                f"{mode:<10} {ok:>4}/{counted:<3} {systems_ok:>6}/{systems_total:<3} {ratio:>11} "
                f"{seconds / max(1, len(pngs)):>8.1f}  {' '.join(details)}"
            )
            if mode_dir:
                (mode_dir / "systems.txt").write_text("\n".join(report_lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("score_ids", nargs="*", help="scoreId trong storage/scores")
    parser.add_argument("--all", action="store_true", help="mọi bản nhạc có thư mục pages/")
    parser.add_argument("--storage", type=Path, default=None, help="gốc storage (mặc định STORAGE_ROOT hoặc music-be/storage)")
    parser.add_argument("--dump", type=Path, default=None, help="lưu ảnh trang ảo và kern thô từng lần đọc vào thư mục này")
    parser.add_argument("--run", default="", help="chạy model theo các chế độ, ví dụ off,fallback,always")
    args = parser.parse_args()
    root = args.storage or get_settings().storage_root
    folders = score_dirs(root, args.score_ids, args.all)
    if not folders:
        parser.error("cần scoreId hoặc --all")
    modes = [m.strip() for m in args.run.split(",") if m.strip()]
    for mode in modes:
        if mode not in routing.MODES:
            parser.error(f"chế độ {mode!r} không hợp lệ ({', '.join(routing.MODES)})")
    for folder in folders:
        offline_check(folder)
        if modes:
            model_run(folder, modes, args.dump)


if __name__ == "__main__":
    main()
