"""MIDI phản ánh cách bản nhạc được PHÁT: dấu lặp, nhà 1-2, D.C./D.S., nốt nhỏ, láy, rải, glissando và vận tốc."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from fractions import Fraction

from app.convert.midi import musicxml_to_midi_bytes
from app.convert.performance import parse_part_performance, play_order
from app.convert.score_xml import DEFAULT_VELOCITY, parse_part_events

TEMPO = 60  # 1 phách đen = 1 giây: dễ tính thời lượng ngắn


def n(step="C", octave=4, duration=4, *, chord=False, extra="", pre="", kind="quarter"):
    return (
        f"<note>{pre}{'<chord/>' if chord else ''}<pitch><step>{step}</step><octave>{octave}</octave></pitch>"
        f"<duration>{duration}</duration><voice>1</voice><type>{kind}</type>{extra}</note>"
    )


def grace(step, octave, *, slash=False, chord=False):
    slash_attr = ' slash="yes"' if slash else ""
    return (
        f"<note><grace{slash_attr}/>{'<chord/>' if chord else ''}"
        f"<pitch><step>{step}</step><octave>{octave}</octave></pitch><voice>1</voice><type>eighth</type></note>"
    )


def measure(*content: str, attrs: str = "", left: str = "", right: str = "") -> str:
    return f"<measure>{attrs}{left}{''.join(content)}{right}</measure>"


ATTRS = "<attributes><divisions>4</divisions><key><fifths>0</fifths></key></attributes>"


def score(*measures: str) -> ET.Element:
    xml = f"<score-partwise><part-list/><part id='P1'>{''.join(measures)}</part></score-partwise>"
    return ET.fromstring(xml).find("part")


def pitches(events):
    return [e.midi for e in sorted(events, key=lambda e: (e.start, e.midi))]


def run(part_):
    events, total = parse_part_performance(part_, TEMPO)
    return events, total


def test_plain_score_matches_original_parser_with_default_velocity():
    p = score(measure(n("C"), n("D"), attrs=ATTRS), measure(n("E", duration=8)))
    events, total = run(p)
    original, original_total = parse_part_events(p)
    assert [(e.staff, e.start, e.length, e.midi) for e in events] == [(e.staff, e.start, e.length, e.midi) for e in original]
    assert total == original_total
    assert {e.velocity for e in events} == {DEFAULT_VELOCITY}


def test_repeat_is_unfolded():
    fwd = '<barline location="left"><repeat direction="forward"/></barline>'
    back = '<barline location="right"><repeat direction="backward"/></barline>'
    p = score(
        measure(n("C", duration=16), attrs=ATTRS),
        measure(n("D", duration=16), left=fwd),
        measure(n("E", duration=16), right=back),
        measure(n("F", duration=16)),
    )
    assert play_order(p) == [0, 1, 2, 1, 2, 3]
    events, total = run(p)
    assert pitches(events) == [60, 62, 64, 62, 64, 65]
    assert total == Fraction(24)


def test_repeat_times_and_volta():
    fwd = '<barline location="left"><repeat direction="forward"/></barline>'
    first_start = '<barline location="left"><ending number="1" type="start"/></barline>'
    first_end = '<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>'
    second = '<barline location="left"><ending number="2" type="start"/></barline>'
    second_end = '<barline location="right"><ending number="2" type="discontinue"/></barline>'
    p = score(
        measure(n("C"), attrs=ATTRS, left=fwd),
        measure(n("D"), left=first_start, right=first_end),
        measure(n("E"), left=second, right=second_end),
        measure(n("F")),
    )
    assert play_order(p) == [0, 1, 0, 2, 3]
    back3 = '<barline location="right"><repeat direction="backward" times="3"/></barline>'
    q = score(measure(n("C"), attrs=ATTRS, left=fwd, right=back3), measure(n("D")))
    assert play_order(q) == [0, 0, 0, 1]


def test_da_capo_al_fine():
    fine = '<direction><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>'
    dc = '<direction><direction-type><words>D.C.</words></direction-type><sound dacapo="yes"/></direction>'
    p = score(measure(n("C"), attrs=ATTRS), measure(n("D"), fine), measure(n("E"), dc))
    assert play_order(p) == [0, 1, 2, 0, 1]


def test_tie_is_not_merged_across_a_repeat_jump():
    fwd = '<barline location="left"><repeat direction="forward"/></barline>'
    back = '<barline location="right"><repeat direction="backward"/></barline>'
    tie_start = '<tie type="start"/>'
    tie_stop = '<tie type="stop"/>'
    p = score(
        measure(n("C", extra=tie_start), attrs=ATTRS, left=fwd, right=back),
        measure(n("C", extra=tie_stop)),
    )
    events, _ = run(p)
    # ô 1 phát hai lần rồi mới sang ô 2: nốt nối của lần phát đầu không được dính sang ô 2, chỉ lần phát sau nối với nó
    assert [(e.start, e.length) for e in events] == [(Fraction(0), Fraction(1)), (Fraction(1), Fraction(2))]


def test_grace_note_steals_time_from_main_note():
    p = score(measure(grace("D", 4, slash=True), n("C", duration=4), attrs=ATTRS))
    events, total = run(p)
    assert sorted(pitches(events)) == [60, 62]
    by = {e.midi: e for e in events}
    assert by[62].start == 0 and by[62].length == Fraction(1, 8)
    assert by[60].start == Fraction(1, 8) and by[60].length == Fraction(1) - Fraction(1, 8)
    assert total == Fraction(1)


def test_plain_grace_takes_half_of_main_note():
    p = score(measure(grace("D", 4), n("C", duration=4), attrs=ATTRS))
    by = {e.midi: e for e in run(p)[0]}
    assert by[62].length == Fraction(1, 2)
    assert by[60].start == Fraction(1, 2)


def test_trill_alternates_with_upper_neighbour_and_ends_on_main():
    trill = "<notations><ornaments><trill-mark/></ornaments></notations>"
    p = score(measure(n("C", duration=8, extra=trill), attrs=ATTRS))  # 2 giây
    events, _ = run(p)
    seq = pitches(events)
    assert len(seq) >= 3 and len(seq) % 2 == 1
    assert seq[0] == 60 and seq[-1] == 60 and set(seq) == {60, 62}
    assert max(e.start + e.length for e in events) == Fraction(2)


def test_mordent_uses_lower_neighbour_and_key_signature():
    mordent = "<notations><ornaments><mordent/></ornaments></notations>"
    p = score(measure(n("C", duration=8, extra=mordent), attrs=ATTRS))
    assert sorted(pitches(run(p)[0])) == [59, 60, 60]
    sharp = ATTRS.replace("<fifths>0</fifths>", "<fifths>1</fifths>")  # Sol trưởng: Fa thăng
    inv = "<notations><ornaments><inverted-mordent/></ornaments></notations>"
    q = score(measure(n("E", duration=8, extra=inv), attrs=sharp))
    assert 66 in pitches(run(q)[0])


def test_short_note_with_ornament_is_played_plain():
    trill = "<notations><ornaments><trill-mark/></ornaments></notations>"
    p = score(measure(n("C", duration=1, extra=trill), attrs=ATTRS))
    events, _ = parse_part_performance(p, 240)  # 1/16 giây: quá ngắn để láy
    assert pitches(events) == [60]


def test_arpeggio_up_and_down_stagger_the_chord():
    up = "<notations><arpeggiate/></notations>"
    p = score(measure(n("C", duration=8, extra=up), n("E", duration=8, chord=True), n("G", duration=8, chord=True), attrs=ATTRS))
    events = sorted(run(p)[0], key=lambda e: e.midi)
    starts = [e.start for e in events]
    assert starts[0] == 0 and starts[0] < starts[1] < starts[2]
    assert len({e.start + e.length for e in events}) == 1
    down = "<notations><arpeggiate direction=\"down\"/></notations>"
    q = score(measure(n("C", duration=8, extra=down), n("E", duration=8, chord=True), n("G", duration=8, chord=True), attrs=ATTRS))
    by = {e.midi: e.start for e in run(q)[0]}
    assert by[67] < by[64] < by[60]


def test_glissando_runs_through_the_semitones_to_the_target():
    start = '<notations><glissando type="start" number="1"/></notations>'
    stop = '<notations><glissando type="stop" number="1"/></notations>'
    p = score(measure(n("C", duration=8, extra=start), n("G", duration=8, extra=stop), attrs=ATTRS))
    events, _ = run(p)
    first = sorted([e for e in events if e.start < 2], key=lambda e: e.start)
    assert first[0].midi == 60 and first[-1].midi < 67
    assert all(a.midi < b.midi for a, b in zip(first, first[1:]))
    assert len(first) >= 3
    assert max(e.start + e.length for e in first) == Fraction(2)
    assert [e.midi for e in events if e.start == 2] == [67]


def test_glissando_between_adjacent_semitones_is_plain():
    start = '<notations><glissando type="start" number="1"/></notations>'
    stop = '<notations><glissando type="stop" number="1"/></notations>'
    p = score(measure(n("E", duration=8, extra=start), n("F", duration=8, extra=stop), attrs=ATTRS))
    assert pitches(run(p)[0]) == [64, 65]


def dynamic(name):
    return f"<direction><direction-type><dynamics><{name}/></dynamics></direction-type></direction>"


def test_dynamics_set_velocity_until_changed():
    p = score(measure(dynamic("p"), n("C"), n("D"), dynamic("ff"), n("E"), n("F"), attrs=ATTRS))
    velocities = [e.velocity for e in sorted(run(p)[0], key=lambda e: e.start)]
    assert velocities == [54, 54, 112, 112]


def test_accent_and_sforzando_boost_a_single_note():
    accent = "<notations><articulations><accent/></articulations></notations>"
    p = score(measure(dynamic("mf"), n("C", extra=accent), n("D"), dynamic("sfz"), n("E"), n("F"), attrs=ATTRS))
    v = [e.velocity for e in sorted(run(p)[0], key=lambda e: e.start)]
    assert v[0] > 83 and v[1] == 83 and v[2] > 83 and v[3] == 83


def test_fp_drops_to_piano_after_the_note():
    p = score(measure(dynamic("fp"), n("C"), n("D"), attrs=ATTRS))
    v = [e.velocity for e in sorted(run(p)[0], key=lambda e: e.start)]
    assert v == [98, 54]


def test_crescendo_ramps_up_to_the_next_level():
    wedge_start = '<direction><direction-type><wedge type="crescendo" number="1"/></direction-type></direction>'
    wedge_stop = '<direction><direction-type><wedge type="stop" number="1"/></direction-type></direction>'
    p = score(
        measure(
            dynamic("p"),
            wedge_start,
            n("C"),
            n("D"),
            n("E"),
            wedge_stop,
            dynamic("f"),
            n("F"),
            attrs=ATTRS,
        )
    )
    v = [e.velocity for e in sorted(run(p)[0], key=lambda e: e.start)]
    assert v[0] == 54 and v[0] < v[1] < v[2] and v[3] == 98


def test_midi_bytes_use_unfolded_notes_and_velocities():
    fwd = '<barline location="left"><repeat direction="forward"/></barline>'
    back = '<barline location="right"><repeat direction="backward"/></barline>'
    xml = (
        "<score-partwise><part-list><score-part id='P1'/></part-list><part id='P1'>"
        + measure(dynamic("f"), n("C"), attrs=ATTRS, left=fwd, right=back)
        + "</part></score-partwise>"
    ).encode()
    data, stats = musicxml_to_midi_bytes(xml, TEMPO)
    assert stats.notes == 2
    assert data.count(bytes([0x90, 60, 98])) == 2
