from app.omr import messages


def test_page_prefix_and_code_from_preprocess_warning():
    item = messages.warning_item("Trang 3: góc nghiêng ước lượng 12.5° vượt quá 10°, không xoay")
    assert item["page"] == 3
    assert item["code"] == "PAGE_SKEW_TOO_LARGE"
    assert item["params"] == {"angle": 12.5, "max": 10}
    assert item["text"].startswith("góc nghiêng")


def test_system_prefix():
    item = messages.warning_item("Trang 2, hệ 4: đọc ra 5 ô nhịp trong khi ảnh có 6 ô, cần kiểm tra lại hệ này")
    assert (item["page"], item["system"], item["code"]) == (2, 4, "SYSTEM_MEASURE_MISMATCH")
    assert item["params"] == {"found": 5, "expected": 6}


def test_unknown_warning_keeps_text_and_page():
    item = messages.warning_item("Trang 7: điều gì đó chưa có mã")
    assert item["code"] is None and item["page"] == 7 and item["text"] == "điều gì đó chưa có mã"
    plain = messages.warning_item("Bản kern có 4 spine")
    assert plain["page"] is None and plain["text"] == "Bản kern có 4 spine"


def test_new_omr13_messages_are_coded():
    assert messages.warning_item(messages.text_above_message(1))["code"] == "TEXT_ABOVE_STAFF"
    tempo = messages.warning_item(messages.tempo_default_message(100))
    assert tempo["code"] == "TEMPO_DEFAULT" and tempo["params"] == {"bpm": 100} and tempo["page"] is None


def test_rhythm_fix_message_skips_zero_parts_and_parses_back():
    text = messages.rhythm_fix_message([16, 20], triplets=0, dropped=2, dots=0)
    assert text == "Sửa trường độ ở ô 16, 20: bỏ 2 nốt thừa trong hợp âm"
    item = messages.fix_item(text)
    assert item["code"] == "RHYTHM_FIXED"
    assert item["measures"] == [16, 20]
    assert item["params"] == {"triplets": 0, "dropped": 2, "dots": 0}


def test_fix_items_from_reread_and_pitch_notes():
    reread = messages.fix_item("Trang 2, ô nhịp 9: đã sửa theo các lần đọc lại hệ")
    assert (reread["code"], reread["page"], reread["measures"]) == ("REREAD_REPLACED", 2, [9])
    octave = messages.fix_item("Trang 1: sửa quãng tám 3 nốt theo vị trí đầu nốt trên ảnh")
    assert (octave["code"], octave["page"], octave["params"]) == ("OCTAVE_FIXED", 1, {"count": 3})
