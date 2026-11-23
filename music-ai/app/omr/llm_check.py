"""Lớp AI xác minh các ô nhịp còn nghi ngờ (``OMR_LLM``, mặc định ``off``).

Không gửi cả trang cho AI (đắt, chậm). Chỉ gửi **ảnh cắt một ô** (kèm một phần ô hai bên làm ngữ cảnh) của các ô có độ
tin cậy thấp nhất, cùng hóa biểu, số chỉ nhịp và các cách đọc Transcoda đã đưa ra (bản gốc + các lần đọc lại khác nhau,
:mod:`app.omr.stability`). AI chỉ phải **chọn** cách đọc đúng hoặc nói ô sai ở đâu: ít token ra, ít "bịa".

Kiểm soát chi phí:

* ``OMR_LLM_MAX_MEASURES`` (mặc định 10): trần số ô gửi AI mỗi job; ô tin cậy thấp nhất trước.
* Cache theo hash (model + câu hỏi + ảnh) trong ``{storage}/cache/llm/``: nhận diện lại cùng bản không tốn thêm.
* Phần hướng dẫn cố định gửi kèm ``cache_control`` (prompt caching của Anthropic).
* Kết quả AI vẫn phải qua kiểm tra trường độ; không hợp lệ thì không thay.
* Mọi lần gọi được đếm vào ``measureCheck.review.ai`` (số lần gọi, token vào/ra) để tính chi phí thật mỗi trang.

Kết quả: ``confirmed`` (AI xác nhận bản gốc đúng, cộng điểm tin cậy), ``replaced`` (thay bằng cách đọc AI chọn),
``doubt`` (thêm cờ ``AI_DOUBT`` và lý do), ``unsure`` (không đổi gì).
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

from app.omr import merge, review
from app.omr.merge import TAB

log = logging.getLogger(__name__)

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"

SYSTEM_PROMPT = """You check optical music recognition (OMR) results for ONE measure of printed or handwritten sheet music.
You get an image of the measure (with a little of its neighbours for context; the target measure is between the two red
vertical marks) and one or more candidate readings. Lyrics and chord names may be printed near the staff: ignore them,
they are not notes. Count staff lines and ledger lines carefully; most OMR errors are a note one line/space or one octave
off, a wrong accidental, a missing/extra note, or a wrong duration.
Answer ONLY with a JSON object, no prose:
{"verdict": "candidate" | "none" | "unsure", "choice": <index of the correct candidate or null>,
 "issue": "<if verdict is none: where and what is wrong, in Vietnamese, max 25 words; else empty>"}
