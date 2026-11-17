"""Benchmark OMR trên bộ kiểm thử cố định ``benchmark/cases.json`` (so model/cấu hình cũ và mới cùng điều kiện).

Chạy từ thư mục music-ai. Ba chế độ:

    # 1. Không cần model: chấm các kết quả Transcoda ĐÃ LƯU trong storage (kern lượt chính và kern cuối cùng)
    python scripts/omr_benchmark.py stored

    # 2. Không cần model: chạy riêng nhánh lời ca trên ảnh đầu vào, phần nhạc lấy từ ground truth
    #    (đo đúng chất lượng OCR + gắn lời, không lẫn lỗi phần nhạc)
    python scripts/omr_benchmark.py lyrics

    # 3. Cần torch + Transcoda: chạy cả pipeline (không gọi Java) cho từng biến thể cấu hình rồi chấm
    python scripts/omr_benchmark.py run --variant old:OMR_OTTAVA=keep,OMR_LYRICS=off --variant new:

Kết quả in ra bảng và ghi ``benchmark/results/<chế-độ>-<thời-gian>.json`` (+ ``.md``). Metric: xem ``app/eval``.
"""

from __future__ import annotations

import argparse
import json
import os
import resource
import shutil
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.eval.export import to_musicxml  # noqa: E402
from app.eval.lyrics import compare_lyrics  # noqa: E402
from app.eval.metrics import compare  # noqa: E402
from app.eval.score import Lyric, load_score, read_musicxml  # noqa: E402
from app.eval.text import TextScore, cer, wer  # noqa: E402

BENCH = ROOT / "benchmark"
MUSIC_KEYS = ("noteF1", "notePrecision", "noteRecall", "pitchAccuracy", "durationAccuracy", "chordAccuracy",
              "measureExactRate", "ser")


