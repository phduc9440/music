"""So sánh HMM gợi ý hợp âm (R3) với MelodyT5 (Wu và cộng sự, ISMIR 2024, trọng số MIT trên HuggingFace).

Hai mô hình chạy trên **cùng những đoạn 16 ô** lấy từ tập kiểm thử POP909 (``training/chords/test_split.txt``), chấm cùng
lưới nửa ô và cùng chỉ số với ``scripts/chord_eval.py``.

1. ``python scripts/chord_compare_melodyt5.py prepare --pop909 DIR`` (môi trường music-ai): giai điệu → ABC (lượng tử
   móc kép, nối khoảng lặng ngắn hơn một phách, viết ``L:1/8``, ``M:4/4``, đúng giọng), tối đa ``--chunks-per-song`` đoạn
   16 ô mỗi bài, ghi ``chunks.jsonl``.
2. ``scripts/melodyt5_runner.py`` (môi trường MelodyT5): ghi ``melodyt5.jsonl``.
3. ``python scripts/chord_compare_melodyt5.py score --pop909 DIR`` (môi trường music-ai): in bảng so sánh.

Chỉ số: ``root_raw`` đúng gốc hợp âm (không quy về từ vựng, công bằng cho MelodyT5), ``chord_acc`` đúng hợp âm sau khi cả
nhãn lẫn dự đoán quy về từ vựng Pop, ``func_acc`` đúng chức năng T/S/D, ``tone_cov`` tỉ lệ trường độ giai điệu nằm trong
hợp âm đoán.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.chords.hmm import load_model  # noqa: E402
from app.chords.theory import VOCAB, Key, spell_root  # noqa: E402
from scripts.chord_eval import CHORD_TONES, _function, _predict  # noqa: E402
from training.chords.corpus import (  # noqa: E402
    Song,
    _read_pop909_song,
    _root_pc,
    label_to_state,
    parse_label,
    read_midi_notes,
)
from training.chords.train import load_test_split  # noqa: E402

BARS_PER_CHUNK = 16
SLOTS_PER_BAR = 16
MAX_BAR_CHARS = 50  # MelodyT5 cắt mỗi ô ở 64 ký tự (kể cả hợp âm nó chèn thêm)
DEFAULT_DIR = Path(__file__).resolve().parents[1] / "training" / "chords" / "data" / "compare"
EXTRA_TONES = {"dim": {0, 3, 6}, "aug": {0, 4, 8}}

Parsed = tuple[int, str, Optional[int]]


# ------------------------------------------------------------------------------------------------ ABC


def _key_signature(fifths: int) -> dict[str, int]:
    order = "FCGDAEB" if fifths >= 0 else "BEADGCF"
    return {letter: (1 if fifths > 0 else -1) for letter in order[: abs(fifths)]}


def _abc_key(key: Key) -> str:
    step, alter = spell_root(key.tonic, key)
    return step + ("#" if alter > 0 else "b" if alter < 0 else "") + ("m" if key.mode == "minor" else "")


def abc_pitch(midi: int, key: Key, current: dict[tuple[str, int], int]) -> str:
    """Một cao độ ABC; ``current`` giữ dấu hóa đang hiệu lực trong ô (dấu hóa bất thường kéo tới hết ô)."""
    step, alter = spell_root(midi % 12, key)
    octave = midi // 12 - 1
    if step == "B" and alter == 1:  # B# thuộc quãng tám trên; không gặp với cách viết hiện tại, giữ cho an toàn
        octave -= 1
    if step == "C" and alter == -1:
        octave += 1
    effective = current.get((step, octave), _key_signature(key.fifths).get(step, 0))
    accidental = ""
    if alter != effective:
        accidental = {1: "^", -1: "_", 0: "="}[alter]
        current[(step, octave)] = alter
    if octave >= 5:
        name = step.lower() + "'" * (octave - 5)
    else:
        name = step + "," * (4 - octave)
    return accidental + name


def _eighths(slots: int) -> str:
    """Độ dài ABC theo đơn vị nốt móc đơn (``L:1/8``) từ số ô móc kép: 1 → /2, 2 → (trống), 3 → 3/2, 4 → 2."""
    if slots % 2:
        return "/2" if slots == 1 else f"{slots}/2"
    return "" if slots == 2 else str(slots // 2)


def legato(slots: list[Optional[tuple[int, int]]], max_gap: int = 4) -> list[Optional[tuple[int, int]]]:
    """Nối nốt tới nốt kế tiếp khi khoảng lặng ngắn hơn ``max_gap`` ô (giờ nhả phím MIDI làm giai điệu đứt quãng);
    khoảng lặng dài hoặc lặng cuối ô thì giữ."""
    out = list(slots)
    i = 0
    while i < len(out):
        if out[i] is None and i > 0 and out[i - 1] is not None:
            j = i
            while j < len(out) and out[j] is None:
                j += 1
            if j < len(out) and j - i < max_gap:
                for k in range(i, j):
                    out[k] = out[i - 1]
            i = j
        else:
            i += 1
    return out


def bar_to_abc(slots: list[Optional[tuple[int, int]]], key: Key) -> str:
    """Một ô 16 ô nốt móc kép (mỗi phần tử là (id nốt, cao độ) hoặc None = lặng), viết theo ``L:1/8``."""
    out, current, i = [], {}, 0
    while i < len(slots):
        j = i + 1
        while j < len(slots) and slots[j] == slots[i]:
            j += 1
        token = "z" if slots[i] is None else abc_pitch(slots[i][1], key, current)
        # Mỗi nốt cách nhau một khoảng như dữ liệu harmonization của MelodyT5 (viết liền thì model gần như không chèn hợp âm)
        out.append(token + _eighths(j - i))
        i = j
    return " ".join(out)


# ------------------------------------------------------------------------------------------------ prepare


def neutral_shift(key: Key) -> int:
    """Số bán cung (-6..5) dịch giọng về Đô trưởng hoặc La thứ (không dấu hóa)."""
    shift = ((0 if key.mode == "major" else 9) - key.tonic) % 12
    return shift - 12 if shift > 5 else shift


def shift_parsed(parsed: Optional[Parsed], delta: int) -> Optional[Parsed]:
    if parsed is None:
        return None
    root, quality, bass = parsed
    return (root + delta) % 12, quality, None if bass is None else (bass + delta) % 12


def _bars(song_dir: Path) -> list[list[float]]:
    rows = [list(map(float, line.split())) for line in (song_dir / "beat_midi.txt").read_text().splitlines() if line.strip()]
    bars: list[list[float]] = []
    for time, _half, bar in rows:
        if bar == 1.0 or not bars:
            bars.append([time])
        else:
            bars[-1].append(time)
    return bars


def _slot(time: float, bar_index: int, bars: list[list[float]]) -> float:
    beats = bars[bar_index] + [bars[bar_index + 1][0]]
    for k in range(len(beats) - 1):
        if beats[k] <= time < beats[k + 1] or k == len(beats) - 2:
            return bar_index * SLOTS_PER_BAR + 4 * k + 4 * (time - beats[k]) / max(1e-6, beats[k + 1] - beats[k])
    return bar_index * SLOTS_PER_BAR


def _global_slot(time: float, bars: list[list[float]]) -> int:
    for b in range(len(bars) - 1):
        if time < bars[b + 1][0]:
            return round(_slot(time, b, bars))
    return (len(bars) - 1) * SLOTS_PER_BAR


def song_chunks(song_dir: Path, song: Song, per_song: int, neutral: bool = False) -> list[dict]:
    bars = _bars(song_dir)
    if len(bars) < BARS_PER_CHUNK + 1:
        return []
    notes = read_midi_notes(song_dir / f"{song_dir.name}.mid", "MELODY")
    shift = neutral_shift(song.key) if neutral else 0
    key = Key(0 if song.key.mode == "major" else 9, song.key.mode, 0) if neutral else song.key
    notes = [(start, end, pitch + shift) for start, end, pitch in notes]
    total = (len(bars) - 1) * SLOTS_PER_BAR
    slots: list[Optional[tuple[int, int]]] = [None] * total
    for note_id, (start, end, pitch) in enumerate(notes):
        s, e = _global_slot(start, bars), _global_slot(end, bars)
        e = max(e, s + 1)
        for k in range(max(0, s), min(total, e)):
            if slots[k] is None or slots[k][1] < pitch:
                slots[k] = (note_id, pitch)

    step_of_bar, step = [], 0  # bước đầu tiên của mỗi ô, cùng lưới với corpus._steps_from_bars
    for beats in bars[:-1]:
        step_of_bar.append(step)
        step += 2 if len(beats) == 4 else 1

    first = next((b for b in range(len(bars) - 1) if any(slots[b * 16 : (b + 1) * 16])), None)
    chunks = []
    b0 = first
    while b0 is not None and len(chunks) < per_song and b0 + BARS_PER_CHUNK <= len(bars) - 1:
        chunk_bars = range(b0, b0 + BARS_PER_CHUNK)
        texts = [bar_to_abc(legato(slots[b * 16 : (b + 1) * 16]), key) for b in chunk_bars]
        if all(len(bars[b]) == 4 for b in chunk_bars) and all(len(t) <= MAX_BAR_CHARS for t in texts):
            lines = [" | ".join(texts[i : i + 4]) for i in range(0, BARS_PER_CHUNK, 4)]
            abc = f"%%harmonization\nL:1/8\nM:4/4\nK:{_abc_key(key)}\n" + " |\n".join(lines) + " |]\n"
            chunks.append({
                "id": f"{song.name}#{len(chunks)}",
                "song": song.name,
                "step_start": step_of_bar[b0],
                "steps": 2 * BARS_PER_CHUNK,
                "shift": shift,
                "abc": abc,
            })
        b0 += BARS_PER_CHUNK
    return chunks


def prepare(pop909: Path, out_dir: Path, per_song: int, neutral: bool = False) -> None:
    base = pop909 / "POP909" if (pop909 / "POP909").is_dir() else pop909
    test = load_test_split()
    out_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    with (out_dir / "chunks.jsonl").open("w", encoding="utf-8") as sink:
        for name in sorted(test):
            song_dir = base / name.split("/")[1]
            try:
                song = _read_pop909_song(song_dir, song_dir.name)
                chunks = song_chunks(song_dir, song, per_song, neutral)
            except (OSError, ValueError, IndexError):
                continue
            for chunk in chunks:
                sink.write(json.dumps(chunk, ensure_ascii=False) + "\n")
                count += 1
    print(f"{count} đoạn → {out_dir / 'chunks.jsonl'}")


# ------------------------------------------------------------------------------------------------ score

_TOKEN = re.compile(r'"([^"]*)"|([\^_=]*)([A-Ga-gz])([,\']*)(\d*)(/\d*)?')


def parse_symbol_raw(text: str) -> Optional[Parsed]:
    """Ký hiệu hợp âm của MelodyT5 ("G#m7/B", "F#sus4", "Bdim") → (gốc, loại, bass); loại lạ → None."""
    match = re.match(r"^([A-G][#b]?)([^/]*)(?:/([A-G][#b]?))?$", text.strip())
    if not match:
        return None
    root = _root_pc(match.group(1))
    suffix = match.group(2)
    table = {
        "": "maj", "6": "maj", "add9": "maj", "maj": "maj", "m": "min", "m6": "min", "min": "min", "madd9": "min",
        "7": "7", "9": "7", "13": "7", "7sus4": "7", "11": "7", "maj7": "maj7", "maj9": "maj7", "M7": "maj7",
        "m7": "min7", "m9": "min7", "m11": "min7", "m7b5": "hdim7", "ø": "hdim7", "ø7": "hdim7",
        "sus4": "sus4", "sus": "sus4", "sus2": "maj", "dim": "dim", "dim7": "dim", "o": "dim", "o7": "dim",
        "aug": "aug", "+": "aug",
    }
    quality = table.get(suffix)
    if root is None or quality is None:
        return None
    bass = _root_pc(match.group(3)) if match.group(3) else None
    return root, quality, bass


def _length16(number: str, fraction: Optional[str]) -> int:
    """Độ dài theo ô móc kép của một nốt ``L:1/8``: "" = 2, "3" = 6, "/2" = 1, "3/2" = 3."""
    eighths = int(number) if number else 1
    if fraction:
        eighths = eighths / (int(fraction[1:]) if len(fraction) > 1 else 2)
    return round(eighths * 2)


def chords_per_step(output: str, steps: int) -> list[Optional[Parsed]]:
    """Hợp âm đang hiệu lực ở đầu mỗi nửa ô của đoạn MelodyT5 sinh ra (``L:1/8``)."""
    body = "".join(line for line in output.splitlines() if not re.match(r"^[A-Za-z]:|^%%", line))
    bars = [b for b in re.split(r"\|\]|\|", body) if b.strip()]
    events: list[tuple[int, int, str]] = []  # (ô, vị trí theo móc kép, ký hiệu)
    for bar_index, bar in enumerate(bars):
        if bar.count('"') % 2:  # model đôi khi sinh một dấu ngoặc kép lẻ: bỏ dấu cuối để không nuốt giai điệu
            cut = bar.rfind('"')
            bar = bar[:cut] + bar[cut + 1 :]
        pos = 0
        for match in _TOKEN.finditer(bar):
            chord, _acc, letter, _octave, number, fraction = match.groups()
            if chord is not None:
                events.append((bar_index, pos, chord))
            elif letter is not None:
                pos += _length16(number, fraction)
    out: list[Optional[Parsed]] = []
    for step in range(steps):
        at = (step // 2, (step % 2) * 8)
        active = [e for e in events if (e[0], e[1]) <= at]
        out.append(parse_symbol_raw(active[-1][2]) if active else None)
    return out


def _sub_song(song: Song, start: int, count: int) -> Song:
    return Song(
        name=song.name,
        key=song.key,
        chords=song.chords[start : start + count],
        melody=song.melody[start : start + count] if song.melody else None,
    )


def score(items: list[tuple[Song, list[Optional[Parsed]]]]) -> dict[str, float]:
    states_of = {mode: VOCAB["POP"][mode] for mode in ("major", "minor")}
    root_ok = chord_ok = func_ok = total = missing = 0
    weight_all = weight_hit = 0.0
    for song, predicted in items:
        states = states_of[song.key.mode]
        for label, guess, notes in zip(song.chords, predicted, song.melody or []):
            gold = parse_label(label) if label and label != "N" else None
            gold_state = label_to_state(gold, song.key, states) if gold else None
            if gold_state is None:
                continue
            total += 1
            if guess is None:
                missing += 1
                weight_all += sum(w for _, w in notes)
                continue
            root_ok += guess[0] == gold[0]
            guess_state = label_to_state(guess, song.key, states) if guess[1] in CHORD_TONES else None
            if guess_state is not None:
                g, p = states[gold_state], states[guess_state]
                chord_ok += (g.root, g.quality) == (p.root, p.quality)
                func_ok += _function(g) == _function(p)
            tones = CHORD_TONES.get(guess[1]) or EXTRA_TONES[guess[1]]
            for pc, weight in notes:
                weight_all += weight
                weight_hit += weight if (pc - guess[0]) % 12 in tones else 0.0
    return {
        "root_raw": root_ok / total if total else 0.0,
        "chord_acc": chord_ok / total if total else 0.0,
        "func_acc": func_ok / total if total else 0.0,
        "tone_cov": weight_hit / weight_all if weight_all else 0.0,
        "missing": missing / total if total else 0.0,
        "root_answered": root_ok / (total - missing) if total > missing else 0.0,
        "chord_answered": chord_ok / (total - missing) if total > missing else 0.0,
        "steps": total,
    }


def _hmm_parsed(song: Song, method: str) -> list[Optional[Parsed]]:
    model = load_model("POP")
    states = model.mode(song.key.mode).states
    return [((song.key.tonic + states[i].root) % 12, states[i].quality, None) for i in _predict(song, model, method)]


def run_score(pop909: Path, out_dir: Path) -> None:
    base = pop909 / "POP909" if (pop909 / "POP909").is_dir() else pop909
    chunks = {c["id"]: c for c in map(json.loads, (out_dir / "chunks.jsonl").read_text().splitlines())}
    outputs = [json.loads(line) for line in (out_dir / "melodyt5.jsonl").read_text().splitlines() if line.strip()]
    songs: dict[str, Song] = {}
    rows = {"hmm": [], "emission": [], "melodyt5": []}
    seconds = []
    for out in outputs:
        chunk = chunks[out["id"]]
        name = chunk["song"]
        if name not in songs:
            folder = base / name.split("/")[1]
            songs[name] = _read_pop909_song(folder, folder.name)
        sub = _sub_song(songs[name], chunk["step_start"], chunk["steps"])
        back = -chunk.get("shift", 0)  # dịch hợp âm về giọng gốc nếu đoạn đã được dịch về Đô / La thứ
        rows["melodyt5"].append((sub, [shift_parsed(p, back) for p in chords_per_step(out["output"], chunk["steps"])]))
        rows["hmm"].append((sub, _hmm_parsed(sub, "hmm")))
        rows["emission"].append((sub, _hmm_parsed(sub, "emission")))
        seconds.append(out["seconds"])
    print(f"{len(outputs)} đoạn 16 ô, {len({c['song'] for c in map(chunks.get, (o['id'] for o in outputs))})} bài;"
          f" MelodyT5 trung bình {sum(seconds) / max(1, len(seconds)):.1f} giây/đoạn trên CPU\n")
    print("| Mô hình | Đúng gốc | Đúng hợp âm | Đúng chức năng | Nốt thuộc hợp âm | Bỏ trống |"
          " Đúng gốc (bước có đoán) | Đúng hợp âm (bước có đoán) | Số bước |")
    print("|---|---|---|---|---|---|---|---|---|")
    for name, items in rows.items():
        r = score(items)
        print(f"| {name} | {r['root_raw'] * 100:.1f}% | {r['chord_acc'] * 100:.1f}% | {r['func_acc'] * 100:.1f}%"
              f" | {r['tone_cov'] * 100:.1f}% | {r['missing'] * 100:.1f}% | {r['root_answered'] * 100:.1f}%"
              f" | {r['chord_answered'] * 100:.1f}% | {r['steps']} |")


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="So sánh HMM với MelodyT5 trên tập kiểm thử POP909")
    parser.add_argument("command", choices=["prepare", "score"])
    parser.add_argument("--pop909", type=Path, required=True)
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    parser.add_argument("--chunks-per-song", type=int, default=2)
    parser.add_argument("--neutral", action="store_true", help="dịch mọi đoạn về Đô trưởng / La thứ cho MelodyT5")
    args = parser.parse_args(argv)
    if args.command == "prepare":
        prepare(args.pop909, args.dir, args.chunks_per_song, args.neutral)
    else:
        run_score(args.pop909, args.dir)


if __name__ == "__main__":
    main()
