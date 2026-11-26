"""``/analysis/diff``. Tự bỏ qua khi chưa cài fastapi/httpx."""

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from tests.xml_samples import note, part, score  # noqa: E402

KEY = {"X-Internal-Key": "test-key"}


@pytest.fixture()
def client():
    return TestClient(main.app)


def write(storage_root, relative, *measures):
    target = storage_root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(score(part("P1", 1, ("G", 2), [list(m) for m in measures], beats=4)))


A = [note("C", 4, 4)]
B = [note("D", 4, 4)]


def test_diff_reports_deleted_measure(client, storage_root):
    write(storage_root, "scores/a/musicxml/v1.musicxml", A, B, B)
    write(storage_root, "scores/a/musicxml/v2.musicxml", A, B)

    response = client.post(
        "/analysis/diff",
        json={"basePath": "scores/a/musicxml/v1.musicxml", "targetPath": "scores/a/musicxml/v2.musicxml"},
        headers=KEY,
    )

    assert response.status_code == 200
    result = response.json()
    assert result["summary"]["deleted"] == 1
    assert result["summary"]["same"] == 2
    assert [m["status"] for m in result["measures"]].count("deleted") == 1


def test_diff_rejects_other_score_and_bad_xml(client, storage_root):
    write(storage_root, "scores/a/musicxml/v1.musicxml", A)
    write(storage_root, "scores/b/musicxml/v1.musicxml", A)
    other = client.post(
        "/analysis/diff",
        json={"basePath": "scores/a/musicxml/v1.musicxml", "targetPath": "scores/b/musicxml/v1.musicxml"},
        headers=KEY,
    )
    assert other.status_code == 422

    broken = storage_root / "scores/a/musicxml/v2.musicxml"
    broken.write_bytes(b"not xml")
    bad = client.post(
        "/analysis/diff",
        json={"basePath": "scores/a/musicxml/v1.musicxml", "targetPath": "scores/a/musicxml/v2.musicxml"},
        headers=KEY,
    )
    assert bad.status_code == 422


def test_diff_requires_internal_key(client, storage_root):
    write(storage_root, "scores/a/musicxml/v1.musicxml", A)
    response = client.post(
        "/analysis/diff",
        json={"basePath": "scores/a/musicxml/v1.musicxml", "targetPath": "scores/a/musicxml/v1.musicxml"},
    )
    assert response.status_code in (401, 403)
