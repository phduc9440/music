"""Endpoint ``/convert/**`` (đặc tả mục 6.2). Tự bỏ qua khi chưa cài fastapi/httpx."""

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from app.convert.errors import ConversionError  # noqa: E402
from app.convert.musicxml import normalize_musicxml  # noqa: E402
from tests.xml_samples import piano_grand_staff  # noqa: E402

KEY = {"X-Internal-Key": "test-key"}


@pytest.fixture()
def client():
    return TestClient(main.app)  # không dùng `with` để không chạy lifespan (nạp model)


def write(storage_root, relative, data: bytes):
    target = storage_root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def test_musicxml_to_midi_writes_file(client, storage_root):
    write(storage_root, "scores/a/musicxml/v1.musicxml", normalize_musicxml(piano_grand_staff()).xml)
    body = {"musicXmlPath": "scores/a/musicxml/v1.musicxml", "outPath": "scores/a/midi/v1.mid", "tempoBpm": 90}
    response = client.post("/convert/musicxml-to-midi", json=body, headers=KEY)

    assert response.status_code == 200
    assert response.json() == {"outPath": "scores/a/midi/v1.mid", "notes": 7, "tracks": 2, "seconds": 4.0}
    assert (storage_root / "scores/a/midi/v1.mid").read_bytes()[:4] == b"MThd"


def test_convert_requires_internal_key(client, storage_root):
    write(storage_root, "scores/a/musicxml/v1.musicxml", b"<x/>")
    body = {"musicXmlPath": "scores/a/musicxml/v1.musicxml", "outPath": "scores/a/midi/v1.mid"}
    assert client.post("/convert/musicxml-to-midi", json=body).status_code == 401
    assert client.post("/convert/musicxml-to-midi", json=body, headers={"X-Internal-Key": "sai"}).status_code == 401


def test_bad_paths_and_bad_musicxml_return_422(client, storage_root):
    write(storage_root, "scores/a/musicxml/v1.musicxml", b"khong phai xml")
    traversal = {"musicXmlPath": "scores/a/musicxml/v1.musicxml", "outPath": "scores/a/../b/v1.mid"}
    assert client.post("/convert/musicxml-to-midi", json=traversal, headers=KEY).status_code == 422
    broken = {"musicXmlPath": "scores/a/musicxml/v1.musicxml", "outPath": "scores/a/midi/v1.mid"}
    response = client.post("/convert/musicxml-to-midi", json=broken, headers=KEY)
    assert response.status_code == 422 and "không đọc được" in response.json()["detail"]


def test_kern_to_musicxml_endpoint(client, storage_root, monkeypatch):
    write(storage_root, "scores/a/kern/merged.krn", b"**kern\n*-\n")

    def fake(kern_path, out_path, tempo_bpm):
        result = normalize_musicxml(piano_grand_staff(), tempo_bpm)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(result.xml)
        return result

    monkeypatch.setattr(main, "kern_file_to_musicxml_file", fake)
    body = {"kernPath": "scores/a/kern/merged.krn", "outPath": "scores/a/musicxml/v1.musicxml", "tempoBpm": 80}
    response = client.post("/convert/kern-to-musicxml", json=body, headers=KEY)

    assert response.status_code == 200
    assert response.json() == {
        "outPath": "scores/a/musicxml/v1.musicxml",
        "measureCount": 2,
        "staffCount": 2,
        "keySignature": "G",
        "timeSignature": "3/4",
        "tempoBpm": 80,
        "warnings": [],
    }

    def failing(kern_path, out_path, tempo_bpm):
        raise ConversionError("chưa cài music21 (pip install music21)")

    monkeypatch.setattr(main, "kern_file_to_musicxml_file", failing)
    response = client.post("/convert/kern-to-musicxml", json=body, headers=KEY)
    assert response.status_code == 422 and "music21" in response.json()["detail"]


def test_prepare_endpoint_scales_tempo_and_rejects_bad_paths(client, storage_root):
    write(storage_root, "scores/a/musicxml/v1.musicxml", normalize_musicxml(piano_grand_staff()).xml)
    body = {"inPath": "scores/a/musicxml/v1.musicxml", "outPath": "scores/a/tmp/t1/in.musicxml", "tempoPercent": 50}
    response = client.post("/convert/prepare", json=body, headers=KEY)
    assert response.status_code == 200
    assert response.json()["outPath"] == "scores/a/tmp/t1/in.musicxml"
    assert 'tempo="48"' in (storage_root / "scores/a/tmp/t1/in.musicxml").read_text(encoding="utf-8")

    assert client.post("/convert/prepare", json=body).status_code == 401
    traversal = {**body, "outPath": "scores/a/../b/in.musicxml"}
    assert client.post("/convert/prepare", json=traversal, headers=KEY).status_code == 422
    other_score = {**body, "outPath": "scores/b/tmp/in.musicxml"}
    assert client.post("/convert/prepare", json=other_score, headers=KEY).status_code == 422
    too_fast = {**body, "tempoPercent": 500}
    assert client.post("/convert/prepare", json=too_fast, headers=KEY).status_code == 422
