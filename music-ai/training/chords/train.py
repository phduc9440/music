"""Huấn luyện bảng xác suất HMM gợi ý hợp âm (spec R3 mục 5.4) và ghi ``app/chords/model/{pop,ballad,jazz}.json``.

Chạy (từ thư mục music-ai)::

    python -m training.chords.train --pop909 training/chords/data/pop909/POP909-Dataset-master \
        --irb training/chords/data/irealpro --out app/chords/model

- Pop: chuyển và phát đếm từ POP909.
- Ballad: bảng chuyển của Pop (đếm trên từ vựng Ballad), cột của hợp âm màu được nhân ``BALLAD_COLOR_BOOST`` rồi chuẩn hóa.
- Jazz: chuyển đếm từ iRb (chỉ có hợp âm), phát học từ POP909 (nhãn rút về từ vựng Jazz) cộng thêm ``JAZZ_EXTENSION``
  cho nốt 9, 11, 13.
- Cổ điển: chuyển và phát đếm từ các chorale bốn bè của Bach trong music21 (phạm vi công cộng; 10% bài để kiểm thử).
- Dân ca: chuyển của Pop đếm trên từ vựng hẹp (I, ii, IV, V, V7, vi), xác suất ở lại cùng hợp âm nhân ``FOLK_STAY_BOOST``.
- Bolero: không có bộ dữ liệu mở, bảng chuyển dựng tay theo nhạc lý (``BOLERO_TRANSITIONS``); phát học từ POP909.
- Blues: chuyển đếm từ các bài blues 12 ô trong iRb (nhận theo cấu trúc: ô 1 là I, ô 5 là IV, ô 7 về I), phát từ POP909.
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
from training.chords.corpus import Song, label_to_state, parse_label, read_bach_chorales, read_irb, read_pop909

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


FOLK_STAY_BOOST = 1.6  # dân ca đổi hợp âm thưa: nhân xác suất ở lại cùng hợp âm rồi chuẩn hóa
FOLK_TONIC_START = 6.0  # bài dân ca gần như luôn mở đầu bằng hợp âm chủ (POP909 hay mở bằng vi)
CLASSICAL_TEST_FILE = Path(__file__).parent / "test_split_classical.txt"

# Bolero / trữ tình Việt: trọng số chuyển dựng tay theo nhạc lý (hàng: từ, cột: tới; tự chuẩn hóa), không có dữ liệu mở.
# Giọng thứ là chính: i–iv–V7–i, I7 dẫn về iv, bVII → bIII (sang giọng trưởng song song) và bVI → V7. Giọng trưởng: III7
# dẫn về vi, I7 dẫn về IV, ii → V7. Hợp âm bolero giữ khá lâu nên xác suất ở lại cao (bước = nửa ô).
BOLERO_TRANSITIONS: dict[str, dict] = {
    "minor": {
        "start": {"i": 0.7, "iv": 0.05, "V7": 0.1, "bVI": 0.05, "bVII": 0.03, "bIII": 0.04, "I7": 0.03},
        "end": {"i": 0.85, "iv": 0.03, "V7": 0.04, "bVI": 0.02, "bVII": 0.02, "bIII": 0.02, "I7": 0.02},
        "trans": {
            "i": {"i": 0.45, "iv": 0.15, "V7": 0.15, "bVI": 0.05, "bVII": 0.07, "bIII": 0.05, "I7": 0.08},
            "iv": {"i": 0.25, "iv": 0.4, "V7": 0.2, "bVI": 0.03, "bVII": 0.07, "bIII": 0.03, "I7": 0.02},
            "V7": {"i": 0.5, "iv": 0.03, "V7": 0.4, "bVI": 0.05, "bVII": 0.01, "bIII": 0.005, "I7": 0.005},
            "bVI": {"i": 0.1, "iv": 0.1, "V7": 0.3, "bVI": 0.4, "bVII": 0.05, "bIII": 0.03, "I7": 0.02},
            "bVII": {"i": 0.1, "iv": 0.03, "V7": 0.02, "bVI": 0.03, "bVII": 0.4, "bIII": 0.4, "I7": 0.02},
            "bIII": {"i": 0.05, "iv": 0.15, "V7": 0.1, "bVI": 0.2, "bVII": 0.05, "bIII": 0.4, "I7": 0.05},
            "I7": {"i": 0.03, "iv": 0.55, "V7": 0.02, "bVI": 0.02, "bVII": 0.02, "bIII": 0.01, "I7": 0.35},
        },
    },
    "major": {
        "start": {"I": 0.7, "ii": 0.03, "IV": 0.07, "V7": 0.1, "vi": 0.06, "III7": 0.02, "I7": 0.02},
        "end": {"I": 0.85, "ii": 0.02, "IV": 0.03, "V7": 0.04, "vi": 0.03, "III7": 0.01, "I7": 0.02},
        "trans": {
            "I": {"I": 0.45, "ii": 0.07, "IV": 0.12, "V7": 0.14, "vi": 0.1, "III7": 0.04, "I7": 0.08},
            "ii": {"I": 0.05, "ii": 0.4, "IV": 0.05, "V7": 0.45, "vi": 0.03, "III7": 0.01, "I7": 0.01},
            "IV": {"I": 0.25, "ii": 0.05, "IV": 0.4, "V7": 0.2, "vi": 0.05, "III7": 0.03, "I7": 0.02},
            "V7": {"I": 0.52, "ii": 0.02, "IV": 0.02, "V7": 0.38, "vi": 0.05, "III7": 0.005, "I7": 0.005},
            "vi": {"I": 0.05, "ii": 0.15, "IV": 0.1, "V7": 0.1, "vi": 0.4, "III7": 0.15, "I7": 0.05},
            "III7": {"I": 0.02, "ii": 0.02, "IV": 0.03, "V7": 0.03, "vi": 0.5, "III7": 0.38, "I7": 0.02},
            "I7": {"I": 0.03, "ii": 0.02, "IV": 0.55, "V7": 0.02, "vi": 0.02, "III7": 0.01, "I7": 0.35},
        },
    },
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
        if boost and style == "FOLK":
            probs = probs + np.diag(np.diag(probs) * (FOLK_STAY_BOOST - 1))
            probs /= probs.sum(axis=1, keepdims=True)
            start_p[tonic] *= FOLK_TONIC_START
            start_p /= start_p.sum()
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


def manual_transitions(style: str, table: dict[str, dict]) -> dict:
    """Bảng start / end / trans (log) từ trọng số dựng tay; thiếu ô nào thì coi là 0 rồi làm mượt rất nhẹ."""
    out = {}
    for mode in ("major", "minor"):
        labels = [c.label for c in VOCAB[style][mode]]
        spec = table[mode]
        start = np.array([spec["start"].get(label, 0.0) for label in labels])
        end = np.array([spec["end"].get(label, 0.0) for label in labels])
        trans = np.array([[spec["trans"][a].get(b, 0.0) for b in labels] for a in labels])
        out[mode] = {
            "states": labels,
            "start": _round(_log_normalize(start, 1e-3)),
            "end": _round(_log_normalize(end, 1e-3)),
            "trans": _round(_log_normalize(trans, 1e-3)),
        }
    return out


def manual_model(style: str, table: dict[str, dict], emission_songs: Iterable[Song], k: float = DEFAULT_K) -> dict:
    """Mô hình v2 với bảng chuyển dựng tay (Bolero) và bảng phát học từ dữ liệu có giai điệu."""
    emission = count_emission(emission_songs, style, k)
    transitions = manual_transitions(style, table)
    for mode in ("major", "minor"):
        transitions[mode]["emission"] = emission[mode]
    return {"style": style, "version": 2, **transitions}


def is_twelve_bar_blues(song: Song) -> bool:
    """Bài blues 12 ô (iRb không ghi thể loại): số bước là bội của 24 (12 ô × 2 bước), ô 1 là I, ô 5 là IV, ô 7 về I."""
    if not song.chords or len(song.chords) % 24:
        return False

    def root_at(bar: int) -> Optional[int]:
        parsed = parse_label(song.chords[bar * 2])
        return None if parsed is None else (parsed[0] - song.key.tonic) % 12

    return root_at(0) == 0 and root_at(4) == 5 and root_at(6) == 0


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
    parser.add_argument("--chorale-limit", type=int, default=None, help="chỉ đọc chừng này chorale (thử nhanh)")
    args = parser.parse_args(argv)

    pop_all = list(read_pop909(args.pop909))
    test = make_test_split([s.name for s in pop_all])
    pop = exclude_test(pop_all, test)
    irb = list(read_irb(args.irb))
    blues = [s for s in irb if is_twelve_bar_blues(s)]
    chorales_all = list(read_bach_chorales(args.chorale_limit))
    chorale_test = make_test_split([s.name for s in chorales_all], CLASSICAL_TEST_FILE)
    chorales = exclude_test(chorales_all, chorale_test)
    print(f"POP909: {len(pop_all)} bài ({len(pop)} huấn luyện, {len(test)} kiểm thử); iRb: {len(irb)} bài "
          f"({len(blues)} blues 12 ô); chorale Bach: {len(chorales_all)} bài ({len(chorales)} huấn luyện)")

    args.out.mkdir(parents=True, exist_ok=True)
    models = {
        "pop": count_model(pop, "POP", args.k),
        "ballad": count_model(pop, "BALLAD", args.k),
        "jazz": count_model(irb, "JAZZ", args.k, emission_songs=pop),
        "classical": count_model(chorales, "CLASSICAL", args.k),
        "folk": count_model(pop, "FOLK", args.k),
        "bolero": manual_model("BOLERO", BOLERO_TRANSITIONS, pop, args.k),
        "blues": count_model(blues, "BLUES", args.k, emission_songs=pop),
    }
    for name, model in models.items():
        target = args.out / f"{name}.json"
        target.write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
        print(f"{target}: {target.stat().st_size} byte")


if __name__ == "__main__":
    main()
