import uuid

import pytest
from pydantic import ValidationError

from app import storage
from app.schemas import JobRequest

TASK = str(uuid.uuid4())


def _touch(root, rel):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x")


@pytest.mark.parametrize("bad", ["../x", "a/../../x", "/etc/passwd", "C:/x", "", "  ", "scores/a/..b"])
def test_resolve_rejects_unsafe_paths(bad):
    with pytest.raises(ValueError):
        storage.resolve(bad)


def test_resolve_stays_inside_root(storage_root):
    assert storage.resolve("scores/a/b.png") == (storage_root / "scores/a/b.png").resolve()
    assert storage.to_relative(storage.resolve("scores/a/b.png")) == "scores/a/b.png"


def test_valid_job_request(storage_root):
    _touch(storage_root, "scores/s1/original/01-a.pdf")
    job = JobRequest(
        taskId=TASK,
        scoreId="s1",
        inputs=[{"path": "scores/s1/original/01-a.pdf", "kind": "PDF"}],
        options={"preprocess": True},
    )
    assert job.options.binarize is True and job.options.stopAfter == "MERGE"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d.update(taskId="not-a-uuid"),
        lambda d: d["inputs"][0].update(path="../../etc/passwd"),
        lambda d: d["inputs"][0].update(path="scores/s1/original/missing.pdf"),
        lambda d: d["inputs"][0].update(path="scores/other/original/01-a.pdf"),  # sai bản nhạc
        lambda d: d["inputs"][0].update(kind="DOC"),
        lambda d: d.update(inputs=[]),
        lambda d: d["inputs"].append(dict(d["inputs"][0])),  # job PDF có 2 file
    ],
)
def test_invalid_job_request_is_rejected(storage_root, mutate):
    _touch(storage_root, "scores/s1/original/01-a.pdf")
    _touch(storage_root, "scores/other/original/01-a.pdf")
    data = {
        "taskId": TASK,
        "scoreId": "s1",
        "inputs": [{"path": "scores/s1/original/01-a.pdf", "kind": "PDF"}],
    }
    mutate(data)
    with pytest.raises(ValidationError):
        JobRequest(**data)


def test_mixed_kinds_and_duplicate_pages_rejected(storage_root):
    _touch(storage_root, "scores/s1/a.pdf")
    _touch(storage_root, "scores/s1/b.png")
    with pytest.raises(ValidationError):
        JobRequest(
            taskId=TASK,
            scoreId="s1",
            inputs=[{"path": "scores/s1/a.pdf", "kind": "PDF"}, {"path": "scores/s1/b.png", "kind": "IMAGE", "page": 1}],
        )
    with pytest.raises(ValidationError):
        JobRequest(
            taskId=TASK,
            scoreId="s1",
            inputs=[
                {"path": "scores/s1/b.png", "kind": "IMAGE", "page": 1},
                {"path": "scores/s1/b.png", "kind": "IMAGE", "page": 1},
            ],
        )
