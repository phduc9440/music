"""Mô hình Markov ẩn cho gợi ý hợp âm (spec R3 mục 5.4–5.6).

- Trạng thái ẩn: hợp âm (theo bậc) trong từ vựng của phong cách và giọng (trưởng / thứ).
- Quan sát: các nốt giai điệu của một bước. Điểm phát = Σ trọng số · log P(bậc của nốt trong giọng | hợp âm), mỗi trạng
  thái một bảng 12 số (định dạng v2); trọng số = trường độ, nhân ``STRONG_BEAT_WEIGHT`` nếu nốt bắt đầu đúng đầu bước.
- Tham số (xác suất bắt đầu, kết thúc, chuyển, phát) học sẵn bằng ``training/chords/train.py``, lưu ở
  ``app/chords/model/{style}.json`` (log xác suất).
- Viterbi tìm dãy trạng thái có tổng log xác suất lớn nhất; hòa điểm thì lấy chỉ số nhỏ hơn nên kết quả tất định.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np

from app.chords.melody import Step
from app.chords.theory import VOCAB, ChordDef, Key

STRONG_BEAT_WEIGHT = 1.5
MODEL_VERSION = 2
MODEL_DIR = Path(__file__).parent / "model"


@dataclass
class ModeModel:
    states: list[ChordDef]
    log_start: np.ndarray
    log_end: np.ndarray
    log_trans: np.ndarray
    log_emit: np.ndarray  # [S, 12]: log P(bậc của nốt so với chủ âm | trạng thái)


@dataclass
class StyleModel:
    style: str
    major: ModeModel
    minor: ModeModel

    def mode(self, mode: str) -> ModeModel:
        return self.major if mode == "major" else self.minor


def load_model(style: str, path: Optional[Path] = None) -> StyleModel:
    style = style.upper()
    return _load(style, str(path or MODEL_DIR / f"{style.lower()}.json"))


@lru_cache(maxsize=16)
def _load(style: str, path: str) -> StyleModel:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if style not in VOCAB:
        raise ValueError(f"Phong cách không hỗ trợ: {style}")
    if data.get("version") != MODEL_VERSION:
        raise ValueError(f"Bảng xác suất phải là phiên bản {MODEL_VERSION}, hãy huấn luyện lại (training/chords/train.py)")
    modes = {mode: _mode(style, mode, data[mode]) for mode in ("major", "minor")}
    return StyleModel(style=style, major=modes["major"], minor=modes["minor"])


def _mode(style: str, mode: str, data: dict) -> ModeModel:
    vocab = {c.label: c for c in VOCAB[style][mode]}
    unknown = [label for label in data["states"] if label not in vocab]
    if unknown:
        raise ValueError(f"Trạng thái không có trong từ vựng {style}/{mode}: {unknown}")
    states = [vocab[label] for label in data["states"]]
    size = len(states)
    emission = np.asarray(data.get("emission", []), dtype=float)
    if emission.shape != (size, 12):
        raise ValueError(f"Bảng phát {mode} phải có {size} hàng × 12 cột")
    start = np.asarray(data["start"], dtype=float)
    end = np.asarray(data["end"], dtype=float)
    trans = np.asarray(data["trans"], dtype=float)
    if start.shape != (size,) or end.shape != (size,) or trans.shape != (size, size):
        raise ValueError(f"Kích thước bảng {mode} không khớp số trạng thái ({size})")
    return ModeModel(states=states, log_start=start, log_end=end, log_trans=trans, log_emit=emission)


def emission_matrix(steps: list[Step], log_emit: np.ndarray, key: Key) -> np.ndarray:
    """Điểm phát [số bước, số trạng thái] từ bảng theo bậc ``log_emit`` [S, 12] của một giọng."""
    out = np.zeros((len(steps), log_emit.shape[0]))
    for t, step in enumerate(steps):
        for note in step.notes:
            weight = float(note.length) * (STRONG_BEAT_WEIGHT if note.start == step.start else 1.0)
            out[t] += weight * log_emit[:, (note.midi - key.tonic) % 12]
    return out


def viterbi(
    log_start: np.ndarray,
    log_trans: np.ndarray,
    log_end: np.ndarray,
    log_emit_ts: np.ndarray,
    allowed: list[Optional[int]],
) -> list[int]:
    steps, size = log_emit_ts.shape if log_emit_ts.ndim == 2 else (0, len(log_start))
    if steps == 0:
        return []

    def mask(t: int, scores: np.ndarray) -> np.ndarray:
        if allowed[t] is None:
            return scores
        only = np.full(size, -np.inf)
        only[allowed[t]] = scores[allowed[t]]
        return only

    score = mask(0, log_start + log_emit_ts[0])
    back = np.zeros((steps, size), dtype=int)
    for t in range(1, steps):
        candidates = score[:, None] + log_trans  # [từ, đến]
        back[t] = np.argmax(candidates, axis=0)  # hòa điểm: argmax lấy chỉ số đầu
        score = mask(t, candidates[back[t], np.arange(size)] + log_emit_ts[t])
    score = score + log_end
    path = [int(np.argmax(score))]
    for t in range(steps - 1, 0, -1):
        path.append(int(back[t, path[-1]]))
    return path[::-1]