def load_cases(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["cases"]


def storage_root() -> Path:
    from app.config import get_settings  # noqa: PLC0415

    return get_settings().storage_root


def gt_lyrics(case: dict) -> list[Lyric] | None:
    """Lời ca ground truth: ``lyrics.json`` nếu có, không thì lời ca nằm sẵn trong ground truth MusicXML."""
    rel = case.get("groundTruth", {}).get("lyrics")
    if not rel:
        music = case.get("groundTruth", {}).get("music")
        if music and music.endswith((".musicxml", ".xml")):
            return load_score(BENCH / music).lyrics or None
        return None
    data = json.loads((BENCH / rel).read_text(encoding="utf-8"))
    return [Lyric(x["measure"], x["note"], x["number"], x["text"]) for x in data["lyrics"]]


# ====================================================================== 1. kết quả đã lưu


def cmd_stored(cases: list[dict]) -> dict:
    root = storage_root()
    rows = []
    for case in cases:
        music = case.get("groundTruth", {}).get("music")
        if not music or not case.get("storedRuns"):
            continue
        ref = load_score(BENCH / music)
        for run_id in case["storedRuns"]:
            folder = root / "scores" / run_id
            for label, rel in (("lượt chính (cả trang)", "kern/page-001.krn"), ("kern cuối (merged)", "kern/merged.krn")):
                path = folder / rel
                if not path.is_file():
                    continue
                hyp = load_score(path)
                metrics = compare(ref, hyp).to_dict()
                rows.append({"case": case["id"], "run": run_id[:8], "output": label, **metrics})
            simulated = _resimulate_systems(folder)
            if simulated is not None:
                metrics = compare(ref, load_score(simulated)).to_dict()
                rows.append({"case": case["id"], "run": run_id[:8], "output": "hệ đã lưu + sửa 8va (mô phỏng)",
                             **metrics})
    _print_music(rows)
    return {"mode": "stored", "rows": rows}


def _resimulate_systems(folder: Path) -> Path | None:
    """Ghép lại kern từng hệ đã lưu (``routing/page-NNN-sKK.krn``, lần đọc greedy cả hệ) có áp dụng sửa 8va theo từng
    lần đọc như pipeline mới. Chỉ là mô phỏng: không gồm đọc riêng giọng/piano hay beam. None nếu không có hệ nào."""
    from app.omr import merge, ottava  # noqa: PLC0415

    systems = sorted((folder / "routing").glob("page-*-s[0-9][0-9].krn")) if (folder / "routing").is_dir() else []
    if not systems:
        return None
    pages = []
    for index, path in enumerate(systems, start=1):
        text, _ = ottava.fix_text(path.read_text(encoding="utf-8"), "auto", None)
        page, _ = merge.clean_page(index, text)
        if page is not None:
            pages.append(page)
    if not pages:
        return None
    out = Path(tempfile.mkdtemp(prefix="omr-sim-")) / "merged.krn"
    out.write_text(merge.merge_pages(pages, lenient=True).text, encoding="utf-8")
    return out


# ====================================================================== 2. riêng lời ca


def cmd_lyrics(cases: list[dict]) -> dict:
    import cv2  # noqa: PLC0415

    from app.omr import measure_map as mm  # noqa: PLC0415
    from app.omr.layout import analyze_layout  # noqa: PLC0415
    from app.omr.lyrics import get_text_engine  # noqa: PLC0415
    from app.omr.lyrics.regions import KIND_LYRICS, read_page_text  # noqa: PLC0415
    from app.omr.lyrics.step import LyricsPage, recognize_lyrics  # noqa: PLC0415
    from app.omr.preprocess import PreprocessOptions, load_image_gray, process_page  # noqa: PLC0415

    engine, reason = get_text_engine()
    if engine is None:
        raise SystemExit(f"Không chạy được OCR: {reason}")
    root = storage_root()
    rows = []
    for case in cases:
        gt = case.get("groundTruth", {})
        if not case.get("input") or not (gt_lyrics(case) or gt.get("lyricsLines")):
            continue
        source = root / case["input"]
        if not source.is_file():
            print(f"[bỏ qua] {case['id']}: không thấy {source}")
            continue
        started = time.monotonic()
        result = process_page(load_image_gray(source), PreprocessOptions(source_type=case.get("sourceType", "PHOTO")), 1)
        layout = analyze_layout(result.image)
        row: dict = {"case": case["id"], "systems": len(layout.systems)}
        if gt.get("lyricsLines"):
            lines = json.loads((BENCH / gt["lyricsLines"]).read_text(encoding="utf-8"))["lines"]
            text = read_page_text(result.image, result.ocr_image, result.scale, layout, engine)
            hyp = {(ln.system + 1, ln.number): ln.text for ln in text.lines if ln.kind == KIND_LYRICS}
            c, w = TextScore(0, 0), TextScore(0, 0)
            norm = lambda t: " ".join(t.replace(" - ", "-").split())  # noqa: E731
            for item in lines:
                got = hyp.get((item["system"], item["number"]), "")
                c += cer(norm(item["text"]), norm(got))
                w += wer(norm(item["text"]), norm(got), punctuation=False)
            row.update({"cer": round(c.rate, 4), "wer": round(w.rate, 4), "lines": len(lines),
                        "linesFound": sum(1 for i in lines if (i["system"], i["number"]) in hyp)})
        if gt.get("music") and gt_lyrics(case):
            ref_music = load_score(BENCH / gt["music"])
            with tempfile.TemporaryDirectory() as tmp:
                tmp_dir = Path(tmp)
                cv2.imwrite(str(tmp_dir / "page.png"), result.image)
                cv2.imwrite(str(tmp_dir / "ocr.png"), result.ocr_image)
                xml = tmp_dir / "gt.musicxml"
                xml.write_bytes(to_musicxml(ref_music))
                if not layout.bars_confident or layout.measure_count != ref_music.measures:
                    print(f"[cảnh báo] {case['id']}: số ô trên ảnh {layout.measure_count} khác ground truth "
                          f"{ref_music.measures}, khung ô có thể lệch")
                entries, number = [], 0
                for si, system in enumerate(layout.systems):
                    for pos in range(system.measures or 0):
                        number += 1
                        entries.append({"measure": number, "page": 1, "system": si + 1,
                                        "box": mm._measure_box(layout, system, pos), "flags": []})
                report = recognize_lyrics(xml, [LyricsPage(1, tmp_dir / "page.png", layout, tmp_dir / "ocr.png",
                                                           result.scale)], entries, engine)
                hyp_lyrics = read_musicxml(xml.read_bytes()).lyrics
            score = compare_lyrics(gt_lyrics(case) or [], hyp_lyrics).to_dict()
            row.update({k: score[k] for k in ("alignmentAccuracy", "cer", "cerNoDiacritics", "wer",
                                              "refSyllables", "hypSyllables")})
            row["lowConfidence"] = report.summary()["lowConfidence"]
        row["seconds"] = round(time.monotonic() - started, 2)
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False))
    return {"mode": "lyrics", "engine": getattr(engine, "lang", None), "rows": rows}


