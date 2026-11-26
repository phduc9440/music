"""Cấu hình test: trỏ STORAGE_ROOT vào thư mục tạm, mỗi test một thư mục riêng."""

import os
import sys
from pathlib import Path

import pytest

# Cho phép `import app` và `import tests.synth` khi chạy pytest từ thư mục music-ai
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def storage_root(tmp_path, monkeypatch):
    root = tmp_path / "storage"
    root.mkdir()
    monkeypatch.setenv("STORAGE_ROOT", str(root))
    monkeypatch.setenv("INTERNAL_KEY", "test-key")
    from app import config

    config.get_settings.cache_clear()
    yield root
    config.get_settings.cache_clear()
    os.environ.pop("STORAGE_ROOT", None)
