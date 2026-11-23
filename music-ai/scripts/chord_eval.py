"""Đánh giá HMM gợi ý hợp âm trên tập kiểm thử POP909 (spec R3 mục 9).

Chạy (từ thư mục music-ai)::

    python scripts/chord_eval.py --pop909 training/chords/data/pop909/POP909-Dataset-master

Chỉ dùng các bài trong ``training/chords/test_split.txt`` (không có trong dữ liệu huấn luyện). So bốn cách:

- ``tonic``: luôn đoán hợp âm chủ (mốc thấp nhất).
- ``emission``: chọn từng bước riêng theo xác suất phát (không có phần Markov).
- ``hmm``: Viterbi với xác suất bắt đầu và chuyển.
- ``hmm_end``: như ``hmm``, thêm xác suất kết thúc (câu kết về chủ âm).

Chỉ số theo từng bước có nhãn: ``root_acc`` (đúng gốc), ``chord_acc`` (đúng gốc và loại sau khi rút về từ vựng),
``func_acc`` (cùng nhóm chức năng chủ / hạ át / át theo bậc của gốc) và ``tone_cov`` (tỉ lệ trường độ giai điệu nằm trong
hợp âm đoán; ``gold_tone_cov`` là con số tương ứng của nhãn gốc để so).
Giọng lấy theo nhãn của bộ dữ liệu, để con số đo riêng phần hợp âm, không lẫn lỗi đoán giọng.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Literal

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.chords.hmm import EMISSION_WEIGHT, StyleModel, load_model, viterbi  # noqa: E402
from training.chords.corpus import Song, label_to_state, parse_label, read_pop909  # noqa: E402
from training.chords.train import load_test_split  # noqa: E402

Method = Literal["tonic", "emission", "hmm", "hmm_end"]
METHODS: tuple[Method, ...] = ("tonic", "emission", "hmm", "hmm_end")

# Nhóm chức năng theo bậc của gốc hợp âm (bán cung so với chủ âm): T chủ, S hạ át, D át
FUNCTION_OF_ROOT = {0: "T", 3: "T", 4: "T", 9: "T", 2: "S", 5: "S", 8: "S", 10: "S", 7: "D", 11: "D"}

# Các nốt của hợp âm theo loại (bán cung so với gốc)
CHORD_TONES = {
    "maj": {0, 4, 7},
    "min": {0, 3, 7},
    "7": {0, 4, 7, 10},
    "maj7": {0, 4, 7, 11},
    "min7": {0, 3, 7, 10},
    "hdim7": {0, 3, 6, 10},
    "sus4": {0, 5, 7},
}


def _function(chord) -> str:
    return FUNCTION_OF_ROOT.get(chord.root, f"X{chord.root}")


def _in_chord(pc: int, chord, tonic: int) -> bool:
    return (pc - tonic - chord.root) % 12 in CHORD_TONES[chord.quality]


def _emission(song: Song, log_emit: np.ndarray) -> np.ndarray:
    """Như ``hmm.emission_matrix`` (cùng hệ số ``EMISSION_WEIGHT``) cho bài đã tách sẵn theo bước."""
    out = np.zeros((len(song.chords), log_emit.shape[0]))
    for t, notes in enumerate(song.melody or []):
        for pc, weight in notes:
            out[t] += weight * log_emit[:, (pc - song.key.tonic) % 12]
    return EMISSION_WEIGHT * out


def _predict(song: Song, model: StyleModel, method: Method) -> list[int]:
    mode = model.mode(song.key.mode)
    states = mode.states
    size, steps = len(states), len(song.chords)
    tonic = next(i for i, c in enumerate(states) if c.root == 0 and c.bass is None)
    if method == "tonic":
        return [tonic] * steps
    emit = _emission(song, mode.log_emit)
    if method == "emission":
        return [int(np.argmax(row)) if np.any(row) else tonic for row in emit]
    end = mode.log_end if method == "hmm_end" else np.zeros(size)
    return viterbi(mode.log_start, mode.log_trans, end, emit, [None] * steps)


def evaluate(songs: list[Song], model: StyleModel, method: Method) -> dict[str, float]:
    root_ok = chord_ok = func_ok = total = 0
    weight_all = weight_guess = weight_gold = 0.0
    for song in songs:
        states = model.mode(song.key.mode).states
        predicted = _predict(song, model, method)
        melody = song.melody or [[] for _ in song.chords]
        for label, guess_index, notes in zip(song.chords, predicted, melody):
            gold_index = label_to_state(parse_label(label), song.key, states) if label and label != "N" else None
            if gold_index is None:
                continue
            gold, guess = states[gold_index], states[guess_index]
            total += 1
            root_ok += gold.root == guess.root
            chord_ok += (gold.root, gold.quality) == (guess.root, guess.quality)
            func_ok += _function(gold) == _function(guess)
            for pc, weight in notes:
                weight_all += weight
                weight_guess += weight if _in_chord(pc, guess, song.key.tonic) else 0.0
                weight_gold += weight if _in_chord(pc, gold, song.key.tonic) else 0.0
    return {
        "root_acc": root_ok / total if total else 0.0,
        "chord_acc": chord_ok / total if total else 0.0,
        "func_acc": func_ok / total if total else 0.0,
        "tone_cov": weight_guess / weight_all if weight_all else 0.0,
        "gold_tone_cov": weight_gold / weight_all if weight_all else 0.0,
        "steps": total,
    }


def markdown_table(style: str, rows: dict[str, dict[str, float]]) -> str:
    lines = [
        f"### {style}",
        "",
        "| Cách | Đúng gốc | Đúng hợp âm | Đúng chức năng | Nốt thuộc hợp âm | Số bước |",
        "|---|---|---|---|---|---|",
    ]
    for method, r in rows.items():
        lines.append(
            f"| {method} | {r['root_acc'] * 100:.1f}% | {r['chord_acc'] * 100:.1f}% | {r['func_acc'] * 100:.1f}%"
            f" | {r['tone_cov'] * 100:.1f}% | {int(r['steps'])} |"
        )
    gold = next(iter(rows.values()))["gold_tone_cov"]
    lines += ["", f"Nốt thuộc hợp âm của nhãn gốc: {gold * 100:.1f}%"]
    return "\n".join(lines)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="Đánh giá HMM gợi ý hợp âm trên tập kiểm thử POP909")
    parser.add_argument("--pop909", type=Path, required=True)
    parser.add_argument("--styles", nargs="+", default=["POP", "BALLAD", "FOLK", "BOLERO"])
    parser.add_argument(
        "--classical", action="store_true", help="đánh giá thêm Cổ điển trên các chorale Bach của tập kiểm thử riêng"
    )
    args = parser.parse_args(argv)

    test_names = load_test_split()
    songs = [s for s in read_pop909(args.pop909) if s.name in test_names]
    print(f"Tập kiểm thử: {len(songs)} bài\n")
    for style in args.styles:
        model = load_model(style)
        print(markdown_table(style, {m: evaluate(songs, model, m) for m in METHODS}))
        print()
    if args.classical:
        from training.chords.corpus import read_bach_chorales
        from training.chords.train import CLASSICAL_TEST_FILE

        chorale_test = load_test_split(CLASSICAL_TEST_FILE)
        chorales = [s for s in read_bach_chorales() if s.name in chorale_test]
        print(f"Chorale kiểm thử: {len(chorales)} bài\n")
        model = load_model("CLASSICAL")
        print(markdown_table("CLASSICAL", {m: evaluate(chorales, model, m) for m in METHODS}))


if __name__ == "__main__":
    main()
