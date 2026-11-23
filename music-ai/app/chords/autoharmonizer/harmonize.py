"""Gợi ý hợp âm bằng AutoHarmonizer: đọc giai điệu → model dự đoán hợp âm từng nốt móc kép → lấy mẫu nhiều phương án.

Khác mã gốc (luôn chọn hợp âm xác suất cao nhất nên cùng giai điệu lần nào cũng giống hệt):

- **Lấy mẫu**: mỗi bước rút ngẫu nhiên theo xác suất của model (chia nhiệt độ theo độ sáng tạo, cắt top-p để bỏ hợp âm quá
  hiếm), nên mỗi lần chạy ra cách đệm khác. Hạt giống cố định thì tái hiện được.
- **Nhiều phương án**: chạy song song vài dãy, bỏ trùng, xếp theo log xác suất trung bình của model (phương án A hợp tai
  nhất).
- **Mật độ**: như ``gamma_sampling`` của tác giả (x → x^tan(πγ/2)) trên hợp âm vừa chọn, cộng với giới hạn chỗ được đổi
  hợp âm (thưa: phách mạnh; vừa: đầu phách; dày: thêm chỗ nốt giai điệu bắt đầu).
- **Màu hợp âm**: cũng bằng gamma, tăng / giảm tổng xác suất của nhóm hợp âm (hợp âm ba, 7, maj7, m7, mở rộng...), nên vẫn là
  hợp âm model thấy hợp với giai điệu, chỉ đổi màu. Model gốc không có khái niệm thể loại nên không có lựa chọn theo thể loại.

Giữ như mã gốc: cấm "không hợp âm" ở phách mạnh có nốt; đầu vào là giai điệu (nốt cao nhất khuông 1), độ mạnh phách của nốt
(``beatStrength`` × 4 của music21) và giọng (số dấu thăng + 8), cửa sổ 32 bước hai bên.
"""

from __future__ import annotations

import json
import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from fractions import Fraction
from functools import lru_cache
from typing import Optional

import numpy as np

from app.chords import ChordError
from app.chords.autoharmonizer.model import SEGMENT, AutoHarmonizerNet, MODEL_DIR, load_net
from app.chords.melody import MELODY_STAFF, MelodySource, _measure_layout
from app.convert.score_xml import parse_part_events

CELL = Fraction(1, 4)  # một bước = một nốt móc kép (phách đen / 4)
MAX_OPTIONS = 3
MAX_CELLS = 4096  # khoảng 256 ô 4/4: dài hơn thì báo lỗi thay vì chạy rất lâu

# Độ sáng tạo → (nhiệt độ, top-p)
CREATIVITY = {"SAFE": (0.6, 0.85), "BALANCED": (1.0, 0.92), "BOLD": (1.4, 0.97)}
# Mật độ → (gamma cho hợp âm vừa chọn, độ mạnh phách tối thiểu để được đổi hợp âm, đổi được ở nốt mới bắt đầu tại vị trí
# nốt móc đơn)
DENSITY = {"SPARSE": (0.3, 2, False), "NORMAL": (0.5, 1, False), "DENSE": (0.6, 1, True)}

# Màu hợp âm → {nhóm hợp âm: gamma}; gamma < 0,5 tăng tổng xác suất của nhóm, > 0,5 giảm. Model không biết thể loại, đây chỉ
# là bộ lọc trên loại hợp âm nên tên mô tả đúng việc nó làm (không gọi theo thể loại nhạc)
STYLE_GAMMAS: dict[str, dict[str, float]] = {
    # Tự nhiên: để model tự chọn
    "NATURAL": {},
    # Đơn giản: hợp âm ba trưởng / thứ, hợp người mới tập
    "SIMPLE": {"major": 0.3, "minor": 0.35, "ext": 0.85, "maj7": 0.8, "min7": 0.8, "sixth": 0.8, "sus": 0.75,
               "dim": 0.8, "aug": 0.85, "hdim": 0.85},
    # Có màu: maj7, m7, sus, 6
    "COLORFUL": {"maj7": 0.25, "min7": 0.3, "sus": 0.35, "sixth": 0.4, "ext": 0.45, "dim": 0.7, "aug": 0.75},
    # Hợp âm 7 / jazz: hợp âm 7, maj7, m7, m7b5 và mở rộng 9, 11, 13
    "JAZZY": {"dom7": 0.25, "maj7": 0.2, "min7": 0.2, "ext": 0.25, "hdim": 0.3, "major": 0.75, "minor": 0.75},
}
STYLES = tuple(STYLE_GAMMAS)
REST_TOKEN = 0
_STEP_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


