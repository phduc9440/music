"""Gợi ý hợp âm cho một file MusicXML: đọc giai điệu → AutoHarmonizer lấy mẫu vài phương án → chèn ``<harmony>`` → ghi file.

Phương án A (hợp tai nhất theo model) ghi ra ``out_path``, các phương án sau ghi ra ``<tên>-2.musicxml``,
``<tên>-3.musicxml`` cạnh đó. Mỗi lần chạy ra kết quả khác (lấy mẫu); truyền ``seed`` để tái hiện đúng một lần chạy.
"""

from __future__ import annotations

import copy
import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

from app.chords import ChordError
from app.chords.autoharmonizer.harmonize import (
    CREATIVITY,
    DENSITY,
    MAX_OPTIONS,
    STYLES,
    build_grid,
    harmony_element,
    placements,
    sample_options,
    signature,
)
from app.chords.melody import MelodySource, load_melody
from app.chords.theory import detect_key, key_name
from app.chords.writer import divisions_per_measure, insert_harmony, serialize

EXTRA_ROUNDS = 3  # số lượt rút thêm khi các phương án trùng nhau


@dataclass
class OptionResult:
    out_path: Path
    filled: int
    score: float


@dataclass
class GenerateResult:
    key: str
    steps: int
    filled: int
    skipped: int
    kept_existing: int
    seed: int
    options: list[OptionResult] = field(default_factory=list)


def option_path(out_path: Path, index: int) -> Path:
    """Đường dẫn của phương án thứ ``index`` (0 là ``out_path``, 1 → ``-2``, 2 → ``-3``)."""
    return out_path if index == 0 else out_path.with_name(f"{out_path.stem}-{index + 1}{out_path.suffix}")


def generate_file(
    in_path: Path,
    out_path: Path,
    style: str = "POP",
    *,
    creativity: str = "BALANCED",
    density: str = "NORMAL",
    options: int = MAX_OPTIONS,
    seed: Optional[int] = None,
    replace_existing: bool = False,
) -> GenerateResult:
    """``replace_existing``: gỡ mọi ``<harmony>`` có sẵn rồi gợi ý lại cả bài (mặc định giữ ô đã có hợp âm)."""
    style, creativity, density = style.upper(), creativity.upper(), density.upper()
    if style not in STYLES or creativity not in CREATIVITY or density not in DENSITY:
        raise ChordError("PARSE_ERROR", "Phong cách, độ sáng tạo hoặc mật độ không hợp lệ")
    options = max(1, min(MAX_OPTIONS, options))
    src = load_melody(in_path.read_bytes(), strip_harmonies=replace_existing)
    notes = [note for step in src.steps for note in step.notes]
    if not notes:
        raise ChordError("NO_MELODY", "Bản nhạc không có nốt giai điệu nào để gợi ý hợp âm")
    if all(step.locked for step in src.steps):
        raise ChordError("ALREADY_HARMONIZED", "Mọi ô nhịp đã có hợp âm")

    locked = {s.measure_index for s in src.steps if s.locked}
    open_measures = {s.measure_index for s in src.steps if not s.locked}
    grid = build_grid(src)
    seed = secrets.randbits(32) if seed is None else int(seed) & 0xFFFFFFFF
    rng = np.random.default_rng(seed)

    # Rút song song rồi bỏ phương án trùng (cùng hợp âm ở mọi ô) hoặc không thêm được hợp âm nào; thiếu thì rút thêm
    chosen: dict[tuple, object] = {}
    for _ in range(1 + EXTRA_ROUNDS):
        for option in sample_options(grid, rng, style, creativity, density, count=options):
            if not placements(grid, option.tokens, locked):
                continue
            key = signature(grid, option.tokens)
            if key not in chosen or option.score > chosen[key].score:
                chosen[key] = option
        if len(chosen) >= options:
            break
    ranked = sorted(chosen.values(), key=lambda o: -o.score)[:options]
    if not ranked:
        raise ChordError("NO_CHORDS", "Không đặt được hợp âm nào cho giai điệu này")

    results = []
    first_filled_measures: set[int] = set()
    for index, option in enumerate(ranked):
        target = option_path(out_path, index)
        filled, measures = _write(src, grid, option.tokens, locked, target)
        if index == 0:
            first_filled_measures = measures
        results.append(OptionResult(out_path=target, filled=filled, score=round(option.score, 4)))

    return GenerateResult(
        key=key_name(detect_key(notes, src.fifths)),
        steps=len(grid.melody),
        filled=results[0].filled,
        skipped=len(open_measures - first_filled_measures),
        kept_existing=len(locked),
        seed=seed,
        options=results,
    )


def _write(src: MelodySource, grid, tokens, locked: set[int], target: Path) -> tuple[int, set[int]]:
    """Chèn hợp âm của một phương án vào bản sao của XML gốc rồi ghi ra ``target``; trả (số hợp âm ghi được, các ô có)."""
    root = copy.deepcopy(src.root)
    part = root.findall("part")[src.root.findall("part").index(src.part)]
    measures = part.findall("measure")
    divisions = divisions_per_measure(measures)
    written = 0
    filled_measures: set[int] = set()
    for measure_index, offset, token in placements(grid, tokens, locked):
        harmony = harmony_element(token, src.staves, src.staff)
        if insert_harmony(measures[measure_index], divisions[measure_index], offset, harmony, src.staff):
            written += 1
            filled_measures.add(measure_index)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".tmp")
    tmp.write_bytes(serialize(src.prolog, root))
    os.replace(tmp, target)
    return written, filled_measures
