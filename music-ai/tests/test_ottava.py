"""Bỏ *8va model tự thêm (app/omr/ottava.py): đúng phạm vi một lần đọc, đúng khuông, đúng quãng tám."""

from pathlib import Path

from app.eval.metrics import compare
from app.eval.score import load_score, read_kern
from app.omr import merge
from app.omr.ottava import drop_rule, fix_text, shift_token

GT_DANG = Path(__file__).resolve().parents[1] / "benchmark" / "gt" / "dang" / "score.krn"


def test_shift_token_octaves_and_chords():
    assert shift_token("2gg 2bb-", -12) == "2g 2b-"
    assert shift_token("4c", -12) == "4C"
    assert shift_token("4CC", 12) == "4C"
    assert shift_token("4r", -12) == "4r"
    assert shift_token("8ddd#L", -12) == "8dd#L"


def test_fix_text_single_staff_drops_and_shifts():
    raw = "*clefG2\n*k[b-]\n*8va\n2gg 2bb-\n4cc 4gg\n=\n*X8va\n2.f\n="
    fixed, shifted = fix_text(raw, "auto", None)
    assert shifted == 2
    assert "8va" not in fixed
    assert "2g 2b-" in fixed and "4c 4g" in fixed and "2.f" in fixed


def test_fix_text_keeps_piano_staff_8va():
    raw = "**kern\t**kern\n*clefF4\t*clefG2\n*\t*8va\n2C\t2gg\n=\t=\n*-\t*-"
    fixed, shifted = fix_text(raw, "auto", ["PIANO", "PIANO"])
    assert shifted == 0 and fixed == raw
    fixed, shifted = fix_text(raw, "drop", None)
    assert shifted == 1 and "2g" in fixed


def test_fix_text_vocal_staff_in_voice_and_piano():
    raw = "**kern\t**kern\t**kern\n*clefF4\t*clefG2\t*clefG2\n*\t*\t*8va\n2C\t2e\t2gg\n=\t=\t=\n*-\t*-\t*-"
    fixed, shifted = fix_text(raw, "auto", ["SINGLE", "PIANO", "PIANO"])
    assert shifted == 1
    assert "2C\t2e\t2g" in fixed


def test_keep_mode_and_rule():
    raw = "*clefG2\n*8va\n4gg\n="
    assert fix_text(raw, "keep", None) == (raw, 0)
    assert drop_rule("auto", None, 1)(0) is True
    assert drop_rule("auto", None, 2)(0) is False


def test_dang_system5_real_output_fixed():
    """Kern thật Transcoda sinh cho hệ 5 bài "Dâng" (``*8va`` ảo): sau khi sửa, ô 22-26 khớp ground truth."""
    raw = (
        "*clefG2\n*k[b-]\n*8va\n2gg 2bb-\n4cc 4gg\n=\n4gg 4bb-\n4bb- 4ddd\n4aa 4ccc\n=\n2.ff 2.aa\n=\n"
        "2ff 2aa\n4gg 4bb-\n=\n2aa 2ccc\n4ff 4aa\n="
    )
    fixed, shifted = fix_text(raw, "auto", ["SINGLE"])
    assert shifted == 10
    page, _ = merge.clean_page(1, fixed)
    hyp = read_kern(merge.merge_pages([page]).text)
    ref = load_score(GT_DANG)
    ref_slice = read_kern(
        "**kern\n*clefG2\n*k[b-]\n"
        + "\n".join(
            line
            for m in range(22, 27)
            for line in [f"{_kern_measure(ref, m)}", f"={m - 21}"]
        )
        + "\n*-\n"
    )
    assert compare(ref_slice, hyp).note_f1 == 1.0


def _kern_measure(score, measure):
    events = [e for e in score.measure_events(measure)]
    rows = {}
    for e in events:
        rows.setdefault(e.onset, []).append(e)
    names = "C C# D E- E F F# G G# A B- B".split()
    out = []
    for onset in sorted(rows):
        toks = []
        for e in rows[onset]:
            octave = e.midi // 12 - 1
            name = names[e.midi % 12]
            letter, acc = name[0], name[1:]
            pitch = letter.lower() * (octave - 3) if octave >= 4 else letter.upper() * (4 - octave)
            dur = {1: "4", 2: "2", 3: "2."}[int(e.duration)]
            toks.append(f"{dur}{pitch}{acc.replace('E-', '-')}")
        out.append(" ".join(toks))
    return "\n".join(out)
