"""MusicXML mẫu dựng tay giống đầu ra của music21 (mỗi khuông một ``<part>``), dùng cho test chuẩn hóa và MIDI."""

from __future__ import annotations

from typing import Optional

HEADER = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" '
    '"http://www.musicxml.org/dtds/partwise.dtd">\n'
)


def note(step: str, octave: int, duration: int, *, chord: bool = False, ties: tuple[str, ...] = (), alter: int = 0) -> str:
    tie_xml = "".join(f'<tie type="{t}"/>' for t in ties)
    return (
        "<note>"
        + ("<chord/>" if chord else "")
        + f"<pitch><step>{step}</step>"
        + (f"<alter>{alter}</alter>" if alter else "")
        + f"<octave>{octave}</octave></pitch><duration>{duration}</duration>{tie_xml}<voice>1</voice><type>quarter</type></note>"
    )


def rest(duration: int) -> str:
    return f"<note><rest/><duration>{duration}</duration><voice>1</voice><type>quarter</type></note>"


def part(
    part_id: str,
    divisions: int,
    clef: tuple[str, int],
    measures: list[list[str]],
    *,
    fifths: int = 1,
    beats: int = 3,
    tempo: Optional[int] = None,
) -> str:
    out = [f'<part id="{part_id}">']
    for index, content in enumerate(measures, start=1):
        out.append(f'<measure number="{index - 1 if index == 1 else index}">')  # đánh số lệch để kiểm tra đánh lại từ 1
        if index == 1:
            out.append(
                f"<attributes><divisions>{divisions}</divisions><key><fifths>{fifths}</fifths></key>"
                f"<time><beats>{beats}</beats><beat-type>4</beat-type></time>"
                f"<clef><sign>{clef[0]}</sign><line>{clef[1]}</line></clef></attributes>"
            )
            if tempo:
                out.append(
                    f'<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>'
                    f'<per-minute>{tempo}</per-minute></metronome></direction-type><sound tempo="{tempo}"/></direction>'
                )
        out.extend(content)
        if index == len(measures):
            out.append('<barline location="right"><bar-style>light-heavy</bar-style></barline>')
        out.append("</measure>")
    out.append("</part>")
    return "".join(out)


def score(*parts: str, extra_part_list: str = "") -> bytes:
    ids = [p.split('id="')[1].split('"')[0] for p in parts]
    part_list = "".join(f'<score-part id="{i}"><part-name>Music{n}</part-name></score-part>' for n, i in enumerate(ids))
    return (
        f'{HEADER}<score-partwise version="4.0"><part-list>{extra_part_list}{part_list}</part-list>'
        + "".join(parts)
        + "</score-partwise>"
    ).encode("utf-8")


def piano_grand_staff(*, bass_first: bool = True, treble_divisions: int = 2, bass_divisions: int = 4, tempo: Optional[int] = 96) -> bytes:
    """2 ô nhịp 3/4, giọng Sol trưởng. Tay phải: G4 A4 B4 | D5 (dài 3 phách, nối) ; tay trái: G2 hợp âm B2+D3 ... """
    q_t, q_b = treble_divisions, bass_divisions
    treble = part(
        "P2",
        treble_divisions,
        ("G", 2),
        [
            [note("G", 4, q_t), note("A", 4, q_t), note("B", 4, q_t)],
            [note("D", 5, 2 * q_t, ties=("start",)), note("D", 5, q_t, ties=("stop",))],
        ],
        tempo=tempo,
    )
    bass = part(
        "P1",
        bass_divisions,
        ("F", 4),
        [
            [note("G", 2, 3 * q_b)],
            [note("B", 2, q_b), note("D", 3, q_b, chord=True), rest(2 * q_b)],
        ],
    )
    return score(bass, treble) if bass_first else score(treble, bass)


def voice_and_piano() -> bytes:
    """Như music21 xuất từ kern có ``*Ivox``/``*Ipiano``: 3 part (giọng, tay phải, tay trái), tên part Voice/Piano."""
    voice = part("P3", 1, ("G", 2), [[note("D", 5, 1), note("E", 5, 1), note("F", 5, 1, alter=1)], [note("G", 5, 3)]])
    treble = part("P2", 2, ("G", 2), [[note("G", 4, 2), note("A", 4, 2), note("B", 4, 2)], [note("D", 5, 6)]], tempo=80)
    bass = part("P1", 4, ("F", 4), [[note("G", 2, 12)], [note("D", 3, 12)]])
    ids_names = (("P3", "Voice"), ("P2", "Piano"), ("P1", "Piano"))
    part_list = "".join(f'<score-part id="{i}"><part-name>{n}</part-name></score-part>' for i, n in ids_names)
    return (
        f'{HEADER}<score-partwise version="4.0"><part-list>{part_list}</part-list>'
        # thứ tự part cố ý đặt piano trước để chắc chắn chuẩn hóa không dựa vào thứ tự của music21
        + bass + voice + treble
        + "</score-partwise>"
    ).encode("utf-8")
