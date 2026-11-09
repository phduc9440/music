"""Chuẩn hóa MusicXML và ghi MIDI: chỉ dùng thư viện chuẩn nên chạy được khi chưa cài music21."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from fractions import Fraction

import pytest

from app.convert.errors import ConversionError
from app.convert.midi import musicxml_file_to_midi_file, musicxml_to_midi_bytes
from app.convert.musicxml import normalize_musicxml
from app.convert.score_xml import parse_part_events
from tests.xml_samples import note, part, piano_grand_staff, score


def parse(result):
    return ET.fromstring(result.xml)


# ---------------------------------------------------------------- chuẩn hóa


def test_two_parts_become_one_piano_part_with_two_staves():
    result = normalize_musicxml(piano_grand_staff(bass_first=True))
    root = parse(result)

    assert [p.get("id") for p in root.findall("part")] == ["P1"]
    assert [e.text for e in root.findall("part-list/score-part/part-name")] == ["Piano"]
    assert root.find("part-list/part-group") is None
    assert (result.measure_count, result.staff_count) == (2, 2)
    assert (result.key_signature, result.time_signature, result.tempo_bpm) == ("G", "3/4", 96)

    measures = root.findall("part/measure")
    assert [m.get("number") for m in measures] == ["1", "2"]  # đánh lại từ 1 dù đầu vào bắt đầu từ 0
    attrs = measures[0].find("attributes")
    assert attrs.find("staves").text == "2"
    assert [(c.get("number"), c.find("sign").text) for c in attrs.findall("clef")] == [("1", "G"), ("2", "F")]
    # thứ tự lược đồ: divisions, key, time, staves, clef
    assert [c.tag for c in attrs] == ["divisions", "key", "time", "staves", "clef", "clef"]


def test_part_order_does_not_depend_on_input_order():
    for bass_first in (True, False):
        events, _ = parse_part_events(ET.fromstring(normalize_musicxml(piano_grand_staff(bass_first=bass_first)).xml).find("part"))
        staff_of = {e.midi: e.staff for e in events}
        assert staff_of[67] == 1 and staff_of[43] == 2  # G4 ở staff 1, G2 ở staff 2


def test_events_survive_merge_with_different_divisions():
    """Hai khuông dùng divisions khác nhau (2 và 4): sau khi gộp, vị trí và độ dài (phách đen) phải giữ nguyên."""
    result = normalize_musicxml(piano_grand_staff(treble_divisions=2, bass_divisions=4))
    events, total = parse_part_events(parse(result).find("part"))
    got = [(e.staff, e.midi, e.start, e.length) for e in events]
    assert total == 6  # 2 ô nhịp 3/4
    assert (1, 67, Fraction(0), Fraction(1)) in got  # G4 phách 1
    assert (1, 74, Fraction(3), Fraction(3)) in got  # D5 dài 2 + nối 1 phách = 3, gộp một nốt
    assert (2, 43, Fraction(0), Fraction(3)) in got  # G2 cả ô nhịp
    assert (2, 47, Fraction(3), Fraction(1)) in got and (2, 50, Fraction(3), Fraction(1)) in got  # hợp âm B2 + D3
    assert len([e for e in events if e.midi == 74]) == 1
    assert parse(result).find("part/measure/attributes/divisions").text == "4"  # bội chung nhỏ nhất của 2 và 4


def test_backup_returns_to_measure_start_and_voices_are_unique():
    root = parse(normalize_musicxml(piano_grand_staff()))
    measure = root.find("part/measure")
    children = [c.tag for c in measure]
    assert children.count("backup") == 1
    backup_index = children.index("backup")
    assert measure[backup_index].find("duration").text == "12"  # 3 phách x divisions 4
    top = [n for n in measure.findall("note")[:3]]
    bottom = measure.findall("note")[3:]
    assert {n.find("staff").text for n in top} == {"1"} and {n.find("voice").text for n in top} == {"1"}
    assert {n.find("staff").text for n in bottom} == {"2"} and {n.find("voice").text for n in bottom} == {"2"}
    # <staff> nằm sau <type> và trước <beam>/<notations> theo lược đồ
    tags = [c.tag for c in top[0]]
    assert tags.index("voice") < tags.index("type") < tags.index("staff")


def test_tempo_is_set_in_first_measure():
    root = parse(normalize_musicxml(piano_grand_staff(tempo=96), tempo_bpm=120))
    sounds = root.findall("part/measure[1]//sound")
    assert [s.get("tempo") for s in sounds] == ["120"]
    assert root.find("part/measure[1]//per-minute").text == "120"


def test_tempo_inserted_when_missing_default_100():
    result = normalize_musicxml(piano_grand_staff(tempo=None))
    assert result.tempo_bpm == 100
    root = parse(result)
    measure = root.find("part/measure")
    assert measure[0].tag == "attributes" and measure[1].tag == "direction"
    assert measure[1].find("sound").get("tempo") == "100"
    # truyền tempo cụ thể
    assert normalize_musicxml(piano_grand_staff(tempo=None), tempo_bpm=72).tempo_bpm == 72


def test_single_part_keeps_one_staff():
    data = score(part("P1", 1, ("G", 2), [[note("C", 5, 1), note("D", 5, 1), note("E", 5, 1)]], fifths=-3))
    result = normalize_musicxml(data)
    assert (result.staff_count, result.measure_count, result.key_signature) == (1, 1, "Eb")
    assert parse(result).find("part/measure/attributes/staves") is None


def test_minor_key_name_and_barline_stays_last():
    data = score(part("P1", 1, ("G", 2), [[note("A", 4, 3)]], fifths=2))
    assert normalize_musicxml(data).key_signature == "D"  # fifths=2, không có <mode> thì là trưởng
    data = data.replace(b"<fifths>2</fifths>", b"<fifths>2</fifths><mode>minor</mode>")
    assert normalize_musicxml(data).key_signature == "Bm"
    measure = parse(normalize_musicxml(piano_grand_staff())).findall("part/measure")[-1]
    assert measure[-1].tag == "barline"  # vạch cuối bài đứng sau cả hai staff


def test_unequal_measure_counts_warn_and_pad():
    bass = part("P1", 1, ("F", 4), [[note("C", 3, 3)]])
    treble = part("P2", 1, ("G", 2), [[note("C", 5, 3)], [note("D", 5, 3)]])
    result = normalize_musicxml(score(bass, treble))
    assert result.measure_count == 2 and result.warnings


@pytest.mark.parametrize(
    "data, fragment",
    [
        (b"khong phai xml", "không đọc được"),
        (b'<score-timewise version="4.0"/>', "score-partwise"),
        (b'<score-partwise version="4.0"><part-list/></score-partwise>', "không có <part>"),
        (b'<score-partwise><part-list/><part id="P1"/></score-partwise>', "không có ô nhịp"),
    ],
)
def test_invalid_musicxml_raises(data, fragment):
    with pytest.raises(ConversionError, match=fragment):
        normalize_musicxml(data)


def test_output_is_idempotent():
    once = normalize_musicxml(piano_grand_staff())
    twice = normalize_musicxml(once.xml)
    assert (twice.measure_count, twice.staff_count, twice.key_signature) == (2, 2, "G")
    assert len(parse(twice).findall("part")) == 1
    assert [n.find("staff").text for n in parse(twice).find("part/measure").findall("note")] == ["1"] * 3 + ["2"]


# ---------------------------------------------------------------- MIDI


def read_midi(data: bytes):
    """Bộ đọc SMF tối giản: trả (format, division, [track -> danh sách (tick_tuyệt_đối, loại, dữ_liệu)])."""
    assert data[:4] == b"MThd"
    fmt, count, division = int.from_bytes(data[8:10], "big"), int.from_bytes(data[10:12], "big"), int.from_bytes(data[12:14], "big")
    pos, tracks = 14, []
    for _ in range(count):
        assert data[pos : pos + 4] == b"MTrk"
        size = int.from_bytes(data[pos + 4 : pos + 8], "big")
        chunk, pos = data[pos + 8 : pos + 8 + size], pos + 8 + size
        events, i, tick = [], 0, 0
        while i < len(chunk):
            delta = 0
            while True:
                byte = chunk[i]
                i += 1
                delta = (delta << 7) | (byte & 0x7F)
                if not byte & 0x80:
                    break
            tick += delta
            status = chunk[i]
            if status == 0xFF:
                kind, length = chunk[i + 1], chunk[i + 2]
                events.append((tick, f"meta{kind:02x}", chunk[i + 3 : i + 3 + length]))
                i += 3 + length
            elif status & 0xF0 == 0xC0:
                events.append((tick, "program", bytes([status & 0x0F, chunk[i + 1]])))
                i += 2
            else:
                events.append((tick, "on" if status & 0xF0 == 0x90 else "off", bytes([status & 0x0F, chunk[i + 1], chunk[i + 2]])))
                i += 3
        tracks.append(events)
    return fmt, division, tracks


def test_midi_has_one_track_and_channel_per_staff():
    xml = normalize_musicxml(piano_grand_staff()).xml
    data, stats = musicxml_to_midi_bytes(xml, 120)
    fmt, division, tracks = read_midi(data)
    assert (fmt, division, len(tracks)) == (1, 480, 2) and (stats.tracks, stats.notes) == (2, 7)

    # tempo 120 BPM = 500000 µs/phách và nhịp 3/4 ở track đầu
    meta = {kind: payload for _, kind, payload in tracks[0] if kind.startswith("meta")}
    assert int.from_bytes(meta["meta51"], "big") == 500_000
    assert meta["meta58"][:2] == bytes([3, 2])  # beats=3, beat_type=4 -> 2^2
    assert all(kind != "meta51" for _, kind, _ in tracks[1])

    def notes(track, channel):
        return sorted((t, p[1]) for t, kind, p in tracks[track] if kind == "on" and p[0] == channel)

    assert notes(0, 0) == [(0, 67), (480, 69), (960, 71), (1440, 74)]  # tay phải, kênh 0
    assert notes(1, 1) == [(0, 43), (1440, 47), (1440, 50)]  # tay trái, kênh 1
    assert all(p[0] == 0 for _, kind, p in tracks[0] if kind in ("on", "off"))
    assert all(p[0] == 1 for _, kind, p in tracks[1] if kind in ("on", "off"))


def test_midi_merges_ties_into_one_note_and_orders_off_before_on():
    xml = normalize_musicxml(piano_grand_staff()).xml
    _, _, tracks = read_midi(musicxml_to_midi_bytes(xml, 100)[0])
    d5 = [(t, kind) for t, kind, p in tracks[0] if kind in ("on", "off") and p[1] == 74]
    assert d5 == [(1440, "on"), (2880, "off")]  # 3 phách = 1440 tick, một nốt duy nhất
    for track in tracks:  # tại cùng tick, nốt tắt phải đứng trước nốt bật
        for earlier, later in zip(track, track[1:]):
            if earlier[0] == later[0] and earlier[1] == "on":
                assert later[1] != "off"


def test_midi_without_notes_or_bad_xml_raises():
    rests_only = score(part("P1", 1, ("G", 2), [[b"".decode() + "<note><rest/><duration>3</duration></note>"]]))
    with pytest.raises(ConversionError, match="không có nốt"):
        musicxml_to_midi_bytes(rests_only, 100)
    with pytest.raises(ConversionError, match="không đọc được"):
        musicxml_to_midi_bytes(b"???", 100)


def test_midi_file_is_written_atomically(tmp_path):
    xml_path = tmp_path / "in.musicxml"
    xml_path.write_bytes(normalize_musicxml(piano_grand_staff()).xml)
    out = tmp_path / "midi" / "v1.mid"
    stats = musicxml_file_to_midi_file(xml_path, out, 90)
    assert out.read_bytes()[:4] == b"MThd" and stats.notes == 7
    assert not (tmp_path / "midi" / "v1.mid.tmp").exists()
    assert stats.seconds == pytest.approx(6 * 60 / 90, abs=0.01)


# ------------------------------------------------------------------ giọng hát + piano


def test_voice_part_is_kept_separate_above_two_staff_piano():
    from tests.xml_samples import voice_and_piano

    result = normalize_musicxml(voice_and_piano(), tempo_bpm=None)
    root = ET.fromstring(result.xml)
    assert result.parts == ["Giọng hát", "Piano"]
    assert result.staff_count == 3 and result.measure_count == 2 and result.tempo_bpm == 80
    assert [p.get("id") for p in root.findall("part")] == ["P1", "P2"]
    score_parts = root.find("part-list").findall("score-part")
    assert [sp.findtext("part-name") for sp in score_parts] == ["Giọng hát", "Piano"]
    assert [sp.findtext(".//midi-program") for sp in score_parts] == ["53", "1"]
    assert [sp.findtext(".//midi-channel") for sp in score_parts] == ["1", "2"]

    voice, piano = root.findall("part")
    assert voice.find("measure/attributes/staves") is None
    assert [n.findtext("pitch/step") for n in voice.iter("note")][:3] == ["D", "E", "F"]
    assert piano.findtext("measure/attributes/staves") == "2"
    clefs = piano.find("measure/attributes").findall("clef")
    assert [(c.get("number"), c.findtext("sign")) for c in clefs] == [("1", "G"), ("2", "F")]
    # mọi part cùng divisions sau chuẩn hóa, ô nhịp đánh số từ 1
    divisions = {d.text for d in root.iter("divisions")}
    assert len(divisions) == 1
    assert [m.get("number") for m in voice.findall("measure")] == ["1", "2"]
    assert normalize_musicxml(result.xml).xml == result.xml  # chạy lại không đổi


def test_midi_has_one_track_per_staff_across_parts_with_part_programs():
    from tests.xml_samples import voice_and_piano

    normalized = normalize_musicxml(voice_and_piano(), tempo_bpm=None).xml
    data, stats = musicxml_to_midi_bytes(normalized, 80)
    assert stats.tracks == 3
    chunks = data.split(b"MTrk")[1:]
    programs = [chunk[chunk.index(bytes([0xC0 | i])) + 1] for i, chunk in enumerate(chunks)]
    assert programs == [52, 0, 0]  # giọng hát Choir Aahs, hai tay piano Acoustic Grand
    # track 0 là giọng hát (D5 = 74), track 2 là tay trái (G2 = 43)
    assert bytes([0x90, 74]) in chunks[0] and bytes([0x92, 43]) in chunks[2]


def test_part_names_that_are_not_voices_keep_the_single_piano_part():
    result = normalize_musicxml(piano_grand_staff(), tempo_bpm=None)  # tên part "Music0"/"Music1"
    assert result.parts == ["Piano"] and result.staff_count == 2


# ---------------------------------------------------------------- số chỉ nhịp lặp lại

_TIME_3_4 = "<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>"
_TIME_4_4 = "<attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes>"
_KEY_G = "<attributes><key><fifths>1</fifths></key></attributes>"


def _measures_with_time(root):
    return [
        m.get("number") for m in root.iter("measure") if m.find("attributes") is not None and m.find("attributes/time") is not None
    ]


def test_repeated_time_and_key_signatures_are_dropped_but_real_changes_stay():
    # kern ghép nhiều hệ có dòng *M3/4 ở mỗi chỗ nối nên music21 in lại số chỉ nhịp ở đầu mỗi hệ
    three = [note("C", 4, 3)]
    four = [note("C", 4, 4)]
    measures = [
        three,
        [_TIME_3_4, *three],  # lặp
        three,
        [_TIME_4_4, *four],  # đổi nhịp thật
        [_TIME_4_4, *four],  # lặp
        [_TIME_3_4, *three],  # đổi lại 3/4
        [_KEY_G, *three],  # dấu hóa lặp (ô 1 đã có fifths=1)
    ]
    root = parse(normalize_musicxml(score(part("P1", 1, ("G", 2), measures, beats=3))))
    assert _measures_with_time(root) == ["1", "4", "6"]
    assert len(list(root.iter("key"))) == 1
    assert all(len(m.find("attributes")) > 0 for m in root.iter("measure") if m.find("attributes") is not None)


def test_notes_are_untouched_when_signatures_are_dropped():
    measures = [[note("C", 4, 3)], [_TIME_3_4, note("D", 4, 3)]]
    root = parse(normalize_musicxml(score(part("P1", 1, ("G", 2), measures, beats=3))))
    assert [n.findtext("pitch/step") for n in root.iter("note")] == ["C", "D"]
