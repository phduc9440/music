import threading
import uuid

import pytest

from app import config
from app.callback import JavaCallback
from app.omr import kern_check
from app.omr.pipeline import run_omr_job
from app.schemas import JobRequest
from tests.fake_java import FakeJava
from tests.fake_recognizer import FakeRecognizer
from tests.kern_samples import PAGE_1, PAGE_2_BARE, T, kern
from tests.synth import make_score_page
from tests.test_pipeline import BLANK, write_images


@pytest.fixture()
def java(monkeypatch):
    server = FakeJava(key="test-key")
    monkeypatch.setenv("JAVA_BASE_URL", server.url)
    monkeypatch.setenv("CALLBACK_RETRIES", "1")
    config.get_settings.cache_clear()
    yield server
    server.stop()


@pytest.fixture(autouse=True)
def music21_unavailable(monkeypatch):
    """Mặc định coi như chưa cài music21 (cloud/CI không có); test nào cần thì tự đặt lại."""
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("unavailable", "chưa cài music21"))


def job_for(score, count=2, **options):
    return JobRequest(
        taskId=str(uuid.uuid4()),
        scoreId=score,
        inputs=[{"path": f"scores/{score}/original/{i:02d}-x.png", "kind": "IMAGE", "page": i} for i in range(1, count + 1)],
        options={"stopAfter": "MERGE", **options},
    )


def run(job, recognizer, cancel=None):
    run_omr_job(job, cancel or threading.Event(), JavaCallback(str(job.taskId)), recognizer=recognizer)


def setup_pages(root, score, count=2):
    write_images(root, score, [make_score_page(seed=i) for i in range(count)])
    return job_for(score, count)


def test_full_recognition_flow(storage_root, java):
    job = setup_pages(storage_root, "r1")
    recognizer = FakeRecognizer([PAGE_1, PAGE_2_BARE])
    run(job, recognizer)

    assert java.endpoints()[-1] == "complete" and "fail" not in java.endpoints()
    assert len(recognizer.calls) == 2 and recognizer.calls[0].endswith("pages/page-001.png")

    # tiến độ không giảm, đủ các bước, INFERENCE 30..85 rồi MERGE tới 90
    progress = [(b["progress"], b["step"]) for b in java.bodies("progress")]
    values = [p for p, _ in progress]
    assert values == sorted(values) and values[-1] == 90
    assert ("INFERENCE" in {s for _, s in progress}) and ("MERGE" in {s for _, s in progress})
    inference = [p for p, s in progress if s == "INFERENCE"]
    assert inference[0] == 30 and inference[-1] == 85 and 58 in inference  # 30 + 55 * 1 / 2 = 57.5 -> 58

    # file kern từng trang và bản ghép
    assert (storage_root / "scores/r1/kern/page-001.krn").read_text(encoding="utf-8").startswith("**kern")
    merged = (storage_root / "scores/r1/kern/merged.krn").read_text(encoding="utf-8")
    assert merged.startswith(f"**kern{T}**kern") and merged.rstrip().endswith(f"*-{T}*-")

    kern_files = [f for f in java.bodies("files") if f["fileType"] == "KERN"]
    assert len(kern_files) == 1
    assert kern_files[0]["storagePath"] == "scores/r1/kern/merged.krn"
    assert kern_files[0]["pageNumber"] is None
    assert kern_files[0]["meta"]["pages"] == ["scores/r1/kern/page-001.krn", "scores/r1/kern/page-002.krn"]
    assert kern_files[0]["sizeBytes"] == (storage_root / "scores/r1/kern/merged.krn").stat().st_size

    done = java.bodies("complete")[0]
    assert done["resultData"]["stoppedAfter"] == "MERGE" and done["resultData"]["pageCount"] == 2
    assert done["resultData"]["kernPath"] == "scores/r1/kern/merged.krn"
    assert done["resultData"]["inferenceMs"] == [7, 7]
    assert done["scoreMetadata"] == {
        "pageCount": 2,
        "measureCount": 4,
        "staffCount": 2,
        "keySignature": "G major",
        "timeSignature": "3/4",
        "tempoBpm": 96,
    }
    # music21 chưa cài thì có cảnh báo nhưng vẫn COMPLETED
    assert any("music21" in w for w in done["resultData"]["warnings"])


