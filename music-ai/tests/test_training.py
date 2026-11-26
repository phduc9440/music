"""Công cụ tạo dữ liệu fine-tune (training/): biến dạng ảnh, lời ca nhiễu, bỏ spine lời ca, chia tập không rò rỉ."""

import random
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import pytest

from app.eval.score import read_musicxml
from tests.synth import make_score_page
from tests.xml_samples import note, part, score
from training.augment import degrade
from training.make_dataset import (
    add_text_distractors,
    excluded_inputs,
    keep_parts,
    split_of,
    strip_non_kern_spines,
    vietnamese_syllable,
)

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("profile", ["clean", "scan", "photo"])
def test_degrade_keeps_shape_and_changes_photo(profile):
    img = make_score_page(width=525, height=742)
    out = degrade(img, np.random.default_rng(1), profile)
    assert out.shape == img.shape and out.dtype == np.uint8
    if profile == "photo":
        assert np.abs(out.astype(int) - img.astype(int)).mean() > 2
    with pytest.raises(ValueError):
        degrade(img, np.random.default_rng(1), "xau")


def test_vietnamese_syllables_are_nfc():
    rng = random.Random(0)
    syllables = [vietnamese_syllable(rng) for _ in range(200)]
    assert all(s == unicodedata.normalize("NFC", s) for s in syllables)
    assert any(ch in "".join(syllables) for ch in "áàảãạ") or any(ch in "".join(syllables) for ch in "ếềểễệ")


def test_text_distractors_keep_music():
    xml = score(part("P1", 1, ("G", 2), [[note("F", 4, 2), note("G", 4, 1)]] * 2))
    out = add_text_distractors(xml, random.Random(0), verses=3, chords=True)
    before, after = read_musicxml(xml), read_musicxml(out)
    assert [(e.measure, e.onset, e.midi) for e in before.events] == [(e.measure, e.onset, e.midi) for e in after.events]
    assert {l.number for l in after.lyrics} == {1, 2, 3}


def test_keep_parts():
    xml = score(part("P1", 1, ("G", 2), [[note("C", 5, 3)]]), part("P2", 1, ("F", 4), [[note("C", 3, 3)]]))
    root = ET.fromstring(keep_parts(xml, [0]))
    assert [p.get("id") for p in root.findall("part")] == ["P1"]
    assert [sp.get("id") for sp in root.iter("score-part")] == ["P1"]


def test_strip_text_spines():
    hum = "**kern\t**text\t**kern\t**text\n*clefF4\t*\t*clefG2\t*\n4C\tla\t4e\tNguyện\n=1\t=1\t=1\t=1\n*-\t*-\t*-\t*-\n"
    assert strip_non_kern_spines(hum) == "**kern\t**kern\n*clefF4\t*clefG2\n4C\t4e\n=1\t=1\n*-\t*-\n"


def test_split_by_piece_and_benchmark_exclusion():
    assert split_of("bai-1", 0.2) == split_of("bai-1", 0.2)
    splits = {split_of(f"bai-{i}", 0.2) for i in range(200)}
    assert splits == {"train", "val"}
    excluded = excluded_inputs(ROOT / "benchmark" / "cases.json")
    assert "01-7a1528b8-3a8a-4c81-80cd-c7990c5edd6e.jpg" in excluded
    assert "4ef2e6be-2d18-4a84-b089-98f3ddab42cc" in excluded
