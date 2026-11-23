"""Gợi ý hợp âm cho một file MusicXML (spec R3 mục 5): đọc → đoán giọng → HMM/Viterbi → chèn ``<harmony>`` → ghi file."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.chords import ChordError
from app.chords.hmm import StyleModel, emission_matrix, load_model, viterbi
from app.chords.melody import Step, load_melody
from app.chords.theory import ChordDef, Key, detect_key, nearest_state, parse_harmony, spell_root
from app.chords.writer import write_harmonies


@dataclass
class GenerateResult:
    key: str
    steps: int
    filled: int
    skipped: int
    kept_existing: int


def key_name(key: Key) -> str:
    step, alter = spell_root(key.tonic, key)
    return f"{step}{'#' if alter > 0 else 'b' if alter < 0 else ''} {key.mode}"


def generate_file(
    in_path: Path,
    out_path: Path,
    style: str,
    model: Optional[StyleModel] = None,
    replace_existing: bool = False,
) -> GenerateResult:
    """``replace_existing``: gỡ mọi ``<harmony>`` có sẵn rồi gợi ý lại cho toàn bộ bản nhạc."""
    src = load_melody(in_path.read_bytes(), strip_harmonies=replace_existing)
    steps = src.steps
    notes = [note for step in steps for note in step.notes]
    if not notes:
        raise ChordError("NO_MELODY", "Bản nhạc không có nốt giai điệu nào để gợi ý hợp âm")
    if all(step.locked for step in steps):
        raise ChordError("ALREADY_HARMONIZED", "Mọi ô nhịp đã có hợp âm")

    key = detect_key(notes, src.fifths)
    model = model or load_model(style)
    mode = model.mode(key.mode)

    allowed: list[Optional[int]] = []
    for step in steps:
        parsed = parse_harmony(step.existing, key) if step.existing is not None else None
        allowed.append(nearest_state(*parsed, mode.states) if parsed else None)

    emit = emission_matrix(steps, mode.log_emit, key)
    path = viterbi(mode.log_start, mode.log_trans, mode.log_end, emit, allowed)

    placements = _placements(steps, path, mode.states)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_name(out_path.name + ".tmp")
    before = len(src.root.findall(".//harmony"))
    tmp.write_bytes(write_harmonies(src, placements, key))
    written = len(src.root.findall(".//harmony")) - before  # hợp âm không có nốt để gắn thì bị bỏ
    os.replace(tmp, out_path)

    locked_measures = {s.measure_index for s in steps if s.locked}
    open_measures = {s.measure_index for s in steps if not s.locked}
    filled_measures = {step.measure_index for step, _ in placements}  # bước đầu ô luôn ghi được
    return GenerateResult(
        key=key_name(key),
        steps=len(steps),
        filled=written,
        skipped=len(open_measures - filled_measures),
        kept_existing=len(locked_measures),
    )


def _placements(steps: list[Step], path: list[int], states: list[ChordDef]) -> list[tuple[Step, ChordDef]]:
    """Các bước được ghi hợp âm: bỏ ô đã khóa; trong một ô, bước có cùng hợp âm với bước liền trước thì gộp."""
    out: list[tuple[Step, ChordDef]] = []
    previous: Optional[tuple[int, int]] = None  # (ô, trạng thái) của bước liền trước
    for step, state in zip(steps, path):
        current = (step.measure_index, state)
        if not step.locked and current != previous:
            out.append((step, states[state]))
        previous = current
    return out
