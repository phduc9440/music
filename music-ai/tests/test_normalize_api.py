"""``/convert/normalize``: chuẩn hóa MusicXML có sẵn. Tự bỏ qua khi chưa cài fastapi/httpx."""

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from tests.xml_samples import piano_grand_staff  # noqa: E402

KEY = {"X-Internal-Key": "test-key"}


@pytest.fixture()
def client():
    return TestClient(main.app)


def write(storage_root, relative, data: bytes):
    target = storage_root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def body(**extra):
    return {"inPath": "scores/a/tmp/t1/raw.musicxml", "outPath": "scores/a/musicxml/v1.musicxml", **extra}


def test_normalize_merges_parts_and_returns_metadata(client, storage_root):
    write(storage_root, "scores/a/tmp/t1/raw.musicxml", piano_grand_staff())  # 2 part rời: tay phải và tay trái

    response = client.post("/convert/normalize", json=body(), headers=KEY)

    assert response.status_code == 200
    result = response.json()
    assert result["outPath"] == "scores/a/musicxml/v1.musicxml"
    assert result["measureCount"] == 2
    assert result["staffCount"] == 2
    assert result["timeSignature"] == "3/4"
    assert result["tempoBpm"] == 96
    out = (storage_root / "scores/a/musicxml/v1.musicxml").read_text(encoding="utf-8")
    assert "<staves>2</staves>" in out
    assert not (storage_root / "scores/a/musicxml/v1.musicxml.tmp").exists()


def test_normalize_overrides_tempo(client, storage_root):
    write(storage_root, "scores/a/tmp/t1/raw.musicxml", piano_grand_staff())
    response = client.post("/convert/normalize", json=body(tempoBpm=120), headers=KEY)
    assert response.status_code == 200
    assert response.json()["tempoBpm"] == 120


def test_normalize_rejects_entities_and_broken_xml(client, storage_root):
    write(
        storage_root,
        "scores/a/tmp/t1/raw.musicxml",
        b'<?xml version="1.0"?><!DOCTYPE score-partwise [<!ENTITY a "aaaa">]><score-partwise/>',
    )
    assert client.post("/convert/normalize", json=body(), headers=KEY).status_code == 422

    write(storage_root, "scores/a/tmp/t1/raw.musicxml", "không phải xml".encode("utf-8"))
    assert client.post("/convert/normalize", json=body(), headers=KEY).status_code == 422


def test_normalize_requires_key_and_safe_paths(client, storage_root):
    write(storage_root, "scores/a/tmp/t1/raw.musicxml", piano_grand_staff())
    assert client.post("/convert/normalize", json=body()).status_code == 401
    assert client.post("/convert/normalize", json=body(outPath="scores/a/../b/v1.musicxml"), headers=KEY).status_code == 422
    assert client.post("/convert/normalize", json=body(outPath="scores/b/musicxml/v1.musicxml"), headers=KEY).status_code == 422
    assert client.post("/convert/normalize", json=body(inPath="scores/a/tmp/t1/missing.musicxml"), headers=KEY).status_code == 422
