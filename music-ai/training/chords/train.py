"""Huấn luyện bảng xác suất HMM gợi ý hợp âm (spec R3 mục 5.4) và ghi ``app/chords/model/{pop,ballad,jazz}.json``.

Chạy (từ thư mục music-ai)::

    python -m training.chords.train --pop909 training/chords/data/pop909/POP909-Dataset-master \
        --irb training/chords/data/irealpro --out app/chords/model

- Pop: chuyển và phát đếm từ POP909.
- Ballad: bảng chuyển của Pop (đếm trên từ vựng Ballad), cột của hợp âm màu được nhân ``BALLAD_COLOR_BOOST`` rồi chuẩn hóa.
- Jazz: chuyển đếm từ iRb (chỉ có hợp âm), phát học từ POP909 (nhãn rút về từ vựng Jazz) cộng thêm ``JAZZ_EXTENSION``
  cho nốt 9, 11, 13.
- Phát (định dạng v2): mỗi hợp âm theo bậc một bảng P(bậc của nốt | hợp âm), làm mượt về bảng theo loại hợp âm.

Bài trong ``test_split.txt`` bị loại khỏi huấn luyện để ``scripts/chord_eval.py`` đánh giá công bằng.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Iterable, Optional

import numpy as np

from app.chords.theory import QUALITIES, VOCAB
from training.chords.corpus import Song, label_to_state, parse_label, read_irb, read_pop909

DEFAULT_K = 0.5
END_TONIC_BONUS = 2.0  # số đếm cộng thêm cho trạng thái chủ âm ở cuối bài (câu kết)
JAZZ_EXTENSION = 0.02
EMISSION_BACKOFF = 4.0  # trọng số (tính bằng phách) của bảng theo loại hợp âm khi làm mượt bảng theo trạng thái
JAZZ_EXTENSION_INTERVALS = (2, 5, 9)  # nốt 9, 11, 13 so với gốc
TEST_SPLIT_FILE = Path(__file__).parent / "test_split.txt"
TEST_FRACTION = 0.1
SPLIT_SEED = 42

# Nhãn hợp âm màu của Ballad → hệ số nhân xác suất đi vào (chọn tay, xem spec 5.5)
BALLAD_COLOR_BOOST: dict[str, float] = {
    "Imaj7": 2.0,
    "IVmaj7": 2.0,
    "ii7": 1.6,
    "vi7": 1.6,
    "Vsus4": 1.5,
    "I/3": 1.5,
    "V/7": 1.5,
    "i7": 1.6,
    "iv7": 1.6,
    "bVImaj7": 1.8,
}


def _log_normalize(counts: np.ndarray, k: float) -> np.ndarray:
    smoothed = counts + k
    return np.log(smoothed / smoothed.sum(axis=-1, keepdims=True))


def _round(values: np.ndarray) -> list:
    return np.round(values, 6).tolist()


def count_transitions(songs: Iterable[Song], style: str, k: float = DEFAULT_K, boost: bool = True) -> dict:
    out = {}
    songs = list(songs)
    for mode in ("major", "minor"):
        states = VOCAB[style][mode]
        size = len(states)
        start, end, trans = np.zeros(size), np.zeros(size), np.zeros((size, size))
        tonic = next(i for i, c in enumerate(states) if c.root == 0 and c.bass is None)
        for song in songs:
            if song.key.mode != mode:
                continue
            path = [label_to_state(parse_label(label), song.key, states) for label in song.chords]
            previous: Optional[int] = None
            for state in path:
                if state is not None:
                    if previous is None:
                        start[state] += 1
                    else:
                        trans[previous, state] += 1
                previous = state
            last = next((s for s in reversed(path) if s is not None), None)
            if last is not None:
                end[last] += 1
            end[tonic] += END_TONIC_BONUS if any(s is not None for s in path) else 0
        probs = (trans + k) / (trans + k).sum(axis=1, keepdims=True)
        start_p = (start + k) / (start + k).sum()
        if boost and style == "BALLAD":
            factor = np.array([BALLAD_COLOR_BOOST.get(c.label, 1.0) for c in states])
            probs = probs * factor
            probs /= probs.sum(axis=1, keepdims=True)
            start_p = start_p * factor
            start_p /= start_p.sum()
        out[mode] = {
            "states": [c.label for c in states],
            "start": _round(np.log(start_p)),
            "end": _round(_log_normalize(end, k)),
            "trans": _round(np.log(probs)),
        }
    return out


def quality_emission(songs: Iterable[Song], k: float = DEFAULT_K) -> dict[str, np.ndarray]:
    """P(khoảng cách nốt so với gốc | loại hợp âm) cho cả 7 loại: dùng làm bảng dự phòng khi một hợp âm ít dữ liệu."""
    counts = {q: np.zeros(12) for q in QUALITIES}
    for song in songs:
        if song.melody is None:
            continue
        for label, notes in zip(song.chords, song.melody):
            parsed = parse_label(label)
            if parsed is None:
                continue
            root, quality, _ = parsed
            for pc, weight in notes:
                counts[quality][(pc - root) % 12] += weight
    return {q: (v + k) / (v + k).sum() for q, v in counts.items()}


def count_emission(
    songs: Iterable[Song],
    style: str,
    k: float = DEFAULT_K,
    extension: float = 0.0,
    backoff: float = EMISSION_BACKOFF,
) -> dict[str, list]:
    """Bảng phát theo trạng thái: P(bậc của nốt so với chủ âm | hợp âm), mỗi giọng một bảng [S, 12] (log).

    Hàng của mỗi hợp âm = số đếm (trọng số phách) + ``backoff`` × bảng theo loại hợp âm xoay về gốc của nó, nên hợp âm
    ít hoặc không có dữ liệu vẫn có hình dạng hợp lý. ``extension`` (Jazz) cộng thêm cho nốt 9, 11, 13 so với gốc.
    """
    songs = [s for s in songs if s.melody is not None]
    prior = quality_emission(songs, k)
    out = {}
    for mode in ("major", "minor"):
        states = VOCAB[style][mode]
        counts = np.zeros((len(states), 12))
        for song in songs:
            if song.key.mode != mode:
                continue
            for label, notes in zip(song.chords, song.melody):
                state = label_to_state(parse_label(label), song.key, states)
                if state is None:
                    continue
                for pc, weight in notes:
                    counts[state, (pc - song.key.tonic) % 12] += weight
        rows = []
        for index, chord in enumerate(states):
            rotated = np.array([prior[chord.quality][(degree - chord.root) % 12] for degree in range(12)])
            row = counts[index] + backoff * rotated
            row = row / row.sum()
            if extension:
                for interval in JAZZ_EXTENSION_INTERVALS:
                    row[(chord.root + interval) % 12] += extension
                row = row / row.sum()
            rows.append(_round(np.log(row)))
        out[mode] = rows
    return out


def count_model(
    songs: Iterable[Song],
    style: str,
    k: float = DEFAULT_K,
    emission_songs: Optional[Iterable[Song]] = None,
    boost: bool = True,
) -> dict:
    """Bảng xác suất định dạng v2 của ``app/chords/hmm.py``: mỗi giọng có states, start, end, trans và emission [S, 12]."""
    songs = list(songs)
    emission = count_emission(
        songs if emission_songs is None else emission_songs, style, k, JAZZ_EXTENSION if style == "JAZZ" else 0.0
    )
    transitions = count_transitions(songs, style, k, boost)
    for mode in ("major", "minor"):
        transitions[mode]["emission"] = emission[mode]
    return {"style": style, "version": 2, **transitions}


def exclude_test(songs: Iterable[Song], test_names: set[str]) -> list[Song]:
    return [s for s in songs if s.name not in test_names]


def load_test_split(path: Path = TEST_SPLIT_FILE) -> set[str]:
    if not path.exists():
        return set()
    return {line.strip() for line in path.read_text().splitlines() if line.strip() and not line.startswith("#")}


def make_test_split(names: list[str], path: Path = TEST_SPLIT_FILE) -> set[str]:
    """Chọn cố định 10% bài làm tập kiểm thử (seed 42) và ghi ra file; đã có file thì giữ nguyên."""
    if path.exists():
        return load_test_split(path)
    chosen = sorted(random.Random(SPLIT_SEED).sample(sorted(names), max(1, round(len(names) * TEST_FRACTION))))
    path.write_text("# Tập kiểm thử của scripts/chord_eval.py, không dùng khi huấn luyện (seed 42, 10%)\n" + "\n".join(chosen) + "\n")
    return set(chosen)


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Huấn luyện bảng xác suất HMM gợi ý hợp âm")
    parser.add_argument("--pop909", type=Path, required=True)
    parser.add_argument("--irb", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "app" / "chords" / "model")
    parser.add_argument("--k", type=float, default=DEFAULT_K)
    args = parser.parse_args(argv)

    pop_all = list(read_pop909(args.pop909))
    test = make_test_split([s.name for s in pop_all])
    pop = exclude_test(pop_all, test)
    irb = list(read_irb(args.irb))
    print(f"POP909: {len(pop_all)} bài ({len(pop)} huấn luyện, {len(test)} kiểm thử); iRb: {len(irb)} bài")

    args.out.mkdir(parents=True, exist_ok=True)
    models = {
        "pop": count_model(pop, "POP", args.k),
        "ballad": count_model(pop, "BALLAD", args.k),
        "jazz": count_model(irb, "JAZZ", args.k, emission_songs=pop),
    }
    for name, model in models.items():
        target = args.out / f"{name}.json"
        target.write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
        print(f"{target}: {target.stat().st_size} byte")


if __name__ == "__main__":
    main()