def test_empty_page_is_skipped_with_warning(storage_root, java):
    job = setup_pages(storage_root, "r2")
    run(job, FakeRecognizer([PAGE_1, "không có kern gì cả"]))
    done = java.bodies("complete")[0]
    assert any("Trang 2" in w and "**kern" in w for w in done["resultData"]["warnings"])
    assert done["resultData"]["pageCount"] == 2  # số trang ảnh; kern chỉ ghép trang dùng được
    assert "fail" not in java.endpoints()


def test_all_pages_empty_fails_recognition_empty(storage_root, java):
    job = setup_pages(storage_root, "r3")
    run(job, FakeRecognizer([kern("**kern|**kern", "=1|=1", "*-|*-")]))
    assert java.bodies("fail") == [{"errorCode": "RECOGNITION_EMPTY", "message": "không nhận diện được nốt nào ở cả 2 trang"}]
    assert "complete" not in java.endpoints()
    assert not (storage_root / "scores/r3/kern/merged.krn").exists()


def test_spine_mismatch_fails(storage_root, java, monkeypatch):
    # Mặc định ghép nới lỏng (tự vá số spine); test này kiểm tra chế độ nghiêm ngặt theo đúng đặc tả
    monkeypatch.setenv("MERGE_LENIENT_SPINES", "false")
    config.get_settings.cache_clear()
    job = setup_pages(storage_root, "r4")
    ragged = kern("**kern|**kern|**kern", "=1|=1|=1", "4c|4e|4g", "*^|*|*", "4c|4c|4e|4g")
    run(job, FakeRecognizer([PAGE_1, ragged]))
    assert java.bodies("fail") == [{"errorCode": "MERGE_SPINE_MISMATCH", "message": "trang 2"}]


def test_kern_parse_error_fails_but_keeps_file(storage_root, java, monkeypatch):
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("error", "ValueError: dòng 7 sai"))
    job = setup_pages(storage_root, "r5")
    run(job, FakeRecognizer([PAGE_1, PAGE_2_BARE]))
    assert java.bodies("fail") == [{"errorCode": "KERN_PARSE_ERROR", "message": "ValueError: dòng 7 sai"}]
    assert (storage_root / "scores/r5/kern/merged.krn").exists()
    # file KERN đã được đăng ký trước khi báo lỗi để người dùng xem lại được
    assert any(f["fileType"] == "KERN" for f in java.bodies("files"))
    assert "complete" not in java.endpoints()


def test_kern_parse_error_only_warns_in_warn_mode(storage_root, java, monkeypatch):
    monkeypatch.setenv("KERN_PARSE_MODE", "warn")
    config.get_settings.cache_clear()
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("error", "ValueError: dòng 7 sai"))
    job = setup_pages(storage_root, "r6")
    run(job, FakeRecognizer([PAGE_1, PAGE_2_BARE]))
    done = java.bodies("complete")[0]
    assert any("music21 không đọc được kern" in w for w in done["resultData"]["warnings"])


def test_music21_ok_adds_no_warning(storage_root, java, monkeypatch):
    monkeypatch.setattr(kern_check, "parse_check", lambda path: ("ok", ""))
    job = setup_pages(storage_root, "r7")
    run(job, FakeRecognizer([PAGE_1, PAGE_2_BARE]))
    assert java.bodies("complete")[0]["resultData"]["warnings"] == []


def test_model_not_loaded_fails(storage_root, java):
    job = setup_pages(storage_root, "r8")
    run(job, FakeRecognizer([], state="failed", error="ImportError: no module named torch"))
    assert java.bodies("fail") == [{"errorCode": "MODEL_NOT_LOADED", "message": "ImportError: no module named torch"}]
    # tiền xử lý đã chạy xong và ảnh trang vẫn được đăng ký
    assert len([f for f in java.bodies("files") if f["fileType"] == "PNG"]) == 2


def test_measure_and_spine_warnings_are_forwarded(storage_root, java):
    job = setup_pages(storage_root, "r9")
    bad = PAGE_2_BARE.replace(f"4E{T}4e", f"2E{T}2e")
    run(job, FakeRecognizer([PAGE_1, bad]))
    warnings = java.bodies("complete")[0]["resultData"]["warnings"]
    assert any(w.startswith("Trang 2, ô nhịp 3:") for w in warnings)


