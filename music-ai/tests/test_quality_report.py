"""scripts/omr_quality_report.py: duyệt storage và tổng hợp công sửa sau OMR."""

import importlib.util
from pathlib import Path

from tests.xml_samples import note, part, score

_SPEC = importlib.util.spec_from_file_location(
    "omr_quality_report", Path(__file__).resolve().parents[1] / "scripts" / "omr_quality_report.py"
)
report = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(report)

A = [note("C", 4, 4)]
B = [note("D", 4, 4)]


def write(storage, score_id, version, *measures, omr=True):
    folder = storage / "scores" / score_id
    (folder / "musicxml").mkdir(parents=True, exist_ok=True)
    if omr:
        (folder / "kern").mkdir(exist_ok=True)
    data = score(part("P1", 1, ("G", 2), [list(m) for m in measures], beats=4))
    (folder / "musicxml" / f"v{version}.musicxml").write_bytes(data)


def test_compares_first_and_latest_version_of_omr_scores_only(tmp_path):
    write(tmp_path, "aaaaaaaa-1", 1, A, B, B)  # OMR lặp ô B
    write(tmp_path, "aaaaaaaa-1", 2, A, B, B)
    write(tmp_path, "aaaaaaaa-1", 3, A, B)  # người dùng xóa ô lặp
    write(tmp_path, "bbbbbbbb-2", 1, A)  # chưa ai sửa
    write(tmp_path, "cccccccc-3", 1, A, B, omr=False)  # không phải OMR
    write(tmp_path, "cccccccc-3", 2, A, omr=False)

    rows, skipped = report.collect(tmp_path)

    assert [r["scoreId"] for r in rows] == ["aaaaaaaa-1"]
    row = rows[0]
    assert (row["baseVersion"], row["targetVersion"]) == (1, 3)
    assert row["deleted"] == 1 and row["same"] == 2 and row["measureEditRate"] == round(1 / 3, 4)
    assert len(skipped) == 1 and skipped[0].startswith("bbbbbbbb")


def test_totals_and_files(tmp_path):
    write(tmp_path, "aaaaaaaa-1", 1, A, B, B)
    write(tmp_path, "aaaaaaaa-1", 2, A, B)
    rows, skipped = report.collect(tmp_path)
    total = report.totals(rows)
    assert total["deleted"] == 1 and total["measureEditRate"] == round(1 / 3, 4)

    out = tmp_path / "reports"
    out.mkdir()
    report.write_csv(out / "q.csv", rows)
    report.write_markdown(out / "q.md", rows, skipped)
    assert "scoreId" in (out / "q.csv").read_text(encoding="utf-8").splitlines()[0]
    assert "OMR thừa" in (out / "q.md").read_text(encoding="utf-8")


def test_empty_storage_still_writes_a_report(tmp_path):
    rows, skipped = report.collect(tmp_path)
    assert rows == [] and skipped == []
    report.write_markdown(tmp_path / "q.md", rows, skipped)
    assert (tmp_path / "q.md").exists()
