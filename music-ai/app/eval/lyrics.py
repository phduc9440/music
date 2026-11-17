"""Metric cho lời ca: đúng chữ (CER/WER theo từng lời) và đúng chỗ (âm tiết gắn đúng nốt).

Vị trí so theo ``(ô nhịp, lần đánh trong ô, số lời)``; ô nhịp của bản nhận diện được quy về ô ground truth bằng chính
phép căn ô của :func:`app.eval.metrics.align_measures`, nên một ô nhạc thừa không làm sai toàn bộ lời phía sau.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.eval.score import Lyric
from app.eval.text import TextScore, cer, normalize, strip_diacritics, wer


def _key_text(text: str) -> str:
    return normalize(text, lower=True, punctuation=False)


@dataclass
class LyricsScore:
    ref_syllables: int = 0
    hyp_syllables: int = 0
    placed_ok: int = 0
    """Âm tiết đúng chữ (bỏ qua hoa/thường, dấu câu) ở đúng nốt và đúng số lời."""

    placed_ok_any_verse: int = 0
    """Âm tiết đúng chữ ở đúng nốt, không xét số lời (lỗi tách dòng lời)."""

    cer: TextScore = field(default_factory=lambda: TextScore(0, 0))
    cer_no_diacritics: TextScore = field(default_factory=lambda: TextScore(0, 0))
    wer: TextScore = field(default_factory=lambda: TextScore(0, 0))
    per_verse: dict[int, dict] = field(default_factory=dict)

    def to_dict(self) -> dict:
        ratio = lambda a, b: round(a / b, 4) if b else None  # noqa: E731
        return {
            "refSyllables": self.ref_syllables,
            "hypSyllables": self.hyp_syllables,
            "alignmentAccuracy": ratio(self.placed_ok, self.ref_syllables),
            "alignmentAccuracyAnyVerse": ratio(self.placed_ok_any_verse, self.ref_syllables),
            "cer": round(self.cer.rate, 4),
            "cerNoDiacritics": round(self.cer_no_diacritics.rate, 4),
            "wer": round(self.wer.rate, 4),
            "perVerse": self.per_verse,
        }


def compare_lyrics(
    ref: list[Lyric], hyp: list[Lyric], measure_pairs: Optional[list[tuple[Optional[int], Optional[int]]]] = None
) -> LyricsScore:
    """So lời ca. ``measure_pairs`` (từ ``align_measures``) quy ô của hyp về ô của ref; None = coi như trùng số ô."""
    hyp_to_ref: dict[int, int] = {}
    if measure_pairs is not None:
        hyp_to_ref = {h: r for r, h in measure_pairs if r is not None and h is not None}
    mapped: list[Lyric] = []
    for lyric in hyp:
        measure = hyp_to_ref.get(lyric.measure) if measure_pairs is not None else lyric.measure
        if measure is None:
            continue
        mapped.append(Lyric(measure, lyric.attack, lyric.number, lyric.text, lyric.staff))

    score = LyricsScore(ref_syllables=len(ref), hyp_syllables=len(hyp))
    exact = {(l.measure, l.attack, l.number): _key_text(l.text) for l in mapped}
    any_verse: dict[tuple, set] = {}
    for l in mapped:
        any_verse.setdefault((l.measure, l.attack), set()).add(_key_text(l.text))
    for l in ref:
        text = _key_text(l.text)
        if exact.get((l.measure, l.attack, l.number)) == text:
            score.placed_ok += 1
        if text in any_verse.get((l.measure, l.attack), set()):
            score.placed_ok_any_verse += 1

    order = lambda items: [x.text for x in sorted(items, key=lambda x: (x.measure, x.attack))]  # noqa: E731
    verses = sorted({l.number for l in ref} | {l.number for l in hyp})
    for number in verses:
        r_text = " ".join(order([l for l in ref if l.number == number]))
        h_text = " ".join(order([l for l in hyp if l.number == number]))
        c = cer(r_text, h_text, lower=True)
        c_nd = cer(strip_diacritics(r_text), strip_diacritics(h_text), lower=True)
        w = wer(r_text, h_text, lower=True, punctuation=False)
        score.cer += c
        score.cer_no_diacritics += c_nd
        score.wer += w
        score.per_verse[number] = {"cer": round(c.rate, 4), "wer": round(w.rate, 4), "refChars": c.total}
    return score