# ====================================================================== 3. chạy cả pipeline


class RecordingCallback:
    """Thay JavaCallback: ghi lại mọi callback, không gọi mạng."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def progress(self, progress, step):
        self.calls.append(("progress", {"progress": progress, "step": step}))
        return True

    def file(self, **kwargs):
        self.calls.append(("files", kwargs))
        return True

    def complete(self, result_data, score_metadata=None):
        self.calls.append(("complete", {"resultData": result_data, "scoreMetadata": score_metadata}))
        return True

    def fail(self, error_code, message=None):
        self.calls.append(("fail", {"errorCode": error_code, "message": message}))
        return True


def cmd_run(cases: list[dict], variants: list[str]) -> dict:
    from app import config  # noqa: PLC0415
    from app.omr import engines  # noqa: PLC0415
    from app.omr.pipeline import run_omr_job  # noqa: PLC0415
    from app.schemas import JobRequest  # noqa: PLC0415

    source_root = storage_root()
    original_storage = os.environ.get("STORAGE_ROOT")
    rows = []
    for spec in variants or ["mặc-định:"]:
        name, _, env_text = spec.partition(":")
        overrides = dict(item.split("=", 1) for item in env_text.split(",") if "=" in item)
        saved = {k: os.environ.get(k) for k in overrides}
        os.environ.update(overrides)
        with tempfile.TemporaryDirectory(prefix="omr-bench-") as tmp:
            os.environ["STORAGE_ROOT"] = tmp
            config.get_settings.cache_clear()
            recognizer = engines.create_engine()
            print(f"== {name}: nạp model {config.get_settings().model_id} ...")
            recognizer.load()
            if not recognizer.model_loaded:
                raise SystemExit(f"Không nạp được model: {recognizer.error}")
            for case in cases:
                if not case.get("input") or not (source_root / case["input"]).is_file():
                    continue
                score_id = f"bench-{case['id']}"
                dest = Path(tmp) / "scores" / score_id / "original" / Path(case["input"]).name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(source_root / case["input"], dest)
                kind = "PDF" if dest.suffix.lower() == ".pdf" else "IMAGE"
                job = JobRequest(
                    taskId=str(uuid.uuid4()), scoreId=score_id,
                    inputs=[{"path": f"scores/{score_id}/original/{dest.name}", "kind": kind,
                             "page": None if kind == "PDF" else 1}],
                    options={"sourceType": case.get("sourceType", "PHOTO"), "stopAfter": "EXPORT",
                             "musicXmlVersion": 1},
                )
                callback = RecordingCallback()
                started = time.monotonic()
                run_omr_job(job, threading.Event(), callback, recognizer=recognizer)  # type: ignore[arg-type]
                seconds = time.monotonic() - started
                rows.append(_score_run(case, name, Path(tmp) / "scores" / score_id, callback, seconds))
                print(json.dumps(rows[-1], ensure_ascii=False)[:400])
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    if original_storage is None:
        os.environ.pop("STORAGE_ROOT", None)
    else:
        os.environ["STORAGE_ROOT"] = original_storage
    config.get_settings.cache_clear()
    _print_music(rows)
    return {"mode": "run", "rows": rows}


def _score_run(case: dict, variant: str, folder: Path, callback: RecordingCallback, seconds: float) -> dict:
    ends = [body for kind, body in callback.calls if kind in ("complete", "fail")]
    end = ends[-1] if ends else {}
    result = end.get("resultData", {})
    row: dict = {
        "case": case["id"], "variant": variant, "status": "FAILED" if "errorCode" in end else "COMPLETED",
        "error": end.get("errorCode"), "seconds": round(seconds, 1),
        "secondsPerPage": round(seconds / max(1, result.get("pageCount", 1)), 1),
        "maxRssMb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 0),
        "warnings": len(result.get("warnings", [])),
    }
    gt = case.get("groundTruth", {})
    if gt.get("music"):
        ref = load_score(BENCH / gt["music"])
        kern = folder / "kern" / "merged.krn"
        xml = folder / "musicxml" / "v1.musicxml"
        if xml.is_file():
            hyp = read_musicxml(xml.read_bytes())
            res = compare(ref, hyp)
            row.update({k: v for k, v in res.to_dict().items() if k in MUSIC_KEYS})
            row["output"] = "musicxml"
            if gt_lyrics(case):
                lyr = compare_lyrics(gt_lyrics(case) or [], hyp.lyrics, res.measure_pairs).to_dict()
                row.update({"lyricsAlignment": lyr["alignmentAccuracy"], "lyricsCer": lyr["cer"],
                            "lyricsWer": lyr["wer"]})
        elif kern.is_file():
            row.update({k: v for k, v in compare(ref, load_score(kern)).to_dict().items() if k in MUSIC_KEYS})
            row["output"] = "kern"
    return row


# ====================================================================== in kết quả


def _print_music(rows: list[dict]) -> None:
    rows = [r for r in rows if "noteF1" in r]
    if not rows:
        return
    head = ["case", "run/variant", "output"] + list(MUSIC_KEYS)
    print("\n" + " | ".join(head))
    for r in rows:
        values = [r["case"], r.get("run") or r.get("variant", ""), r.get("output", "")]
        values += ["-" if r.get(k) is None else f"{r[k]:.3f}" for k in MUSIC_KEYS]
        print(" | ".join(values))


def _write(report: dict) -> Path:
    out_dir = BENCH / "results"
    out_dir.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = out_dir / f"{report['mode']}-{stamp}.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    lines = [f"# Benchmark {report['mode']} {stamp}", ""]
    rows = report.get("rows", [])
    if rows:
        keys = list(dict.fromkeys(k for r in rows for k in r))
        lines.append("| " + " | ".join(keys) + " |")
        lines.append("|" + "---|" * len(keys))
        for r in rows:
            lines.append("| " + " | ".join(str(r.get(k, "")) for k in keys) + " |")
    path.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=["stored", "lyrics", "run"])
    parser.add_argument("--cases", type=Path, default=BENCH / "cases.json")
    parser.add_argument("--only", action="append", help="chỉ chạy case có id này (lặp lại được)")
    parser.add_argument("--variant", action="append", default=[], help="tên:BIẾN=GIÁ_TRỊ,... (chế độ run)")
    parser.add_argument("--no-save", action="store_true")
    args = parser.parse_args()
    cases = load_cases(args.cases)
    if args.only:
        cases = [c for c in cases if c["id"] in args.only]
    if args.mode == "stored":
        report = cmd_stored(cases)
    elif args.mode == "lyrics":
        report = cmd_lyrics(cases)
    else:
        report = cmd_run(cases, args.variant)
    if not args.no_save:
        print(f"\nĐã ghi {_write(report)}")


if __name__ == "__main__":
    main()
