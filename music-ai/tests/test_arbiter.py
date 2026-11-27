"""Nhiều engine: đọc MusicXML của engine khác (musicxml_measures), chạy lệnh ngoài (extra_engines), trọng tài theo ô
(arbiter)."""

from __future__ import annotations

import io
import sys
import zipfile
from fractions import Fraction

from app.omr import arbiter, extra_engines, merge, review
from app.omr.musicxml_measures import Measure, kern_pitch, read_bytes, read_file, recip, to_kern_lines
from tests.kern_samples import kern

PIANO_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
 <measure number="1">
  <attributes><divisions>6</divisions><staves>2</staves></attributes>
  <note><pitch><step>C</step><octave>5</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff></note>
  <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff></note>
  <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
  <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
  <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
  <note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>6</duration><tie type="start"/><voice>1</voice><staff>1</staff></note>
  <backup><duration>24</duration></backup>
  <note><pitch><step>C</step><octave>3</octave></pitch><duration>24</duration><voice>5</voice><staff>2</staff></note>
 </measure>
 <measure number="2">
  <note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>12</duration><tie type="stop"/><voice>1</voice><staff>1</staff></note>
  <note><rest/><duration>12</duration><voice>1</voice><staff>1</staff></note>
  <backup><duration>24</duration></backup>
  <note><pitch><step>G</step><octave>2</octave></pitch><duration>24</duration><voice>5</voice><staff>2</staff></note>
 </measure>