def test_truncated_output_warns(storage_root, java):
    job = setup_pages(storage_root, "r10", 1)
    run(job_for("r10", 1), FakeRecognizer([PAGE_1.replace(f"*-{T}*-\n", "")], truncated=True))
    warnings = java.bodies("complete")[0]["resultData"]["warnings"]
    assert any("chạm giới hạn" in w for w in warnings)


def test_cancel_during_inference_stops_without_callbacks(storage_root, java):
    job = setup_pages(storage_root, "r11", 3)
    cancel = threading.Event()
    recognizer = FakeRecognizer([PAGE_1], on_call=lambda i: cancel.set() if i == 0 else None, delay_s=0.2)
    run(job, recognizer, cancel)
    assert len(recognizer.calls) == 1
    assert "complete" not in java.endpoints() and "fail" not in java.endpoints()
    assert not (storage_root / "scores/r11/kern/merged.krn").exists()


def test_inference_page_timeout_fails_with_task_timeout(storage_root, java, monkeypatch):
    monkeypatch.setenv("INFERENCE_PAGE_TIMEOUT_S", "0")
    config.get_settings.cache_clear()
    job = setup_pages(storage_root, "r12", 1)
    run(job, FakeRecognizer([PAGE_1], delay_s=1.0))
    fail = java.bodies("fail")[0]
    assert fail["errorCode"] == "TASK_TIMEOUT" and fail["message"].startswith("trang 1 quá")


def test_stop_after_preprocess_does_not_touch_model(storage_root, java):
    write_images(storage_root, "r13", [make_score_page()])
    job = job_for("r13", 1, stopAfter="PREPROCESS")
    recognizer = FakeRecognizer([PAGE_1])
    run(job, recognizer)
    assert recognizer.calls == []
    done = java.bodies("complete")[0]
    assert done["resultData"]["stoppedAfter"] == "PREPROCESS" and "kernPath" not in done["resultData"]
    assert done["scoreMetadata"] == {"pageCount": 1}


@pytest.mark.parametrize("stop_after", ["INFERENCE", "merge"])  # EXPORT chạy tiếp tới xuất MusicXML: xem test_export.py
def test_later_stop_after_values_run_through_merge(storage_root, java, stop_after):
    write_images(storage_root, "r14", [make_score_page()])
    run(job_for("r14", 1, stopAfter=stop_after), FakeRecognizer([PAGE_1]))
    assert java.bodies("complete")[0]["resultData"]["stoppedAfter"] == "MERGE"


def test_old_page_kern_files_are_removed_on_rerun(storage_root, java):
    stale = storage_root / "scores/r16/kern/page-009.krn"
    stale.parent.mkdir(parents=True)
    stale.write_text("cũ", encoding="utf-8")
    write_images(storage_root, "r16", [make_score_page()])
    run(job_for("r16", 1), FakeRecognizer([PAGE_1]))
    assert not stale.exists() and (storage_root / "scores/r16/kern/page-001.krn").exists()


def test_no_staff_still_fails_before_inference(storage_root, java):
    write_images(storage_root, "r17", [BLANK])
    recognizer = FakeRecognizer([PAGE_1])
    run(job_for("r17", 1), recognizer)
    assert java.bodies("fail") == [{"errorCode": "NO_STAFF_DETECTED"}]
    assert recognizer.calls == []


# ------------------------------------------------------------------ bố cục + nhận diện lại theo hệ


def vocal_job(root, score, systems=4):
    from tests.synth import make_vocal_page

    write_images(root, score, [make_vocal_page(systems=systems)])
    return job_for(score, 1)


