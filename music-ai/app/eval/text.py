"""Khoảng cách chỉnh sửa (Levenshtein) dùng cho SER trong :mod:`app.eval.metrics`."""

from __future__ import annotations

from typing import Sequence


def edit_distance(ref: Sequence, hyp: Sequence) -> int:
    """Khoảng cách Levenshtein (chèn/xóa/thay đều tốn 1)."""
    if len(ref) < len(hyp):
        ref, hyp = hyp, ref
    previous = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, start=1):
        current = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, start=1):
            current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (r != h))
        previous = current
    return previous[-1]
