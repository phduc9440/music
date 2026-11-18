"""Lớp AI xác minh ô nghi ngờ (app/omr/llm_check.py), dùng client giả, không gọi mạng."""

from __future__ import annotations

import json

import numpy as np

from app.omr import llm_check, merge, review
from tests.kern_samples import kern


def _merged(*measures: str) -> merge.MergeResult:
    rows = ["**kern", "*clefG2", "*k[b-]", "*M3/4"]
    for number, notes in enumerate(measures, start=1):
        rows += notes.split()
        rows.append("==" if number == len(measures) else f"={number + 1}")
    rows.append("*-")
    page, _ = merge.clean_page(1, kern(*rows))
    return merge.merge_pages([page])


def _entries(result: merge.MergeResult) -> list[dict]:
    count = merge.count_measures(result.lines)
    entries = [
        {"measure": m, "page": 1, "system": 1, "box": [100 + 200 * (m - 1), 80, 300 + 200 * (m - 1), 160], "flags": []}
        for m in range(1, count + 1)
    ]
    return review.annotate(entries, result)


class Client:
    def __init__(self, *answers: dict) -> None:
        self.answers = list(answers)
        self.prompts: list[str] = []
        self.images: list[bytes] = []

    def __call__(self, png: bytes, prompt: str):
        self.prompts.append(prompt)
        self.images.append(png)
        answer = self.answers[min(len(self.prompts) - 1, len(self.answers) - 1)]
        if isinstance(answer, Exception):
            raise answer
        return json.dumps(answer), {"input_tokens": 900, "output_tokens": 30}


def _run(result, entries, client, tmp_path=None, max_measures=10):
    return llm_check.verify(
        result,
        entries,
        {1: np.full((1485, 1050), 255, np.uint8)},
        client,
        "test-model",
        max_measures,
        tmp_path,
        lambda: True,
    )


def test_parse_answer():
    assert llm_check.parse_answer('{"verdict":"candidate","choice":1,"issue":""}', 2) == ("candidate", 1, "")
    assert llm_check.parse_answer('```json\n{"verdict":"none","choice":null,"issue":"Nốt 2 thấp một dòng"}\n```', 1) == (
        "none",
        None,
        "Nốt 2 thấp một dòng",
    )
    assert llm_check.parse_answer('{"verdict":"candidate","choice":5}', 2)[0] == "unsure"
    assert llm_check.parse_answer("không biết", 2)[0] == "unsure"


def test_crop_marks_measure_and_upscales():
    gray = np.full((1485, 1050), 255, np.uint8)
    crop = llm_check.crop_measure(gray, [400, 100, 600, 200])
    assert crop.shape[2] == 3
    assert crop.shape[0] == 200 and crop.shape[1] == 2 * (670 - 330)
    assert llm_check.crop_measure(gray, [10, 10, 5, 20]) is None


def test_prompt_lists_key_meter_and_candidates():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    piece = review.slice_measures(result)[1]
    prompt = llm_check.build_prompt(piece, [["2f", "4ggg"], ["2f", "4g"]], 1, None)
    assert "3/4" in prompt and "Bb" in prompt
    assert "[0] khuông 1: F4 (trắng), G6 (đen)" in prompt
    assert "[1] khuông 1: F4 (trắng), G4 (đen)" in prompt


def test_only_low_confidence_measures_are_sent_lowest_first():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    client = Client({"verdict": "unsure"})
    _, report = _run(result, entries, client)
    assert len(client.prompts) == 1 and "Measure 2" in client.prompts[0]
    assert report.calls == 1 and report.unsure == 1
    assert report.input_tokens == 900 and report.output_tokens == 30


def test_confirmation_raises_confidence():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    before = entries[1]["confidence"]
    _, report = _run(result, entries, Client({"verdict": "candidate", "choice": 0}))
    review.annotate(entries, result)
    assert report.confirmed == 1
    assert entries[1]["confidence"] > before


def test_chosen_alternative_replaces_the_measure():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    entries[1]["_alternatives"] = [["2f", "4g"]]
    fixed, report = _run(result, entries, Client({"verdict": "candidate", "choice": 1}))
    assert report.replaced == 1
    assert review.normalize_lines(review.slice_measures(fixed)[1].lines(fixed)) == ("2f", "4g")
    review.annotate(entries, fixed)
    assert entries[1]["flags"] == []


def test_alternative_with_wrong_duration_is_not_applied():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    entries[1]["_alternatives"] = [["2f", "2g"]]
    fixed, report = _run(result, entries, Client({"verdict": "candidate", "choice": 1}))
    assert fixed is result and report.doubt == 1
    assert review.FLAG_AI_DOUBT in entries[1]["flags"]


def test_doubt_adds_flag_and_reason():
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    entries = _entries(result)
    _run(result, entries, Client({"verdict": "none", "issue": "Nốt cuối là G4, không phải G6"}))
    review.annotate(entries, result)
    assert review.FLAG_AI_DOUBT in entries[1]["flags"]
    assert "AI: Nốt cuối là G4, không phải G6" in entries[1]["reasons"]


def test_cache_avoids_a_second_call(tmp_path):
    result = _merged("4c 4d 4e", "2f 4ggg", "2.c")
    first = Client({"verdict": "unsure"})
    _run(result, _entries(result), first, tmp_path)
    second = Client({"verdict": "unsure"})
    _, report = _run(result, _entries(result), second, tmp_path)
    assert second.prompts == [] and report.cached == 1 and report.calls == 0


def test_max_measures_caps_calls():
    result = _merged("4c 4d 4e", "2f 4ggg", "4aaa 4g 4f", "2.c")
    entries = _entries(result)
    client = Client({"verdict": "unsure"})
    _, report = _run(result, entries, client, max_measures=1)
    assert report.calls == 1


def test_repeated_errors_stop_calling():
    result = _merged("4ccc 4d 4e", "2f 4ggg", "4aaa 4g 4f", "2.c")
    entries = _entries(result)
    client = Client(llm_check.LlmError("mạng lỗi"))
    _, report = _run(result, entries, client)
    assert report.errors == 2 and report.skipped == "không gọi được AI"