def test_page_missing_voice_is_recognized_again_by_systems(storage_root, java):
    from tests.kern_samples import SYSTEM_3

    job = vocal_job(storage_root, "v1")
    recognizer = FakeRecognizer([PAGE_1, SYSTEM_3])  # cả trang: mất khuông giọng; từng hệ: đủ 3 khuông
    run(job, recognizer)

    assert java.endpoints()[-1] == "complete" and "fail" not in java.endpoints()
    assert len(recognizer.calls) == 1 + 4
    assert recognizer.calls[1].endswith("routing/page-001-s01.png")
    assert (storage_root / "scores/v1/layout/page-001.json").is_file()
    assert (storage_root / "scores/v1/routing/page-001-s04.krn").is_file()

    merged = (storage_root / "scores/v1/kern/merged.krn").read_text(encoding="utf-8")
    assert merged.splitlines()[1] == f"*Ipiano{T}*Ipiano{T}*Ivox"

    done = java.bodies("complete")[0]
    data = done["resultData"]
    assert data["spines"] == 3 and data["staffRoles"] == ["SINGLE", "PIANO", "PIANO"]
    page = data["routing"]["pages"][0]
    assert data["routing"]["mode"] == "fallback"
    assert page["chosen"] == "systems" and page["systems"] == 4 and page["systemsOk"] == 4 and page["primarySpines"] == 2
    assert data["kernPages"] == ["scores/v1/routing/page-001-systems.krn"]
    assert any("nhận diện lại theo từng hệ" in w for w in data["warnings"])
    assert done["scoreMetadata"]["staffCount"] == 3 and done["scoreMetadata"]["measureCount"] == 4


def test_wrong_system_is_retried_with_beams(storage_root, java):
    from tests.kern_samples import SYSTEM_3

    job = vocal_job(storage_root, "v2", systems=2)
    recognizer = FakeRecognizer([PAGE_1, PAGE_1, SYSTEM_3])
    run(job, recognizer)
    # cả trang, hệ 1 (greedy), đọc riêng piano (sai spine nên thử beam 3, vẫn sai), beam 3 cả hệ, hệ 2
    assert recognizer.beams == [None, None, None, 3, 3, None]
    page = java.bodies("complete")[0]["resultData"]["routing"]["pages"][0]
    assert page["chosen"] == "systems" and page["retries"] == 3


def test_routing_off_only_warns_about_missing_staff(storage_root, java, monkeypatch):
    monkeypatch.setenv("OMR_ROUTING", "off")
    config.get_settings.cache_clear()
    job = vocal_job(storage_root, "v3")
    recognizer = FakeRecognizer([PAGE_1])
    run(job, recognizer)
    assert len(recognizer.calls) == 1
    data = java.bodies("complete")[0]["resultData"]
    assert "routing" not in data
    assert any("đọc được 2 khuông trong khi ảnh có 3" in w for w in data["warnings"])


def test_routing_never_runs_past_the_job_budget(storage_root, java, monkeypatch):
    monkeypatch.setenv("ROUTING_RESERVE_S", "100000")
    config.get_settings.cache_clear()
    job = vocal_job(storage_root, "v4")
    recognizer = FakeRecognizer([PAGE_1])
    run(job, recognizer)
    assert len(recognizer.calls) == 1 and java.endpoints()[-1] == "complete"
    data = java.bodies("complete")[0]["resultData"]
    assert data["routing"]["pages"][0]["skipped"] == "không đủ thời gian"
    assert any("chưa sửa được (không đủ thời gian)" in w for w in data["warnings"])


def test_piano_pages_with_right_spines_are_not_recognized_again(storage_root, java):
    job = setup_pages(storage_root, "v5")
    recognizer = FakeRecognizer([PAGE_1, PAGE_2_BARE])
    run(job, recognizer)
    assert len(recognizer.calls) == 2
    data = java.bodies("complete")[0]["resultData"]
    assert data["routing"] == {"mode": "fallback", "pages": []}
    assert "staffRoles" not in data or data["staffRoles"] == ["PIANO", "PIANO"]
    merged = (storage_root / "scores/v5/kern/merged.krn").read_text(encoding="utf-8")
    assert "*I" not in merged  # bản piano không đổi