</part></score-partwise>"""


def test_recip_and_pitch_spelling():
    assert recip(Fraction(1, 4)) == "4" and recip(Fraction(3, 8)) == "4." and recip(Fraction(1, 12)) == "12"
    assert recip(Fraction(3, 4)) == "2." and recip(Fraction(2)) == "0" and recip(Fraction(5, 8)) is None
    assert kern_pitch("C", 0, 4) == "c" and kern_pitch("C", 0, 5) == "cc" and kern_pitch("B", -1, 3) == "B-"
    assert kern_pitch("F", 1, 4) == "f#" and kern_pitch("G", 0, 2) == "GG"


def test_piano_measure_becomes_kern_rows_with_bass_on_the_left():
    measures = read_bytes(PIANO_XML)
    assert len(measures) == 2 and len(measures[0].staves) == 2 and not measures[0].multi_voice
    rows = to_kern_lines(measures[0], 2)
    assert rows == ["1C\t2cc 2ee", ".\t12f#", ".\t12g", ".\t12a", ".\t[4b-"]
    assert to_kern_lines(measures[1], 2) == ["1GG\t2b-]", ".\t2r"]
    assert to_kern_lines(measures[0], 3) is None  # số khuông khác số spine


def test_compressed_musicxml_and_two_voices_on_one_staff():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "META-INF/container.xml",
            '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>',
        )
        archive.writestr("score.xml", PIANO_XML.decode().replace("<voice>5</voice><staff>2</staff>", "<voice>2</voice><staff>1</staff>"))
    measures = read_bytes(PIANO_XML)
    assert measures[0].staves[1]
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "x.mxl"
        path.write_bytes(buffer.getvalue())
        two_voices = read_file(path)
    assert two_voices[0].multi_voice and to_kern_lines(two_voices[0], 2) is None


def _merged(*measures: str) -> merge.MergeResult:
    rows = ["**kern", "*clefG2", "*M2/4"]
    for number, notes in enumerate(measures, start=1):
        rows += notes.split()
        rows.append("==" if number == len(measures) else f"={number + 1}")
    rows.append("*-")
    page, _ = merge.clean_page(1, kern(*rows))
    return merge.merge_pages([page])


def _melody_xml(*measures: list[tuple[str, int, int]]) -> list[Measure]:
    """Ô một khuông từ danh sách (bậc, quãng tám, trường độ theo móc đơn)."""
    parts = []
    for notes in measures:
        body = "".join(
            f"<note><pitch><step>{step}</step><octave>{octave}</octave></pitch><duration>{eighths}</duration></note>"
            for step, octave, eighths in notes
        )
        parts.append(f'<measure number="1">{body}</measure>')
    xml = (
        '<score-partwise><part id="P1"><measure number="0"><attributes><divisions>2</divisions></attributes></measure>'
        + "".join(parts)
        + "</part></score-partwise>"
    )
    return read_bytes(xml.encode())  # ô "0" chỉ có attributes bị bỏ


def test_arbiter_replaces_wrong_duration_flags_disagreement_and_rewards_agreement():
    # ô 1 giống nhau; ô 2 máy chính thiếu chấm dôi (3/8 trong 2/4); ô 3 hai bên đều đủ nhịp nhưng khác nốt
    merged = _merged("4c 4d", "4e 8f", "4g 4a", "2c")
    entries = [{"measure": m, "page": 1, "flags": [], "box": None} for m in range(1, 5)]
    entries[1]["flags"] = [review.FLAG_DURATION]  # measure_map.build gắn cờ này cho ô sai trường độ
    review.annotate(entries, merged)
    other = _melody_xml(
        [("C", 4, 2), ("D", 4, 2)], [("E", 4, 3), ("F", 4, 1)], [("G", 4, 2), ("B", 4, 2)], [("C", 4, 4)]
    )
    run = extra_engines.EngineRun(engine="copisteria", page=1, measures=other, seconds=2.0)
    fixed, report = arbiter.consult(merged, entries, [run])
    assert (report.compared, report.agreed, report.replaced, report.disagreed) == (4, 2, 1, 1)
    assert "4.e" in fixed.lines and "8f" in fixed.lines
    assert entries[1]["_replaced"] and review.FLAG_DURATION not in entries[1]["flags"]
    assert arbiter.FLAG_ENGINE in entries[2]["flags"] and entries[2]["_alternatives"]
    review.annotate(entries, fixed)
    assert entries[0]["confidence"] == 1.0 and entries[2]["confidence"] < review.REVIEW_THRESHOLD
    assert report.notes == [arbiter.replaced_message(1, 2, "copisteria")]
    from app.omr import messages

    item = messages.fix_item(report.notes[0])
    assert item["code"] == "ENGINE_REPLACED" and item["params"] == {"engine": "copisteria"} and item["measures"] == [2]


def test_pdf_evidence_decides_between_two_readings_with_correct_durations():
    # ô 2: cả hai cách đọc đều đủ 2/4, nhưng PDF vector có nốt Fa (vị trí 1 trên khóa Sol) chứ không phải Sol
    merged = _merged("4c 4d", "4e 4g")
    entries = [{"measure": m, "page": 1, "flags": [], "box": None} for m in (1, 2)]
    entries[1]["_glyph"] = {"heads": 2, "dots": 0, "staves": [[0, 1]]}
    review.annotate(entries, merged)
    assert review.FLAG_PDF in entries[1]["flags"]
    other = _melody_xml([("C", 4, 2), ("D", 4, 2)], [("E", 4, 2), ("F", 4, 2)])
    fixed, report = arbiter.consult(merged, entries, [extra_engines.EngineRun(engine="homr", page=1, measures=other)])
    assert report.replaced == 1 and report.disagreed == 0 and "4f" in fixed.lines
    assert report.notes == [arbiter.replaced_message(1, 2, "homr", by_pdf=True)]
    review.annotate(entries, fixed)
    assert review.FLAG_PDF not in entries[1]["flags"]


def test_page_with_a_different_measure_count_is_skipped():
    merged = _merged("4c 4d", "2e")
    entries = [{"measure": m, "page": 1, "flags": []} for m in (1, 2)]
    run = extra_engines.EngineRun(engine="homr", page=1, measures=_melody_xml([("C", 4, 4)]))
    fixed, report = arbiter.consult(merged, entries, [run])
    assert fixed is merged and report.compared == 0 and report.skipped_pages


def test_run_page_reads_the_musicxml_written_by_the_command(tmp_path, monkeypatch):
    script = tmp_path / "fake_engine.py"
    script.write_text(
        "import sys, pathlib\n"
        "out = pathlib.Path(sys.argv[2]) / 'sub'\n"
        "out.mkdir()\n"
        f"(out / 'page.musicxml').write_bytes({PIANO_XML!r})\n",
        encoding="utf-8",
    )
    image = tmp_path / "page.png"
    image.write_bytes(b"png")
    monkeypatch.setenv("OMR_ENGINE_FAKE_COMMAND", f"{sys.executable} {script} {{image}} {{outdir}}")
    engines = extra_engines.configured(("fake", "missing"))
    assert [name for name, _cmd, _cwd in engines] == ["fake"]
    name, command, cwd = engines[0]
    run = extra_engines.run_page(name, command, cwd, image, 3, lambda: None, 30)
    assert run.error is None and len(run.measures) == 2 and run.page == 3

    failing = extra_engines.run_page("bad", f"{sys.executable} -c 'raise SystemExit(2)'", None, image, 1, lambda: None, 30)
    assert failing.error and "mã 2" in failing.error
