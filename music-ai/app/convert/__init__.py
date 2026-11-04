"""Chuyển đổi định dạng của music-ai (đặc tả mục 2.4 và 6.2): kern -> MusicXML -> MIDI.

* :mod:`app.convert.kern`      kern -> MusicXML (music21), rồi chuẩn hóa bằng :mod:`app.convert.musicxml`
* :mod:`app.convert.musicxml`  chuẩn hóa MusicXML: 1 part "Piano" nhiều staff, tempo, số ô nhịp; rút metadata
* :mod:`app.convert.midi`      MusicXML -> MIDI (mỗi staff một track/kênh)
* :mod:`app.convert.score_xml` đọc nốt từ MusicXML (dùng chung cho sắp xếp staff và ghi MIDI)
"""