def test_systems_missing_voice_are_read_by_roles_through_the_pipeline(storage_root, java):
    from tests.kern_samples import PIANO_ONLY, VOICE_ONLY

    class RolesRecognizer(FakeRecognizer):
        def recognize(self, png_path, check, num_beams=None):
            name = str(png_path)
            self.outputs = [PIANO_ONLY if name.endswith("r2-piano.png") else VOICE_ONLY if name.endswith("r1-single.png") else PAGE_1]
            return super().recognize(png_path, check, num_beams)

    job = vocal_job(storage_root, "v6", systems=2)
    run(job, RolesRecognizer([PAGE_1]))
    assert java.endpoints()[-1] == "complete"
    assert (storage_root / "scores/v6/routing/page-001-s01-r2-piano.png").is_file()
    assert (storage_root / "scores/v6/routing/page-001-s01-r1-single.krn").is_file()
    data = java.bodies("complete")[0]["resultData"]
    page = data["routing"]["pages"][0]
    assert page["chosen"] == "systems" and page["roleSplit"] == 2 and page["systemsOk"] == 2
    assert data["spines"] == 3 and data["staffRoles"] == ["SINGLE", "PIANO", "PIANO"]
    assert any("đọc riêng từng nhóm khuông" in w for w in data["warnings"])


# ------------------------------------------------------------------ số ô nhịp theo vạch nhịp trên ảnh


def melody_job(root, score, measures=(4, 5, 3)):
    from tests.synth import make_melody_page

    write_images(root, score, [make_melody_page(measures=measures)])
    return job_for(score, 1)


def test_page_with_looped_measures_is_recognized_again_by_systems(storage_root, java):
    from tests.kern_samples import melody

    job = melody_job(storage_root, "m1")
    # cả trang: đúng 1 khuông nhưng lặp thành 20 ô; từng hệ: đúng 4, 5, 3 ô như trên ảnh
    recognizer = FakeRecognizer([melody(20), melody(4), melody(5), melody(3)])
    run(job, recognizer)

    assert java.endpoints()[-1] == "complete" and "fail" not in java.endpoints()
    assert len(recognizer.calls) == 1 + 3
    data = java.bodies("complete")[0]["resultData"]
    page = data["routing"]["pages"][0]
    assert page["chosen"] == "systems"
    # lượt cả trang bị dừng sớm ở vạch nhịp thứ 18 (giới hạn 12 + 4)
    assert page["expectedMeasures"] == 12 and page["primaryMeasures"] == 18 and page["chosenMeasures"] == 12
    assert any("18 ô nhịp trong khi ảnh có 12 ô" in w for w in data["warnings"])
    assert not any("dừng khi vượt" in w for w in data["warnings"])  # cảnh báo của lượt cả trang được thay
    assert java.bodies("complete")[0]["scoreMetadata"]["measureCount"] == 12


def test_routing_bars_off_keeps_the_page_and_warns(storage_root, java, monkeypatch):
    from tests.kern_samples import melody

    monkeypatch.setenv("OMR_ROUTING_BARS", "0")
    config.get_settings.cache_clear()
    job = melody_job(storage_root, "m2")
    recognizer = FakeRecognizer([melody(20)])
    run(job, recognizer)
    assert len(recognizer.calls) == 1
    data = java.bodies("complete")[0]["resultData"]
    assert any("đọc được 20 ô nhịp trong khi ảnh có 12 ô (thừa 8 ô" in w for w in data["warnings"])


def test_page_matching_the_image_is_not_recognized_again(storage_root, java):
    from tests.kern_samples import melody

    job = melody_job(storage_root, "m3")
    recognizer = FakeRecognizer([melody(12)])
    run(job, recognizer)
    assert len(recognizer.calls) == 1
    data = java.bodies("complete")[0]["resultData"]
    assert data["routing"]["pages"] == []
    assert not any("ô nhịp trong khi ảnh có" in w for w in data["warnings"])


def test_looping_page_is_stopped_early_then_recognized_by_systems(storage_root, java):
    from tests.kern_samples import melody

    job = melody_job(storage_root, "m4")
    recognizer = FakeRecognizer([melody(60), melody(4), melody(5), melody(3)])
    run(job, recognizer)
    # 12 ô trên ảnh: cả trang được sinh tối đa 12 + 4 vạch; từng hệ tối đa số ô của hệ + 3
    assert recognizer.limits == [16, 7, 8, 6]
    first = (storage_root / "scores/m4/kern/page-001.krn").read_text(encoding="utf-8")
    assert sum(1 for line in first.splitlines() if line.startswith("=")) == 18  # cắt ngay sau vạch thứ 16 + 2
    data = java.bodies("complete")[0]["resultData"]
    assert data["routing"]["pages"][0]["chosen"] == "systems"
    assert data["routing"]["pages"][0]["chosenMeasures"] == 12


