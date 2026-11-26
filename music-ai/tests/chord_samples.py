"""MusicXML dựng tay cho test gợi ý hợp âm: một part, có thể nhiều khuông, nhịp và hóa biểu tùy chọn."""

from __future__ import annotations

from typing import Optional

HEADER = '<?xml version="1.0" encoding="utf-8"?>\n'


def n(
    step: str,
    octave: int,
    duration: int,
    *,
    staff: Optional[int] = None,
    chord: bool = False,
    ties: tuple[str, ...] = (),
    alter: int = 0,
) -> str:
    """Một nốt có cao độ."""
    return (
        "<note>"
        + ("<chord/>" if chord else "")
        + f"<pitch><step>{step}</step>"
        + (f"<alter>{alter}</alter>" if alter else "")
        + f"<octave>{octave}</octave></pitch><duration>{duration}</duration>"
        + "".join(f'<tie type="{t}"/>' for t in ties)
        + "<voice>1</voice>"
        + (f"<staff>{staff}</staff>" if staff else "")
        + "</note>"
    )


def r(duration: int, *, staff: Optional[int] = None) -> str:
    """Một dấu lặng."""
    return (
        f"<note><rest/><duration>{duration}</duration><voice>1</voice>"
        + (f"<staff>{staff}</staff>" if staff else "")
        + "</note>"
    )


def unpitched(duration: int) -> str:
    """Nốt bộ gõ (không cao độ)."""
    return (
        f"<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched>"
        f"<duration>{duration}</duration><voice>1</voice></note>"
    )


def backup(duration: int) -> str:
    return f"<backup><duration>{duration}</duration></backup>"


def harm(root: str, kind: str = "major", *, alter: int = 0, text: Optional[str] = None) -> str:
    """Một ký hiệu hợp âm."""
    return (
        f"<harmony><root><root-step>{root}</root-step>"
        + (f"<root-alter>{alter}</root-alter>" if alter else "")
        + "</root>"
        + (f'<kind text="{text}">{kind}</kind>' if text is not None else f"<kind>{kind}</kind>")
        + "</harmony>"
    )


def part_xml(
    part_id: str,
    measures: list[str],
    *,
    beats: int = 4,
    beat_type: int = 4,
    divisions: int = 1,
    fifths: int = 0,
    staves: int = 1,
) -> str:
    out = [f'<part id="{part_id}">']
    for index, content in enumerate(measures, start=1):
        out.append(f'<measure number="{index}">')
        if index == 1:
            out.append(
                f"<attributes><divisions>{divisions}</divisions><key><fifths>{fifths}</fifths></key>"
                f"<time><beats>{beats}</beats><beat-type>{beat_type}</beat-type></time>"
                + (f"<staves>{staves}</staves>" if staves > 1 else "")
                + "<clef><sign>G</sign><line>2</line></clef></attributes>"
            )
        out.append(content)
        out.append("</measure>")
    out.append("</part>")
    return "".join(out)


def score_xml(*parts: str) -> bytes:
    ids = [p.split('id="')[1].split('"')[0] for p in parts]
    part_list = "".join(f'<score-part id="{i}"><part-name>P{k}</part-name></score-part>' for k, i in enumerate(ids))
    return (
        f'{HEADER}<score-partwise version="4.0"><part-list>{part_list}</part-list>' + "".join(parts) + "</score-partwise>"
    ).encode("utf-8")


def single(measures: list[str], **kwargs) -> bytes:
    """Bản nhạc một part."""
    return score_xml(part_xml("P1", measures, **kwargs))