Use "candidate" only if one candidate matches the image exactly (pitches, accidentals, durations, rests)."""

Client = Callable[[bytes, str], tuple[str, dict]]
"""``client(ảnh_png, câu_hỏi)`` -> ``(văn_bản_trả_lời, usage)``; usage có ``input_tokens``/``output_tokens``."""


class LlmError(Exception):
    pass


def anthropic_client(model: str, api_key: str, timeout_s: float = 30.0) -> Client:
    """Client gọi Messages API của Anthropic bằng thư viện chuẩn (không thêm phụ thuộc)."""

    def call(image_png: bytes, prompt: str) -> tuple[str, dict]:
        body = {
            "model": model,
            "max_tokens": 200,
            "system": [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": base64.b64encode(image_png).decode("ascii"),
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        }
        request = urllib.request.Request(
            API_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "x-api-key": api_key,
                "anthropic-version": API_VERSION,
                "content-type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_s) as response:  # noqa: S310 - URL cố định
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise LlmError(f"HTTP {exc.code}: {exc.read()[:200]!r}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise LlmError(str(exc)) from exc
        text = "".join(part.get("text", "") for part in data.get("content", []) if part.get("type") == "text")
        return text, data.get("usage", {})

    return call


@dataclass
class LlmReport:
    model: str = ""
    calls: int = 0
    cached: int = 0
    errors: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    confirmed: int = 0
    replaced: int = 0
    doubt: int = 0
    unsure: int = 0
    skipped: Optional[str] = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        data = {
            "model": self.model,
            "calls": self.calls,
            "cached": self.cached,
            "errors": self.errors,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "confirmed": self.confirmed,
            "replaced": self.replaced,
            "doubt": self.doubt,
            "unsure": self.unsure,
        }
        if self.skipped:
            data["skipped"] = self.skipped
        return data


def crop_measure(gray: np.ndarray, box: list[int], context: float = 0.35) -> Optional[np.ndarray]:
    """Cắt ô (kèm ``context`` bề rộng ô mỗi bên) và vẽ hai vạch đỏ đánh dấu mép ô. Trả ảnh BGR."""
    x0, y0, x1, y1 = (int(v) for v in box)
    height, width = gray.shape[:2]
    if x1 <= x0 or y1 <= y0:
        return None
    pad = int((x1 - x0) * context)
    cx0, cx1 = max(0, x0 - pad), min(width, x1 + pad)
    cy0, cy1 = max(0, y0), min(height, y1)
    crop = cv2.cvtColor(gray[cy0:cy1, cx0:cx1], cv2.COLOR_GRAY2BGR)
    for x in (x0 - cx0, x1 - cx0):
        cv2.line(crop, (x, 0), (x, 6), (0, 0, 255), 2)
        cv2.line(crop, (x, crop.shape[0] - 7), (x, crop.shape[0] - 1), (0, 0, 255), 2)
    # Ảnh trang ~8 px/khoảng dòng kẻ: phóng 2 lần cho AI đếm dòng kẻ dễ hơn (vẫn chỉ vài trăm px)
    return cv2.resize(crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)


def build_prompt(
    piece: review.MeasureSlice,
    candidates: list[list[str]],
    spines: int,
    roles_top_down: Optional[list[str]],
) -> str:
    roles = list(reversed(roles_top_down)) if roles_top_down and len(roles_top_down) == spines else None
    keys = []
    for index in range(spines - 1, -1, -1):
        sig = piece.keysigs[index] if index < len(piece.keysigs) else {}
        names = [f"{k.upper()}{'#' if v > 0 else 'b'}" for k, v in sig.items()]
        clef = (piece.clefs[index] or "").replace("*clef", "") or "?"
        keys.append(f"staff {spines - index}: clef {clef}, key signature [{' '.join(names) or 'none'}]")
    meter = f"{piece.meter.numerator}/{piece.meter.denominator}" if piece.meter else "unknown"
    lines = [
        f"Measure {piece.ordinal}. Time signature (as a fraction of a whole note): {meter}.",
        "Staves top to bottom: " + "; ".join(keys) + ".",
        "Candidates (staff 1 = top staff):",
    ]
    for number, candidate in enumerate(candidates):
        lines.append(f"[{number}] {review.describe_lines(candidate, spines, roles)}")
    return "\n".join(lines)


def parse_answer(text: str, count: int) -> tuple[str, Optional[int], str]:
    """``(verdict, choice, issue)``; JSON lỗi thì coi là ``unsure``."""
    match = re.search(r"\{.*\}", text, re.S)
    if match is None:
        return "unsure", None, ""
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return "unsure", None, ""
    verdict = str(data.get("verdict", "unsure")).lower()
    choice = data.get("choice")
    issue = str(data.get("issue") or "")[:200]
    if verdict == "candidate":
        if not isinstance(choice, int) or not 0 <= choice < count:
            return "unsure", None, ""
        return "candidate", choice, ""
    if verdict == "none":
        return "none", None, issue
    return "unsure", None, ""


def verify(
    result: merge.MergeResult,
    entries: list[dict],
    page_images: dict[int, np.ndarray],
    client: Client,
    model: str,
    max_measures: int,
    cache_dir: Optional[Path],
    has_time: Callable[[], bool],
    roles_top_down: Optional[list[str]] = None,
) -> tuple[merge.MergeResult, LlmReport]:
    """Hỏi AI về các ô tin cậy thấp nhất (tối đa ``max_measures``), sửa ``entries`` tại chỗ và trả kern có thể đã thay."""
    report = LlmReport(model=model)
    todo = [
        e
        for e in entries
        if e.get("confidence", 1.0) < review.REVIEW_THRESHOLD and e.get("box") and e["page"] in page_images
    ]
    todo.sort(key=lambda e: (e.get("confidence", 1.0), e["measure"]))
    todo = todo[: max(0, max_measures)]
    for entry in todo:
        if not has_time():
            report.skipped = "không đủ thời gian"
            break
        if report.errors >= 2 and report.calls == 0:
            report.skipped = "không gọi được AI"
            break
        slices = {s.ordinal: s for s in review.slice_measures(result)}
        piece = slices.get(entry["measure"])
        if piece is None:
            continue
        original = piece.lines(result)
        candidates = [[line for line in original if merge.is_data_line(line)], *entry.get("_alternatives", [])]
        image = crop_measure(page_images[entry["page"]], entry["box"])
        if image is None:
            continue
        ok, encoded = cv2.imencode(".png", image)
        if not ok:
            continue
        png = encoded.tobytes()
        prompt = build_prompt(piece, candidates, result.spines, roles_top_down)
        text = _cached_call(client, model, png, prompt, cache_dir, report)
        if text is None:
            continue
        verdict, choice, issue = parse_answer(text, len(candidates))
        entry["_ai"] = {"verdict": verdict}
        if verdict == "candidate" and choice == 0:
            entry["_ai"]["verdict"] = "confirmed"
            report.confirmed += 1
            entry.setdefault("_notes", []).append("AI đã đối chiếu ảnh và xác nhận cách đọc này")
            continue
        if verdict == "candidate" and choice is not None:
            chosen = candidates[choice]
            if piece.regular and review.chunk_duration_ok(chosen, result.spines, piece.meter) is not False and all(
                len(line.split(TAB)) == result.spines for line in chosen
            ):
                result = review.replace_measure(result, piece, chosen)
                entry["_ai"]["verdict"] = "replaced"
                entry["flags"] = [f for f in entry.get("flags", []) if f not in (review.FLAG_UNSTABLE, review.FLAG_DURATION)]
                entry.setdefault("_notes", []).append("AI đối chiếu ảnh và chọn một cách đọc lại khác, đã thay")
                report.replaced += 1
                report.notes.append(f"Trang {entry['page']}, ô nhịp {entry['measure']}: đã sửa theo đối chiếu của AI")
                continue
            verdict = "none"
            issue = issue or "Cách đọc AI chọn không khớp số chỉ nhịp"
        if verdict == "none":
            entry["_ai"]["verdict"] = "doubt"
            flags = entry.setdefault("flags", [])
            if review.FLAG_AI_DOUBT not in flags:
                flags.append(review.FLAG_AI_DOUBT)
            entry.setdefault("_notes", []).append(f"AI: {issue}" if issue else "AI cho rằng ô này đọc chưa đúng")
            report.doubt += 1
            continue
        report.unsure += 1
    return result, report


def _cached_call(
    client: Client, model: str, png: bytes, prompt: str, cache_dir: Optional[Path], report: LlmReport
) -> Optional[str]:
    key = hashlib.sha256(model.encode() + b"\0" + prompt.encode() + b"\0" + png).hexdigest()
    path = cache_dir / f"{key}.json" if cache_dir is not None else None
    if path is not None and path.is_file():
        try:
            report.cached += 1
            return json.loads(path.read_text(encoding="utf-8"))["text"]
        except (OSError, ValueError, KeyError):
            report.cached -= 1
    try:
        text, usage = client(png, prompt)
    except LlmError as exc:
        log.warning("Gọi AI xác minh ô nhịp lỗi: %s", exc)
        report.errors += 1
        return None
    report.calls += 1
    report.input_tokens += int(usage.get("input_tokens", 0) or 0) + int(usage.get("cache_read_input_tokens", 0) or 0)
    report.output_tokens += int(usage.get("output_tokens", 0) or 0)
    if path is not None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"text": text}, ensure_ascii=False), encoding="utf-8")
        except OSError as exc:
            log.warning("Không ghi được cache AI: %s", exc)
    return text
