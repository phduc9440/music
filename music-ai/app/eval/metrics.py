"""Metric cho phần ký hiệu nhạc: nốt, cao độ, trường độ, hợp âm, dấu lặng, cấu trúc ô nhịp, SER.

Vì sao phải căn ô nhịp trước: lỗi hay gặp nhất của model đọc cả trang là sinh lặp/bỏ sót cả ô nhịp. So theo số ô tuyệt
đối thì một ô thừa ở đầu làm mọi ô phía sau "sai" dù nốt đúng. :func:`align_measures` căn hai dãy ô nhịp bằng quy hoạch
động (Needleman-Wunsch) theo độ giống nhau nội dung, ô thừa/thiếu được tính riêng (``extraMeasures``/``missingMeasures``),
còn nốt chỉ so trong các cặp ô đã căn. Nhờ vậy tách được "nhận diện đúng ký hiệu" với "khôi phục đúng cấu trúc".

SER (Symbol Error Rate) tính trên chuỗi ký hiệu chuẩn hóa của cả bản (không căn), nên phạt cả lỗi cấu trúc.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

from app.eval.score import NoteEvent, ScoreData
from app.eval.text import edit_distance

_GAP_THRESHOLD = 0.2
"""Cặp ô giống nhau dưới mức này thì thà coi là một ô thừa + một ô thiếu còn hơn ghép cặp."""


def _note_key(e: NoteEvent) -> tuple:
    return (e.onset, e.staff, e.midi)


def _full_key(e: NoteEvent) -> tuple:
    return (e.onset, e.staff, e.midi, e.duration)


def _rhythm_key(e: NoteEvent) -> tuple:
    return (e.onset, e.staff, e.duration, e.is_rest)


def _dice(a: Counter, b: Counter) -> float:
    total = sum(a.values()) + sum(b.values())
    if total == 0:
        return 1.0
    return 2.0 * sum((a & b).values()) / total


def measure_similarity(ref: list[NoteEvent], hyp: list[NoteEvent]) -> float:
    """Độ giống nhau 0..1 của hai ô: nửa theo nốt đầy đủ, nửa theo nhịp điệu (thời điểm, trường độ)."""
    full = _dice(Counter(map(_full_key, ref)), Counter(map(_full_key, hyp)))
    rhythm = _dice(Counter(map(_rhythm_key, ref)), Counter(map(_rhythm_key, hyp)))
    return 0.5 * full + 0.5 * rhythm


def align_measures(ref: ScoreData, hyp: ScoreData) -> list[tuple[Optional[int], Optional[int]]]:
    """Căn ô nhịp: trả danh sách cặp ``(ô_ref, ô_hyp)``; ``None`` ở một phía là ô thiếu/thừa."""
    rm, hm = ref.by_measure(), hyp.by_measure()
    n, m = ref.measures, hyp.measures
    sim = [[measure_similarity(rm.get(i + 1, []), hm.get(j + 1, [])) for j in range(m)] for i in range(n)]
    score = [[0.0] * (m + 1) for _ in range(n + 1)]
    move = [[""] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        move[i][0] = "u"
    for j in range(1, m + 1):
        move[0][j] = "l"
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            diag = score[i - 1][j - 1] + sim[i - 1][j - 1] - _GAP_THRESHOLD
            up = score[i - 1][j]
            left = score[i][j - 1]
            best = max(diag, up, left)
            score[i][j] = best
            move[i][j] = "d" if best == diag else ("u" if best == up else "l")
    pairs: list[tuple[Optional[int], Optional[int]]] = []
    i, j = n, m
    while i > 0 or j > 0:
        step = move[i][j]
        if step == "d":
            pairs.append((i, j))
            i, j = i - 1, j - 1
        elif step == "u":
            pairs.append((i, None))
            i -= 1
        else:
            pairs.append((None, j))
            j -= 1
    pairs.reverse()
    return pairs


@dataclass
class MusicScore:
    """Kết quả so một bản nhận diện với ground truth. Mọi tỉ lệ trong 0..1."""

    ref_notes: int = 0
    hyp_notes: int = 0
    notes_matched: int = 0
    """Nốt đúng (ô đã căn, đúng thời điểm, đúng khuông, đúng cao độ)."""

    notes_full_matched: int = 0
    """Như trên và đúng cả trường độ."""

    onset_matched: int = 0
    """Nốt ref có nốt hyp cùng ô/thời điểm/khuông (dù sai cao độ)."""

    pitch_errors: int = 0
    octave_errors: int = 0
    accidental_errors: int = 0
    duration_errors: int = 0
    ref_rests: int = 0
    rests_matched: int = 0
    ref_chords: int = 0
    chords_matched: int = 0
    ref_measures: int = 0
    hyp_measures: int = 0
    measures_exact: int = 0
    extra_measures: int = 0
    missing_measures: int = 0
    staves_ok: bool = True
    key_ok: Optional[bool] = None
    time_ok: Optional[bool] = None
    ser_errors: int = 0
    ser_total: int = 0
    measure_pairs: list[tuple[Optional[int], Optional[int]]] = field(default_factory=list)
    per_measure: list[dict] = field(default_factory=list)

    # ---- tỉ lệ
    @staticmethod
    def _ratio(a: int, b: int) -> float:
        return a / b if b else (1.0 if a == 0 else 0.0)

    @property
    def note_precision(self) -> float:
        return self._ratio(self.notes_matched, self.hyp_notes)

    @property
    def note_recall(self) -> float:
        return self._ratio(self.notes_matched, self.ref_notes)

    @property
    def note_f1(self) -> float:
        p, r = self.note_precision, self.note_recall
        return 2 * p * r / (p + r) if p + r else 0.0

    @property
    def pitch_accuracy(self) -> float:
        """Trong các nốt đọc đúng vị trí (thời điểm), tỉ lệ đúng cao độ."""
        return self._ratio(self.notes_matched, self.onset_matched)

    @property
    def duration_accuracy(self) -> float:
        """Trong các nốt đúng cao độ, tỉ lệ đúng trường độ."""
        return self._ratio(self.notes_full_matched, self.notes_matched)

    @property
    def ser(self) -> float:
        return self._ratio(self.ser_errors, self.ser_total)

    def to_dict(self) -> dict:
        return {
            "noteF1": round(self.note_f1, 4),
            "notePrecision": round(self.note_precision, 4),
            "noteRecall": round(self.note_recall, 4),
            "noteFullAccuracy": round(self._ratio(self.notes_full_matched, self.ref_notes), 4),
            "pitchAccuracy": round(self.pitch_accuracy, 4),
            "durationAccuracy": round(self.duration_accuracy, 4),
            "restRecall": round(self._ratio(self.rests_matched, self.ref_rests), 4),
            "chordAccuracy": round(self._ratio(self.chords_matched, self.ref_chords), 4) if self.ref_chords else None,
            "measureExactRate": round(self._ratio(self.measures_exact, self.ref_measures), 4),
            "ser": round(self.ser, 4),
            "counts": {
                "refNotes": self.ref_notes,
                "hypNotes": self.hyp_notes,
                "notesMatched": self.notes_matched,
                "pitchErrors": self.pitch_errors,
                "octaveErrors": self.octave_errors,
                "accidentalErrors": self.accidental_errors,
                "durationErrors": self.duration_errors,
                "refRests": self.ref_rests,
                "refChords": self.ref_chords,
                "refMeasures": self.ref_measures,
                "hypMeasures": self.hyp_measures,
                "extraMeasures": self.extra_measures,
                "missingMeasures": self.missing_measures,
            },
            "structure": {"stavesOk": self.staves_ok, "keyOk": self.key_ok, "timeOk": self.time_ok},
        }


def symbol_sequence(score: ScoreData) -> list[str]:
    """Chuỗi ký hiệu chuẩn dùng cho SER: ``|`` mỗi ô, ``/`` giữa các khuông, mỗi nốt ``cao_độ:trường_độ``."""
    out: list[str] = []
    grouped = score.by_measure()
    for measure in range(1, score.measures + 1):
        out.append("|")
        events = grouped.get(measure, [])
        for staff in range(1, score.staves + 1):
            if staff > 1:
                out.append("/")
            staff_events = sorted(
                (e for e in events if e.staff == staff), key=lambda e: (e.onset, e.midi if e.midi is not None else -1)
            )
            for e in staff_events:
                out.append(f"{'r' if e.is_rest else e.midi}:{e.duration}")
    return out


def compare(ref: ScoreData, hyp: ScoreData) -> MusicScore:
    """So bản nhận diện ``hyp`` với ground truth ``ref``."""
    result = MusicScore(ref_measures=ref.measures, hyp_measures=hyp.measures)
    result.staves_ok = ref.staves == hyp.staves
    if ref.key_fifths is not None:
        result.key_ok = ref.key_fifths == hyp.key_fifths
    if ref.time_signature is not None:
        result.time_ok = ref.time_signature == hyp.time_signature
    rm, hm = ref.by_measure(), hyp.by_measure()

    pairs = align_measures(ref, hyp)
    result.measure_pairs = pairs
    result.ref_notes = sum(1 for e in ref.events if not e.is_rest)
    result.hyp_notes = sum(1 for e in hyp.events if not e.is_rest)
    result.ref_rests = sum(1 for e in ref.events if e.is_rest)

    for r_index, h_index in pairs:
        if r_index is None:
            result.extra_measures += 1
            result.per_measure.append({"ref": None, "hyp": h_index, "status": "EXTRA"})
            continue
        if h_index is None:
            result.missing_measures += 1
            result.per_measure.append({"ref": r_index, "hyp": None, "status": "MISSING"})
            continue
        r_events, h_events = rm.get(r_index, []), hm.get(h_index, [])
        stats = _compare_measure(r_events, h_events)
        for key, value in stats.items():
            setattr(result, key, getattr(result, key) + value)
        exact = Counter(map(_full_key, r_events)) == Counter(map(_full_key, h_events))
        result.measures_exact += int(exact)
        result.per_measure.append(
            {"ref": r_index, "hyp": h_index, "status": "OK" if exact else "DIFF", **{k: v for k, v in stats.items() if v}}
        )

    # Hợp âm của ô bị thiếu cũng tính là đọc sai: đếm tổng trên cả bản
    result.ref_chords = _count_chords(ref.events)

    ref_seq, hyp_seq = symbol_sequence(ref), symbol_sequence(hyp)
    result.ser_errors = edit_distance(ref_seq, hyp_seq)
    result.ser_total = len(ref_seq)
    return result


def _compare_measure(ref: list[NoteEvent], hyp: list[NoteEvent]) -> dict[str, int]:
    stats = Counter()
    r_notes = [e for e in ref if not e.is_rest]
    h_notes = [e for e in hyp if not e.is_rest]
    h_note_keys = Counter(map(_note_key, h_notes))
    h_full_keys = Counter(map(_full_key, h_notes))
    h_by_slot: dict[tuple, list[NoteEvent]] = {}
    for e in h_notes:
        h_by_slot.setdefault((e.onset, e.staff), []).append(e)

    for e in r_notes:
        slot = h_by_slot.get((e.onset, e.staff))
        if slot:
            stats["onset_matched"] += 1
        if h_note_keys[_note_key(e)] > 0:
            h_note_keys[_note_key(e)] -= 1
            stats["notes_matched"] += 1
            if h_full_keys[_full_key(e)] > 0:
                h_full_keys[_full_key(e)] -= 1
                stats["notes_full_matched"] += 1
            else:
                stats["duration_errors"] += 1
        elif slot:
            stats["pitch_errors"] += 1
            pitches = {x.midi for x in slot}
            if any(p is not None and p != e.midi and (p - e.midi) % 12 == 0 for p in pitches):
                stats["octave_errors"] += 1
            elif any(p is not None and abs(p - e.midi) == 1 for p in pitches):
                stats["accidental_errors"] += 1

    # Dấu lặng: đúng thời điểm, khuông và trường độ
    h_rests = Counter((e.onset, e.staff, e.duration) for e in hyp if e.is_rest)
    for e in ref:
        if e.is_rest and h_rests[(e.onset, e.staff, e.duration)] > 0:
            h_rests[(e.onset, e.staff, e.duration)] -= 1
            stats["rests_matched"] += 1

    # Hợp âm: nhóm >= 2 nốt cùng thời điểm, cùng khuông, phải đúng nguyên tập cao độ
    def groups(events: list[NoteEvent]) -> dict[tuple, frozenset]:
        out: dict[tuple, set] = {}
        for x in events:
            out.setdefault((x.onset, x.staff), set()).add(x.midi)
        return {k: frozenset(v) for k, v in out.items()}

    r_groups, h_groups = groups(r_notes), groups(h_notes)
    for slot, pitches in r_groups.items():
        if len(pitches) >= 2:
            stats["chords_matched"] += int(h_groups.get(slot) == pitches)
    return dict(stats)


def _count_chords(events: list[NoteEvent]) -> int:
    slots: dict[tuple, set] = {}
    for e in events:
        if not e.is_rest:
            slots.setdefault((e.measure, e.onset, e.staff), set()).add(e.midi)
    return sum(1 for pitches in slots.values() if len(pitches) >= 2)
