"""So kết quả Transcoda với các engine khác theo từng ô nhịp (trọng tài), sửa ``measureMap`` và kern tại chỗ.

Với mỗi trang mà engine khác đọc ra đúng số ô như Transcoda (không đúng thì không biết ô nào ứng với ô nào, bỏ qua trang),
từng ô được xử lý như sau:

* hai bên giống nhau (cao độ + trường độ, bỏ qua dầm/luyến): ghi ``_agree`` (cộng điểm tin cậy như đọc lại ổn định);
* Transcoda sai tổng trường độ, engine khác đúng: **thay** ô bằng cách đọc của engine khác, ghi chỗ đã tự sửa
  (``AUTO_FIXED``), giữ cách đọc cũ làm phương án cho AI xác minh;
* cả hai đều đúng trường độ nhưng khác nhau: gắn cờ ``ENGINE_DISAGREE`` (cần kiểm tra) và thêm cách đọc kia vào
  ``_alternatives`` để AI xác minh (nếu bật) chọn;
* engine khác sai trường độ: chỉ thêm làm phương án, không gắn cờ.

Chỉ thay ô "thường" (không tách/gộp spine) và khi cách đọc kia chuyển được sang kern (mỗi khuông một bè, xem
:mod:`app.omr.musicxml_measures`).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.omr import merge, review
from app.omr.extra_engines import EngineRun
from app.omr.musicxml_measures import to_kern_lines

FLAG_ENGINE = "ENGINE_DISAGREE"


@dataclass
class ArbiterReport:
    compared: int = 0
    agreed: int = 0
    replaced: int = 0
    disagreed: int = 0
    skipped_pages: list[str] = field(default_factory=list)
    engines: dict[str, dict] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    measures: list[int] = field(default_factory=list)
    """Số thứ tự các ô đã thay."""

    def to_dict(self) -> dict:
        return {
            "compared": self.compared,
            "agreed": self.agreed,
            "replaced": self.replaced,
            "disagreed": self.disagreed,
            "skippedPages": self.skipped_pages,
            "engines": self.engines,
        }


def replaced_message(page: int, measure: int, engine: str) -> str:
    return f"Trang {page}, ô nhịp {measure}: đã thay theo engine {engine} (máy chính đọc sai trường độ)"


def consult(
    result: merge.MergeResult, entries: list[dict], runs: list[EngineRun]
) -> tuple[merge.MergeResult, ArbiterReport]:
    """Đối chiếu ``result`` với các lần chạy engine khác (mỗi lần một trang). Sửa ``entries`` tại chỗ, trả kern mới."""
    report = ArbiterReport()
    by_measure = {e["measure"]: e for e in entries}
    ranges = {r["page"]: r for r in merge.page_measure_ranges(result)}
    for run in runs:
        stats = report.engines.setdefault(run.engine, {"pages": 0, "seconds": 0.0, "errors": []})
        stats["pages"] += 1
        stats["seconds"] = round(stats["seconds"] + run.seconds, 1)
        if run.error:
            stats["errors"].append(f"trang {run.page}: {run.error}")
            continue
        span = ranges.get(run.page)
        if span is None:
            continue
        first, last = span["firstMeasure"], span["lastMeasure"]
        if len(run.measures) != last - first + 1:
            report.skipped_pages.append(
                f"trang {run.page}, {run.engine}: {len(run.measures)} ô, máy chính {last - first + 1} ô"
            )
            continue
        for offset, theirs in enumerate(run.measures):
            ordinal = first + offset
            entry = by_measure.get(ordinal)
            slices = {s.ordinal: s for s in review.slice_measures(result)}
            piece = slices.get(ordinal)
            if entry is None or piece is None or not piece.regular:
                continue
            other = to_kern_lines(theirs, result.spines)
            if other is None:
                continue
            report.compared += 1
            mine = [line for line in piece.lines(result) if merge.is_data_line(line)]
            if review.normalize_lines(mine) == review.normalize_lines(other):
                entry.setdefault("_agree", []).append(run.engine)
                report.agreed += 1
                continue
            lenient = ordinal == 1 or (ordinal == last and run.page == max(ranges))  # ô lấy đà, ô cuối bài
            mine_ok = review.chunk_duration_ok(mine, result.spines, piece.meter, lenient=lenient) is True
            other_ok = review.chunk_duration_ok(other, result.spines, piece.meter, lenient=lenient) is True
            alternatives = entry.setdefault("_alternatives", [])
            if not mine_ok and other_ok:
                result = review.replace_measure(result, piece, other)
                alternatives.append(mine)
                entry["_replaced"] = True
                entry["flags"] = [f for f in entry.get("flags", []) if f != review.FLAG_DURATION]
                entry.setdefault("_notes", []).append(
                    f"Máy chính đọc sai trường độ, đã thay theo cách đọc của engine {run.engine}"
                )
                report.replaced += 1
                report.measures.append(ordinal)
                report.notes.append(replaced_message(run.page, ordinal, run.engine))
                continue
            alternatives.append(other)
            if other_ok and mine_ok:
                flags = entry.setdefault("flags", [])
                if FLAG_ENGINE not in flags:
                    flags.append(FLAG_ENGINE)
                entry.setdefault("_notes", []).append(
                    f"Engine {run.engine} đọc ô này khác: {review.describe_lines(other, result.spines)}"
                )
                report.disagreed += 1
    return result, report
