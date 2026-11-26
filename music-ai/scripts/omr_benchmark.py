"""Benchmark OMR trên bộ kiểm thử cố định ``benchmark/cases.json`` (so model/cấu hình cũ và mới cùng điều kiện).

Chạy từ thư mục music-ai. Ba chế độ:

    # 1. Không cần model: chấm các kết quả Transcoda ĐÃ LƯU trong storage (kern lượt chính và kern cuối cùng)
    python scripts/omr_benchmark.py stored

    # 2. Cần torch + Transcoda: chạy cả pipeline (không gọi Java) cho từng biến thể cấu hình rồi chấm
    python scripts/omr_benchmark.py run --variant cu:OMR_OTTAVA=keep --variant moi: --variant khongxoa:OMR_STRIP_TEXT=0

    # 3. Không cần model: chạy CẢ pipeline trên bản gốc của lần chạy đã lưu, model được thay bằng kern Transcoda đã lưu
    #    của đúng ảnh trang/hệ đó (đo phần ngoài model: bố cục, định tuyến, ghép, sửa lỗi, xuất; thời gian không gồm model)
    python scripts/omr_benchmark.py replay --score 4ef2e6be-2d18-4a84-b089-98f3ddab42cc=gt/dang/score.krn --score b8ffa495-...

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

from app.eval.metrics import compare  # noqa: E402
from app.eval.score import load_score, read_musicxml  # noqa: E402

BENCH = ROOT / "benchmark"
MUSIC_KEYS = ("noteF1", "notePrecision", "noteRecall", "pitchAccuracy", "durationAccuracy", "chordAccuracy",
              "measureExactRate", "ser")


def load_cases(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["cases"]


def storage_root() -> Path:
    from app.config import get_settings  # noqa: PLC0415

    return get_settings().storage_root


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


def read_kind(png_path, num_beams=None) -> str:
    """Loại lượt đọc model theo tên ảnh pipeline đặt: ``page`` (cả trang), ``system`` (một hệ), ``roles`` (riêng giọng hoặc
    riêng piano), ``beam`` (đọc lại bằng beam search), ``tta`` (đọc lại có dịch ảnh), ``other``."""
    import re  # noqa: PLC0415

    path = Path(png_path)
    if num_beams and num_beams > 1:
        return "beam"
    if path.parent.name == "pages":
        return "page"
    if "-tta" in path.name:
        return "tta"
    if re.search(r"-r\d+-", path.name):
        return "roles"
    if path.parent.name == "routing":
        return "system"
    return "other"


class TimedRecognizer:
    """Bọc engine thật để đo từng lượt gọi model theo loại (:func:`read_kind`): số lượt, số giây, số token."""

    def __init__(self, inner) -> None:
        self.inner = inner
        self.calls: list[tuple[str, float, int]] = []

    def __getattr__(self, name):
        return getattr(self.inner, name)

    def wait_ready(self, check, timeout_s):
        return self.inner.wait_ready(check, timeout_s)

    def recognize(self, png_path, check, *args, **kwargs):
        beams = kwargs.get("num_beams", args[0] if args else None)
        started = time.monotonic()
        result = self.inner.recognize(png_path, check, *args, **kwargs)
        self.calls.append((read_kind(png_path, beams), time.monotonic() - started, int(result.tokens or 0)))
        return result

    def summary(self) -> dict:
        by_kind: dict[str, dict] = {}
        for kind, seconds, tokens in self.calls:
            item = by_kind.setdefault(kind, {"calls": 0, "seconds": 0.0, "tokens": 0})
            item["calls"] += 1
            item["seconds"] = round(item["seconds"] + seconds, 2)
            item["tokens"] += tokens
        return {
            "modelCalls": len(self.calls),
            "modelSeconds": round(sum(c[1] for c in self.calls), 2),
            "modelByKind": by_kind,
        }


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
                timed = TimedRecognizer(recognizer)
                started = time.monotonic()
                run_omr_job(job, threading.Event(), callback, recognizer=timed)  # type: ignore[arg-type]
                seconds = time.monotonic() - started
                rows.append(_score_run(case, name, Path(tmp) / "scores" / score_id, callback, seconds))
                rows[-1].update(timed.summary())
                print(json.dumps(rows[-1], ensure_ascii=False)[:600])
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
    _print_timing(rows)
    return {"mode": "run", "rows": rows}


# ====================================================================== 3. phát lại kết quả model đã lưu


class ReplayRecognizer:
    """Engine "phát lại": trả kern Transcoda ĐÃ LƯU của một lần chạy thật thay cho model, để chạy cả pipeline (tiền xử lý,
    bố cục, định tuyến, ghép, sửa cao độ/trường độ, chấm tin cậy, xuất MusicXML/MIDI) mà không cần torch.

    Pipeline đặt tên ảnh gửi model theo quy tắc cố định (``pages/page-NNN.png``, ``routing/page-NNN-sKK[-tag].png``) nên
    lần đọc được tìm theo tên file trong thư mục kết quả cũ; ``-bN.krn`` là lần đọc beam N. Ảnh trang luôn là cùng trang
    (cách nhị phân hóa có thể đã đổi). Ảnh một hệ chỉ được coi là cùng ảnh khi hệ đó trong bố cục mới (``layout/`` của lần
    chạy này) trùng hệ cùng số thứ tự trong bố cục đã lưu của lần chạy cũ: cùng số khuông, mép trên/dưới lệch không quá
    một khoảng dòng kẻ. Lần đọc chưa từng được lưu (đọc lại có dịch ảnh ``tta±N``, hệ mà lần chạy cũ không đọc) hoặc hệ đã
    đổi (``drift``) trả kern rỗng và được đếm vào ``misses``: không bịa kết quả model."""

    def __init__(self, folder: Path) -> None:
        self.folder = folder
        self.hits: list[str] = []
        self.misses: list[str] = []
        self.decoded = 0
        """Tổng số token (tách theo khoảng trắng) của các kern đã phát lại: thước đo thay cho thời gian giải mã của model
        (giải mã tự hồi quy chiếm gần hết thời gian một lần đọc và tỉ lệ gần tuyến tính với số token sinh ra)."""
        self.drift: list[tuple[str, float]] = []

    def wait_ready(self, check, timeout_s: float) -> None:  # noqa: ARG002 - cùng giao diện Recognizer
        return None

    def _stored(self, png_path: Path) -> tuple[Path | None, Path | None]:
        name = png_path.name
        kind = png_path.parent.name
        if kind == "pages":
            return self.folder / "pages" / name, self.folder / "kern" / name.replace(".png", ".krn")
        if kind == "routing":
            return self.folder / "routing" / name, self.folder / "routing" / name.replace(".png", ".krn")
        return None, None

    def recognize(self, png_path, check, num_beams=None, max_measures=None):
        from app.omr.transcoda import BarlineLimit, RecognitionResult  # noqa: PLC0415

        check()
        png_path = Path(png_path)
        _stored_png, krn = self._stored(png_path)
        if krn is not None and num_beams and num_beams > 1:
            beam = krn.with_name(krn.stem + f"-b{num_beams}.krn")
            krn = beam if beam.is_file() else krn
        label = f"{png_path.parent.name}/{png_path.name}" + (f" b{num_beams}" if num_beams else "")
        if krn is None or not krn.is_file():
            self.misses.append(label)
            return RecognitionResult(text="", tokens=0, truncated=False, millis=0)
        if png_path.parent.name == "routing" and not _same_system(png_path, self.folder):
            self.drift.append(label)
            self.misses.append(label)
            return RecognitionResult(text="", tokens=0, truncated=False, millis=0)
        self.hits.append(label)
        text = krn.read_text(encoding="utf-8")
        self.decoded += len(text.split())
        stopped = False
        if max_measures and BarlineLimit(max_measures).exceeded(text):
            lines = text.split("\n")
            bars = [i for i, line in enumerate(lines) if line.startswith("=")]
            text = "\n".join(lines[: bars[max_measures + 1] + 1]) + "\n"
            stopped = True
        return RecognitionResult(text=text, tokens=len(text.split()), truncated=stopped, millis=0,
                                 stopped_early=stopped)


def _same_system(png_path: Path, old_folder: Path) -> bool:
    """Hệ ``sKK`` của ảnh ``routing/page-NNN-sKK*.png`` có cùng vị trí trong bố cục mới và bố cục đã lưu không."""
    import re  # noqa: PLC0415

    match = re.match(r"page-(\d{3})-s(\d{2})", png_path.name)
    if not match:
        return False
    page, index = match.group(1), int(match.group(2)) - 1
    layouts = []
    for folder in (png_path.parent.parent, old_folder):
        path = folder / "layout" / f"page-{page}.json"
        if not path.is_file():
            return False
        layouts.append(json.loads(path.read_text(encoding="utf-8")))
    new, old = layouts
    if index >= len(new.get("systems", [])) or index >= len(old.get("systems", [])):
        return False
    a, b = new["systems"][index], old["systems"][index]
    tolerance = max(float(new.get("interline") or 0), float(old.get("interline") or 0), 4.0)
    return (
        len(a["staves"]) == len(b["staves"])
        and abs(a["top"] - b["top"]) <= tolerance
        and abs(a["bottom"] - b["bottom"]) <= tolerance
    )


def cmd_replay(specs: list[str], variants: list[str], dump: Path | None = None, stored_pages: bool = False) -> dict:
    """Chạy cả pipeline trên bản gốc của các lần chạy đã lưu, với :class:`ReplayRecognizer` thay model.

    ``specs``: ``id_lần_chạy[=đường_dẫn_ground_truth]`` (ground truth tương đối so với ``benchmark/``). ``stored_pages``:
    dùng ảnh trang đã tiền xử lý của lần chạy cũ (``pages/page-NNN.png``) với ``preprocess=false`` thay cho bản gốc, để bố
    cục và ảnh cắt hệ trùng với lúc model thật đọc (tự bật với PDF khi máy không có PyMuPDF)."""
    from app import config  # noqa: PLC0415
    from app.omr.pipeline import run_omr_job  # noqa: PLC0415
    from app.schemas import JobRequest  # noqa: PLC0415

    source_root = storage_root()
    original_storage = os.environ.get("STORAGE_ROOT")
    rows = []
    for spec_variant in variants or ["mặc-định:"]:
        name, _, env_text = spec_variant.partition(":")
        overrides = dict(item.split("=", 1) for item in env_text.split(",") if "=" in item)
        saved = {k: os.environ.get(k) for k in overrides}
        os.environ.update(overrides)
        for spec in specs:
            run_id, _, gt = spec.partition("=")
            folder = source_root / "scores" / run_id
            originals = sorted((folder / "original").glob("*"))
            if not originals:
                print(f"bỏ qua {run_id}: không có bản gốc")
                continue
            with tempfile.TemporaryDirectory(prefix="omr-replay-") as tmp:
                os.environ["STORAGE_ROOT"] = tmp
                config.get_settings.cache_clear()
                score_id = f"replay-{run_id[:8]}"
                inputs = []
                pdf_native = originals[0].suffix.lower() == ".pdf"
                pages_dir = folder / "pages"
                use_stored = (stored_pages or (pdf_native and not _has_pymupdf())) and any(pages_dir.glob("page-*.png"))
                if use_stored:
                    # Ảnh trang ĐÃ tiền xử lý của lần chạy cũ (đúng ảnh model thật đã đọc), không tiền xử lý lại
                    originals = sorted(pages_dir.glob("page-*.png"))
                elif pdf_native and not _has_pymupdf():
                    originals = _render_pdf_pdftoppm(originals[0], Path(tmp) / "rendered")
                for page, src in enumerate(originals, start=1):
                    dest = Path(tmp) / "scores" / score_id / "original" / src.name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy(src, dest)
                    kind = "PDF" if dest.suffix.lower() == ".pdf" else "IMAGE"
                    inputs.append({"path": f"scores/{score_id}/original/{dest.name}", "kind": kind,
                                   "page": None if kind == "PDF" else page})
                kind = inputs[0]["kind"]
                job = JobRequest(
                    taskId=str(uuid.uuid4()), scoreId=score_id, inputs=inputs,
                    options={"sourceType": "PDF_NATIVE" if pdf_native else "PHOTO", "stopAfter": "EXPORT",
                             "musicXmlVersion": 1, "preprocess": not use_stored},
                )
                recognizer = ReplayRecognizer(folder)
                callback = RecordingCallback()
                started = time.monotonic()
                run_omr_job(job, threading.Event(), callback, recognizer=recognizer)  # type: ignore[arg-type]
                seconds = time.monotonic() - started
                case = {"id": run_id[:8], "groundTruth": {"music": gt} if gt else {}}
                row = _score_run(case, name, Path(tmp) / "scores" / score_id, callback, seconds)
                row.update(_replay_details(Path(tmp) / "scores" / score_id, callback, recognizer))
                rows.append(row)
                if dump is not None:
                    target = dump / f"{name}-{run_id[:8]}"
                    shutil.rmtree(target, ignore_errors=True)
                    shutil.copytree(Path(tmp) / "scores" / score_id, target)
                    (target / "callbacks.json").write_text(
                        json.dumps(callback.calls, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
                print(json.dumps({k: v for k, v in row.items() if k not in ("warningTexts", "routing")},
                                 ensure_ascii=False))
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
    return {"mode": "replay", "rows": rows}


def _has_pymupdf() -> bool:
    try:
        import fitz  # noqa: F401, PLC0415
    except ImportError:
        try:
            import pymupdf  # noqa: F401, PLC0415
        except ImportError:
            return False
    return True


def _render_pdf_pdftoppm(pdf: Path, out_dir: Path) -> list[Path]:
    """Chỉ dùng khi máy chạy benchmark không có PyMuPDF: vẽ PDF bằng ``pdftoppm`` (poppler) ở cùng 300 DPI xám như
    :func:`app.omr.pdf.render_page_gray`, rồi đưa từng trang vào pipeline như ảnh (sourceType vẫn là PDF_NATIVE)."""
    import subprocess  # noqa: PLC0415

    from app.config import get_settings  # noqa: PLC0415

    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(["pdftoppm", "-r", str(get_settings().pdf_dpi), "-gray", "-png", str(pdf), str(out_dir / "page")],
                   check=True)
    return sorted(out_dir.glob("page-*.png"))


def _replay_details(folder: Path, callback: RecordingCallback, recognizer: ReplayRecognizer) -> dict:
    """Số liệu không cần ground truth: số ô kern so với số ô đếm trên ảnh, ô tin cậy thấp, cờ, lần đọc phát lại được."""
    ends = [body for kind, body in callback.calls if kind in ("complete", "fail")]
    result = (ends[-1] if ends else {}).get("resultData", {}) or {}
    meta = (ends[-1] if ends else {}).get("scoreMetadata") or {}
    measures = result.get("measureMap") or []
    flags: dict[str, int] = {}
    for m in measures:
        for flag in m.get("flags", []) or []:
            flags[flag] = flags.get(flag, 0) + 1
    layout_bars = 0
    for path in sorted((folder / "layout").glob("page-*.json")):
        layout_bars += sum(int(s.get("measures") or 0) for s in json.loads(path.read_text()).get("systems", []))
    return {
        "kernMeasures": meta.get("measureCount"),
        "imageMeasures": layout_bars,
        "lowConfidence": sum(1 for m in measures if (m.get("confidence") if m.get("confidence") is not None else 1.0) < 0.8),
        "flags": flags,
        "modelCalls": len(recognizer.hits) + len(recognizer.misses),
        "decodedTokens": recognizer.decoded,
        "replayHits": len(recognizer.hits),
        "replayMisses": len(recognizer.misses),
        "replayDrift": len(recognizer.drift),
        "replayMissed": recognizer.misses,
        "replayReads": recognizer.hits,
    }


def _peak_rss_mb() -> float:
    """RAM đỉnh của cả tiến trình (MB). ``ru_maxrss`` tính bằng byte trên macOS, KB trên Linux. Chỉ tăng, nên các biến thể
    chạy nối tiếp trong một tiến trình không so sánh RAM với nhau được."""
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(peak / (1024 * 1024 if sys.platform == "darwin" else 1024), 0)


def _top_staves(score, staves: int):
    """Ground truth chỉ chép ``staves`` khuông trên cùng (ví dụ chỉ bè giọng của bản giọng hát + piano): chỉ chấm các khuông
    đó của kết quả (khuông đánh số từ trên xuống, bắt đầu 1)."""
    if score.staves <= staves:
        return score
    from dataclasses import replace  # noqa: PLC0415

    return replace(score, staves=staves, events=[e for e in score.events if e.staff <= staves])


def _score_run(case: dict, variant: str, folder: Path, callback: RecordingCallback, seconds: float) -> dict:
    ends = [body for kind, body in callback.calls if kind in ("complete", "fail")]
    end = ends[-1] if ends else {}
    result = end.get("resultData", {})
    row: dict = {
        "case": case["id"], "variant": variant, "status": "FAILED" if "errorCode" in end else "COMPLETED",
        "error": end.get("errorCode"), "seconds": round(seconds, 1),
        "secondsPerPage": round(seconds / max(1, result.get("pageCount", 1)), 1),
        "maxRssMb": _peak_rss_mb(),
        "warnings": len(result.get("warnings", [])),
        "warningTexts": [str(w) for w in result.get("warnings", [])],
        "routing": (result.get("routing") or {}).get("pages"),
    }
    gt = case.get("groundTruth", {})
    if gt.get("music"):
        ref = load_score(BENCH / gt["music"])
        kern = folder / "kern" / "merged.krn"
        xml = folder / "musicxml" / "v1.musicxml"
        if xml.is_file():
            hyp = _top_staves(read_musicxml(xml.read_bytes()), ref.staves)
            res = compare(ref, hyp)
            row.update({k: v for k, v in res.to_dict().items() if k in MUSIC_KEYS})
            row["output"] = "musicxml"
        elif kern.is_file():
            hyp = _top_staves(load_score(kern), ref.staves)
            row.update({k: v for k, v in compare(ref, hyp).to_dict().items() if k in MUSIC_KEYS})
            row["output"] = "kern"
    return row


# ====================================================================== in kết quả


def _print_timing(rows: list[dict]) -> None:
    rows = [r for r in rows if "modelCalls" in r]
    if not rows:
        return
    print("\ncase | variant | tổng giây | giây model | lượt gọi | theo loại (lượt/giây)")
    for r in rows:
        kinds = ", ".join(
            f"{k} {v['calls']}/{v['seconds']:.0f}s" for k, v in sorted((r.get("modelByKind") or {}).items())
        )
        print(f"{r['case']} | {r.get('variant', '')} | {r['seconds']} | {r.get('modelSeconds', '-')} | "
              f"{r['modelCalls']} | {kinds}")


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
    parser.add_argument("mode", choices=["stored", "run", "replay"])
    parser.add_argument("--cases", type=Path, default=BENCH / "cases.json")
    parser.add_argument("--only", action="append", help="chỉ chạy case có id này (lặp lại được)")
    parser.add_argument("--variant", action="append", default=[], help="tên:BIẾN=GIÁ_TRỊ,... (chế độ run)")
    parser.add_argument("--no-save", action="store_true")
    parser.add_argument("--score", action="append", default=[],
                        help="(chế độ replay) id_lần_chạy[=ground_truth.krn tương đối so với benchmark/], lặp lại được")
    parser.add_argument("--stored-pages", action="store_true", help="(chế độ replay) dùng ảnh trang đã tiền xử lý của "
                        "lần chạy cũ thay cho bản gốc (tự bật với PDF khi không có PyMuPDF)")
    parser.add_argument("--dump", type=Path, help="(chế độ replay) chép kết quả từng lần chạy (kern, MusicXML, bố cục, "
                        "callback) vào thư mục này để xem lại")
    args = parser.parse_args()
    cases = load_cases(args.cases)
    if args.only:
        cases = [c for c in cases if c["id"] in args.only]
    if args.mode == "stored":
        report = cmd_stored(cases)
    elif args.mode == "replay":
        report = cmd_replay(args.score, args.variant, args.dump, args.stored_pages)
    else:
        report = cmd_run(cases, args.variant)
    if not args.no_save:
        print(f"\nĐã ghi {_write(report)}")


if __name__ == "__main__":
    main()
