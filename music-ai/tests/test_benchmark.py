"""Script benchmark (scripts/omr_benchmark.py): chế độ stored và run chạy được với engine giả, chấm đúng."""

import importlib.util
import sys
from pathlib import Path

import cv2

from app import config
from app.omr import engines
from tests.fake_recognizer import FakeRecognizer
from tests.test_lyrics import melody_page_with_lyrics

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("omr_benchmark", ROOT / "scripts" / "omr_benchmark.py")
bench = importlib.util.module_from_spec(spec)
sys.modules["omr_benchmark"] = bench
spec.loader.exec_module(bench)

GT = "**kern\n*clefG2\n*k[b-]\n*M3/4\n2f\n4g\n=1\n2f\n4g\n=2\n2f\n4g\n==\n*-\n"


def write_case(tmp_path, storage_root):
    gt_dir = tmp_path / "bench" / "gt"
    gt_dir.mkdir(parents=True)
    (gt_dir / "x.krn").write_text(GT)
    page, _ = melody_page_with_lyrics()
    rel = "scores/src/original/01-x.png"
    (storage_root / rel).parent.mkdir(parents=True)
    cv2.imwrite(str(storage_root / rel), page)
    run_dir = storage_root / "scores" / "old-run" / "kern"
    run_dir.mkdir(parents=True)
    # kết quả "cũ" đọc lặp một ô
    (run_dir / "page-001.krn").write_text("*clefG2\n*k[b-]\n*M3/4\n2f\n4g\n=\n2f\n4g\n=\n2f\n4g\n=\n2f\n4g\n=\n")
    return [{"id": "x", "input": rel, "sourceType": "PHOTO", "groundTruth": {"music": "gt/x.krn"},
             "storedRuns": ["old-run"]}], tmp_path / "bench"


def test_stored_mode_scores_saved_runs(tmp_path, storage_root, monkeypatch):
    cases, bench_dir = write_case(tmp_path, storage_root)
    monkeypatch.setattr(bench, "BENCH", bench_dir)
    report = bench.cmd_stored(cases)
    row = report["rows"][0]
    assert row["noteRecall"] == 1.0 and row["notePrecision"] < 1.0 and row["counts"]["extraMeasures"] == 1


def test_run_mode_with_fake_engine(tmp_path, storage_root, monkeypatch):
    cases, bench_dir = write_case(tmp_path, storage_root)
    monkeypatch.setattr(bench, "BENCH", bench_dir)
    monkeypatch.setattr(bench, "storage_root", lambda: storage_root)

    class Engine(FakeRecognizer):
        model_loaded = True
        error = None

        def load(self):
            pass

    monkeypatch.setattr(engines, "create_engine", lambda *a, **k: Engine(["*clefG2\n*k[b-]\n*M3/4\n2f\n4g\n=\n2f\n4g\n=\n2f\n4g\n="]))
    report = bench.cmd_run(cases, ["moi:OMR_LYRICS=off"])
    row = report["rows"][0]
    assert row["variant"] == "moi"
    # Không có music21 thì bước xuất báo lỗi nhưng kern vẫn được chấm
    assert row["status"] in ("COMPLETED", "FAILED")
    assert row["noteF1"] == 1.0
    config.get_settings.cache_clear()