def test_no_limit_without_trusted_barlines(storage_root, java):
    job = setup_pages(storage_root, "m5", 1)
    recognizer = FakeRecognizer([PAGE_1])
    run(job, recognizer)
    assert recognizer.limits == [None]


def test_loops_are_trimmed_on_the_page_when_there_is_no_time_to_route(storage_root, java, monkeypatch):
    monkeypatch.setenv("ROUTING_RESERVE_S", "100000")
    config.get_settings.cache_clear()
    job = melody_job(storage_root, "m6")
    head = [r for i, p in enumerate("cdefga") for r in (f"2.{p}", f"={i + 1}")]
    loop = ["2f", "4g", "=", "2a", "4f", "="] * 5  # khối 2 ô lặp 5 lần: 6 + 10 = 16 ô, ảnh có 12
    recognizer = FakeRecognizer([kern("**kern", "*clefG2", "*M3/4", *head, *loop, "*-")])
    run(job, recognizer)
    data = java.bodies("complete")[0]["resultData"]
    page = data["routing"]["pages"][0]
    assert page["skipped"] == "không đủ thời gian" and page["chosenMeasures"] == 12
    assert any("model đọc lặp, đã bỏ 4 ô nhịp" in w for w in data["warnings"])
    assert java.bodies("complete")[0]["scoreMetadata"]["measureCount"] == 12


def test_measure_map_places_each_measure_on_the_page_image(storage_root, java):
    from tests.kern_samples import melody

    job = melody_job(storage_root, "m7")
    run(job, FakeRecognizer([melody(12)]))
    data = java.bodies("complete")[0]["resultData"]
    check = data["measureCheck"]
    assert check["imageMeasures"] == 12 and check["kernMeasures"] == 12 and check["pagesRerouted"] == 0
    assert check["pages"] == [{"page": 1, "imageMeasures": 12, "kernMeasures": 12}]
    entries = data["measureMap"]
    assert [e["measure"] for e in entries] == list(range(1, 13))
    assert [e["system"] for e in entries] == [1] * 4 + [2] * 5 + [3] * 3
    assert all(e["flags"] == [] for e in entries)
    boxes = [e["box"] for e in entries]
    assert all(b[0] < b[2] and b[1] < b[3] for b in boxes)
    assert boxes[0][2] == boxes[1][0]  # ô liền nhau chung vạch nhịp
    assert boxes[3][1] < boxes[4][1]  # hệ 2 nằm dưới hệ 1


def test_measure_map_after_routing_and_flags(storage_root, java):
    from tests.kern_samples import melody

    bad_system = melody(5).replace("4g\n=2", "4g\n4a\n=2")  # ô 1 của hệ 2 thừa trường độ
    job = melody_job(storage_root, "m8")
    run(job, FakeRecognizer([melody(20), melody(4), bad_system, melody(2)]))
    data = java.bodies("complete")[0]["resultData"]
    entries = data["measureMap"]
    assert data["measureCheck"]["pagesRerouted"] == 1 and len(entries) == 11
    assert [e["system"] for e in entries] == [1] * 4 + [2] * 5 + [3] * 2
    assert "DURATION" in entries[4]["flags"]
    # hệ 3 đọc ra 2 ô trong khi ảnh có 3: chỉ khoanh cả hệ và đánh dấu lệch số ô
    last = entries[-1]
    assert last["flags"] == ["COUNT_MISMATCH"] and last["box"] == entries[-2]["box"]


def test_measure_map_without_trusted_barlines_has_pages_only(storage_root, java):
    job = setup_pages(storage_root, "m9", 1)
    run(job, FakeRecognizer([PAGE_1]))
    data = java.bodies("complete")[0]["resultData"]
    assert data["measureCheck"]["imageMeasures"] is None
    assert all(e["page"] == 1 and e["system"] is None and e["box"] is None for e in data["measureMap"])
