"""``/chords/generate``: gợi ý hợp âm cho một MusicXML trong storage. Tự bỏ qua khi chưa cài fastapi/httpx."""

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from tests.chord_samples import harm, n, r, single  # noqa: E402

KEY = {"X-Internal-Key": "test-key"}
IN = "scores/a/chords/t1-in.musicxml"
OUT = "scores/a/chords/t1-out.musicxml"
TUNE = [
    "".join(n(s, 4, 1) for s in "CEGE"),
    "".join(n(s, 4, 1) for s in "FACA"),
    "".join(n(s, 4, 1) for s in "GBDB"),
    "".join(n(s, 4, 1) for s in "CEGC"),
]


@pytest.fixture()
def client(tmp_path, monkeypatch):
    # Dùng mô hình nhỏ của test thay cho mô hình đã huấn luyện, để kết quả không phụ thuộc dữ liệu huấn luyện
    from pathlib import Path

    from app.chords import hmm

    models = tmp_path / "models"
    models.mkdir()
    (models / "pop.json").write_bytes((Path(__file__).parent / "fixtures" / "chords_tiny_model.json").read_bytes())
    monkeypatch.setattr(hmm, "MODEL_DIR", models)
    return TestClient(main.app)


def write(storage_root, relative, data: bytes):
    target = storage_root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def body(**extra):
    return {"inPath": IN, "outPath": OUT, "style": "POP", **extra}


def test_generate_returns_summary(client, storage_root):
    write(storage_root, IN, single(TUNE))

    response = client.post("/chords/generate", json=body(), headers=KEY)

    assert response.status_code == 200
    result = response.json()
    assert result["outPath"] == OUT
    assert result["key"] == "C major"
    assert result["steps"] == 8
    assert result["filled"] >= 4
    assert result["skipped"] == 0
    assert result["keptExisting"] == 0
    assert b"<harmony>" in (storage_root / OUT).read_bytes()


def test_generate_requires_internal_key(client, storage_root):
    write(storage_root, IN, single(TUNE))
    assert client.post("/chords/generate", json=body()).status_code == 401


def test_generate_rejects_unknown_style(client, storage_root):
    write(storage_root, IN, single(TUNE))
    assert client.post("/chords/generate", json=body(style="ROCK"), headers=KEY).status_code == 422


def test_generate_rejects_output_of_other_score(client, storage_root):
    write(storage_root, IN, single(TUNE))
    response = client.post("/chords/generate", json=body(outPath="scores/b/chords/x.musicxml"), headers=KEY)
    assert response.status_code == 422


def test_generate_reports_no_melody_code(client, storage_root):
    write(storage_root, IN, single([r(4)]))

    response = client.post("/chords/generate", json=body(), headers=KEY)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "NO_MELODY"


def test_generate_replace_existing_overrides_harmonized_score(client, storage_root):
    write(storage_root, IN, single([harm("C") + measure for measure in TUNE]))

    assert client.post("/chords/generate", json=body(), headers=KEY).status_code == 422
    response = client.post("/chords/generate", json=body(replaceExisting=True), headers=KEY)

    assert response.status_code == 200
    assert response.json()["keptExisting"] == 0