@dataclass
class Grid:
    melody: np.ndarray  # [N] cao độ MIDI, 0 = lặng
    beat: np.ndarray  # [N] độ mạnh phách của nốt chứa bước (0–4)
    key: np.ndarray  # [N] số dấu thăng + 8
    onset: np.ndarray  # [N] bool: nốt giai điệu bắt đầu đúng bước này
    cell_beat: np.ndarray  # [N] độ mạnh phách của chính vị trí bước (để quyết định chỗ đổi hợp âm)
    measure: np.ndarray  # [N] chỉ số ô
    offset: list[Fraction]  # [N] vị trí trong ô (phách đen)
    forced: np.ndarray  # [N] token hợp âm bắt buộc (ô đã có hợp âm), -1 = tự chọn


@dataclass
class Option:
    tokens: np.ndarray  # [N]
    score: float  # log xác suất trung bình của model trên các bước tự chọn


@lru_cache(maxsize=1)
def chord_table() -> list[dict]:
    return json.loads((MODEL_DIR / "chords.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _families() -> dict[str, np.ndarray]:
    table = chord_table()
    out: dict[str, list[int]] = {}
    for index, chord in enumerate(table):
        if not chord["rest"]:
            out.setdefault(chord["family"], []).append(index)
    return {k: np.array(v) for k, v in out.items()}


@lru_cache(maxsize=1)
def _symbol_index() -> dict[tuple, int]:
    """(gốc 0–11, kind, bass 0–11 hoặc None) → token, để giữ hợp âm có sẵn trong ô bị khóa."""
    out: dict[tuple, int] = {}
    for index, chord in enumerate(chord_table()):
        if chord["rest"] or chord.get("added"):
            continue
        root = (_STEP_PC[chord["root"][0]] + chord["root"][1]) % 12
        bass = chord.get("bass")
        bass_pc = None if bass is None else (_STEP_PC[bass[0]] + bass[1]) % 12
        out.setdefault((root, chord["kind"], bass_pc), index)
        out.setdefault((root, chord["kind"], None), index)
    return out


@lru_cache(maxsize=32)
def _accent_table(beats: int, beat_type: int) -> tuple[int, ...]:
    """Độ mạnh phách × 4 ở từng nốt móc kép trong ô, giống ``beatStrength`` của music21 lúc train."""
    from music21 import meter

    ts = meter.TimeSignature(f"{beats}/{beat_type}")
    cells = int(ts.barDuration.quarterLength * 4)
    return tuple(int(ts.getAccentWeight(i * 0.25, forcePositionMatch=True) * 4) for i in range(cells))


def _accent(beats: int, beat_type: int, position: Fraction) -> int:
    table = _accent_table(beats, beat_type)
    index = int(position / CELL)
    return table[index] if 0 <= index < len(table) and position % CELL == 0 else 0


def _harmony_token(harmony: ET.Element) -> int:
    step = harmony.findtext("root/root-step")
    if not step or step.strip() not in _STEP_PC:
        return -1
    root = (_STEP_PC[step.strip()] + int(float(harmony.findtext("root/root-alter") or 0))) % 12
    kind = (harmony.findtext("kind") or "major").strip()
    bass_step = harmony.findtext("bass/bass-step")
    bass = None
    if bass_step and bass_step.strip() in _STEP_PC:
        bass = (_STEP_PC[bass_step.strip()] + int(float(harmony.findtext("bass/bass-alter") or 0))) % 12
    lookup = _symbol_index()
    return lookup.get((root, kind, bass), lookup.get((root, kind, None), -1))


def build_grid(src: MelodySource) -> Grid:
    """Lưới nốt móc kép của cả bài từ bè giai điệu (khuông 1 của part đầu)."""
    layout = _measure_layout(src.part)
    events, _ = parse_part_events(src.part)
    melody_events = sorted((e for e in events if e.staff == MELODY_STAFF), key=lambda e: (e.start, -e.midi))
    key_token = int(min(15, max(1, (src.fifths or 0) + 8)))

    melody, beat, onset, cell_beat, measure_of, offsets, forced = [], [], [], [], [], [], []
    for index, info in enumerate(layout):
        cells = int(math.ceil(info.length / CELL))
        nominal = Fraction(info.beats * 4, info.beat_type)
        shift = nominal - info.length if index == 0 and info.length < nominal else Fraction(0)  # ô lấy đà
        harmonies = sorted(info.harmonies, key=lambda h: h[0])
        current_rest_onset: Optional[Fraction] = None
        for c in range(cells):
            position = c * CELL
            at = info.start + position
            sounding = [e for e in melody_events if e.start <= at < e.start + e.length]
            if sounding:
                top = max(sounding, key=lambda e: e.midi)
                note_onset = max(top.start, info.start)  # nốt nối qua vạch nhịp tính lại từ đầu ô như music21
                melody.append(top.midi)
                beat.append(_accent(info.beats, info.beat_type, note_onset - info.start + shift))
                onset.append(top.start == at)
                current_rest_onset = None
            else:
                if current_rest_onset is None:
                    current_rest_onset = position
                melody.append(0)
                beat.append(_accent(info.beats, info.beat_type, current_rest_onset + shift))
                onset.append(False)
            cell_beat.append(_accent(info.beats, info.beat_type, position + shift))
            measure_of.append(index)
            offsets.append(position)
            token = -1
            if harmonies:  # ô đã có hợp âm: giữ hợp âm đang vang ở bước này
                active = [h for pos, h in harmonies if pos <= position] or [harmonies[0][1]]
                token = _harmony_token(active[-1])
                token = token if token >= 0 else -2  # -2: khóa nhưng không đọc được, vẫn không ghi đè
            forced.append(token)
    if not melody:
        raise ChordError("NO_MELODY", "Bản nhạc không có nốt giai điệu nào để gợi ý hợp âm")
    if len(melody) > MAX_CELLS:
        raise ChordError("TOO_LONG", f"Bản nhạc quá dài để gợi ý hợp âm (tối đa {MAX_CELLS // 16} ô 4/4)")
    n = len(melody)
    return Grid(
        melody=np.array(melody, dtype=int),
        beat=np.array(beat, dtype=int),
        key=np.full(n, key_token, dtype=int),
        onset=np.array(onset, dtype=bool),
        cell_beat=np.array(cell_beat, dtype=int),
        measure=np.array(measure_of, dtype=int),
        offset=offsets,
        forced=np.array(forced, dtype=int),
    )


# ------------------------------------------------------------------------------------------------ chạy mạng


def _static_features(net: AutoHarmonizerNet, grid: Grid, cells: np.ndarray) -> np.ndarray:
    """Đầu ra 4 nhánh không phụ thuộc hợp âm (giai điệu, điều kiện, trái và phải) cho các bước ``cells``: [len, 4 × 128]."""
    pad = np.zeros(SEGMENT, dtype=int)
    melody = np.concatenate([pad, grid.melody, pad])
    beat = np.concatenate([pad, grid.beat, pad])
    key = np.concatenate([pad, grid.key, pad])
    left = cells[:, None] + np.arange(SEGMENT)[None, :]  # bước i-32 .. i-1
    right = (cells[:, None] + SEGMENT + np.arange(SEGMENT)[None, :])[:, ::-1]  # bước i .. i+31, đảo ngược

    def embed_melody(name: str, idx: np.ndarray) -> np.ndarray:
        return np.maximum(net.w[f"{name}/kernel"][melody[idx]] + net.w[f"{name}/bias"], 0.0)

    def embed_condition(name: str, idx: np.ndarray) -> np.ndarray:
        kernel = net.w[f"{name}/kernel"]  # [5 phách + 16 giọng, 5]
        return np.maximum(kernel[beat[idx]] + kernel[5 + key[idx]] + net.w[f"{name}/bias"], 0.0)

    parts = [
        net.branch_from_embedding("melody_left", embed_melody("time_distributed_1", left)),
        net.branch_from_embedding("melody_right", embed_melody("time_distributed_2", right)),
        net.branch_from_embedding("condition_left", embed_condition("time_distributed_3", left)),
        net.branch_from_embedding("condition_right", embed_condition("time_distributed_4", right)),
    ]
    return np.concatenate(parts, axis=-1)


def _normalize(probs: np.ndarray) -> np.ndarray:
    """Chuẩn hóa từng hàng; hàng đã về 0 hết (ví dụ cấm đúng hợp âm duy nhất có xác suất) thì chia đều cho mọi hợp âm."""
    probs = np.nan_to_num(np.clip(probs, 0.0, None))
    total = probs.sum(axis=1, keepdims=True)
    empty = total[:, 0] <= 1e-12
    if empty.any():
        probs[empty] = 1.0
        probs[empty, REST_TOKEN] = 0.0
        total = probs.sum(axis=1, keepdims=True)
    return probs / total


def _gamma(probs: np.ndarray, indices: np.ndarray, gamma: float) -> np.ndarray:
    """``gamma_sampling`` của tác giả cho mỗi hàng: tổng xác suất x của ``indices`` → x^tan(πγ/2), phần còn lại co giãn."""
    if gamma == 0.5 or len(indices) == 0:
        return probs
    x = probs[:, indices].sum(axis=1, keepdims=True)
    x = np.clip(x, 1e-12, 1 - 1e-12)
    target = x ** math.tan(math.pi * gamma / 2)
    out = probs.copy()
    out[:, indices] *= target / x
    mask = np.ones(probs.shape[1], dtype=bool)
    mask[indices] = False
    out[:, mask] *= (1 - target) / (1 - x)
    return _normalize(out)


def _gamma_per_row(probs: np.ndarray, rows_tokens: np.ndarray, gamma: float) -> np.ndarray:
    """Như ``_gamma`` nhưng mỗi hàng một token (hợp âm vừa chọn của từng phương án)."""
    if gamma == 0.5:
        return probs
    rows = np.arange(len(probs))
    x = np.clip(probs[rows, rows_tokens], 1e-12, 1 - 1e-12)
    target = x ** math.tan(math.pi * gamma / 2)
    out = probs * ((1 - target) / (1 - x))[:, None]
    out[rows, rows_tokens] = target
    return _normalize(out)


def _nucleus(probs: np.ndarray, temperature: float, top_p: float) -> np.ndarray:
    scaled = np.power(np.clip(probs, 1e-30, None), 1.0 / temperature)
    scaled /= scaled.sum(axis=1, keepdims=True)
    order = np.argsort(-scaled, axis=1)
    sorted_p = np.take_along_axis(scaled, order, axis=1)
    keep_sorted = np.cumsum(sorted_p, axis=1) - sorted_p < top_p  # luôn giữ hợp âm đầu tiên
    keep = np.zeros_like(keep_sorted)
    np.put_along_axis(keep, order, keep_sorted, axis=1)
    return _normalize(np.where(keep, scaled, 0.0))


def sample_options(
    grid: Grid,
    rng: np.random.Generator,
    style: str = "NATURAL",
    creativity: str = "BALANCED",
    density: str = "NORMAL",
    count: int = MAX_OPTIONS,
    net: Optional[AutoHarmonizerNet] = None,
) -> list[Option]:
    """Rút ``count`` dãy hợp âm song song, trả các dãy khác nhau xếp theo điểm giảm dần."""
    net = net or load_net()
    temperature, top_p = CREATIVITY[creativity]
    prev_gamma, min_beat, at_onsets = DENSITY[density]
    style_gammas = [(_families()[f], g) for f, g in STYLE_GAMMAS[style].items() if f in _families()]
    n = len(grid.melody)
    change_cells = np.array(
        [i for i in range(n) if grid.forced[i] == -1 and _may_change(grid, i, min_beat, at_onsets)],
        dtype=int,
    )
    static_rows = dict(zip(change_cells.tolist(), _static_features(net, grid, change_cells))) if len(change_cells) else {}

    def static_at(i: int) -> np.ndarray:
        if i not in static_rows:  # hiếm: bước giữa phách sau "không hợp âm"
            static_rows[i] = _static_features(net, grid, np.array([i]))[0]
        return static_rows[i]

    history = np.zeros((count, SEGMENT + n), dtype=int)  # 32 token "R" đệm đầu như mã gốc
    log_score = np.zeros(count)
    free_steps = 0
    chord_kernel, chord_bias = net.w["time_distributed_5/kernel"], net.w["time_distributed_5/bias"]
    for i in range(n):
        prev = history[:, i + SEGMENT - 1]
        forced = grid.forced[i]
        if forced >= 0:
            history[:, i + SEGMENT] = forced
            continue
        if forced == -2:  # ô khóa nhưng hợp âm có sẵn không có trong bảng: giữ nguyên dãy trước
            history[:, i + SEGMENT] = prev
            continue
        may_change = _may_change(grid, i, min_beat, at_onsets)
        if not may_change and (prev != REST_TOKEN).all():
            history[:, i + SEGMENT] = prev  # giữa phách: giữ hợp âm đang vang, không cần chạy mạng
            continue
        window = history[:, i : i + SEGMENT]
        chord_feat = net.branch_from_embedding("chord_left", np.maximum(chord_kernel[window] + chord_bias, 0.0))
        probs = net.head([np.repeat(static_at(i)[None, :], count, axis=0), chord_feat]).astype(np.float64)
        if grid.melody[i] != 0 and grid.beat[i] == 4:  # như mã gốc: phách mạnh có nốt thì phải có hợp âm
            probs[:, REST_TOKEN] = 0.0
            probs = _normalize(probs)
        for indices, gamma in style_gammas:
            probs = _gamma(probs, indices, gamma)
        probs = _gamma_per_row(probs, prev, prev_gamma)
        if not may_change:  # giữa phách: giữ hợp âm đang vang (trừ khi đang "không hợp âm")
            keep = prev != REST_TOKEN
            chosen = np.where(keep, prev, 0)
            if not keep.all():
                drawn = _draw(_nucleus(probs, temperature, top_p), rng)
                chosen = np.where(keep, prev, drawn)
        else:
            chosen = _draw(_nucleus(probs, temperature, top_p), rng)
        log_score += np.log(np.clip(probs[np.arange(count), chosen], 1e-12, None))
        free_steps += 1
        history[:, i + SEGMENT] = chosen
    tokens = history[:, SEGMENT:]
    scores = log_score / max(free_steps, 1)
    return [Option(tokens=tokens[k], score=float(scores[k])) for k in range(count)]


def _may_change(grid: Grid, i: int, min_beat: int, at_onsets: bool) -> bool:
    """Bước được phép đổi hợp âm: đủ mạnh phách, hoặc (mật độ dày) nốt giai điệu bắt đầu ở vị trí nốt móc đơn."""
    if i == 0 or grid.cell_beat[i] >= min_beat:
        return True
    return at_onsets and bool(grid.onset[i]) and grid.offset[i] % Fraction(1, 2) == 0


def _draw(probs: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    cumulative = np.cumsum(probs, axis=1)
    u = rng.random((len(probs), 1)) * cumulative[:, -1:]
    return np.minimum((cumulative < u).sum(axis=1), probs.shape[1] - 1)


def placements(grid: Grid, tokens: np.ndarray, locked_measures: set[int]) -> list[tuple[int, Fraction, int]]:
    """(ô, vị trí trong ô, token) ở mỗi chỗ đổi hợp âm như mã gốc (``pre_chord != cho``); bỏ "không hợp âm" và ô đã có
    hợp âm."""
    out = []
    previous = REST_TOKEN
    table = chord_table()
    for i, token in enumerate(tokens):
        token = int(token)
        measure = int(grid.measure[i])
        if token != previous and not table[token]["rest"] and measure not in locked_measures:
            out.append((measure, grid.offset[i], token))
        previous = token
    return out


def signature(grid: Grid, tokens: np.ndarray) -> tuple:
    """Dãy hợp âm theo từng ô (để nhận hai phương án trùng nhau)."""
    out = []
    for measure in sorted(set(grid.measure.tolist())):
        seq = [int(t) for t, m in zip(tokens, grid.measure) if m == measure]
        collapsed = [t for k, t in enumerate(seq) if k == 0 or t != seq[k - 1]]
        out.append(tuple(collapsed))
    return tuple(out)


def harmony_element(token: int, staves: int, staff: int) -> ET.Element:
    """Thẻ <harmony> cho một token (bỏ nốt thêm "add ..."; chữ hiển thị theo cách gõ của editor)."""
    chord = chord_table()[token]
    harmony = ET.Element("harmony")
    root = ET.SubElement(harmony, "root")
    ET.SubElement(root, "root-step").text = chord["root"][0]
    if chord["root"][1]:
        ET.SubElement(root, "root-alter").text = str(chord["root"][1])
    kind = ET.SubElement(harmony, "kind", {"text": chord["text"]})
    kind.text = chord["kind"]
    if chord.get("bass"):
        bass = ET.SubElement(harmony, "bass")
        ET.SubElement(bass, "bass-step").text = chord["bass"][0]
        if chord["bass"][1]:
            ET.SubElement(bass, "bass-alter").text = str(chord["bass"][1])
    if staves > 1:
        ET.SubElement(harmony, "staff").text = str(staff)
    return harmony


def chord_label(token: int) -> str:
    chord = chord_table()[token]
    if chord["rest"]:
        return "N.C."
    name = chord["root"][0] + {1: "#", -1: "b", 2: "##", -2: "bb"}.get(chord["root"][1], "")
    bass = ""
    if chord.get("bass"):
        bass = "/" + chord["bass"][0] + {1: "#", -1: "b", 2: "##", -2: "bb"}.get(chord["bass"][1], "")
    return name + chord["text"] + bass
