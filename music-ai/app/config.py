"""Cấu hình music-ai, đọc từ biến môi trường (đặc tả mục 6.1, 6.5).

Mọi giá trị đều có mặc định để chạy được ngay khi phát triển. Khi triển khai thật phải đặt ``INTERNAL_KEY`` giống
``AI_INTERNAL_KEY`` bên Spring Boot.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

# music-ai/app/config.py -> parents[2] là thư mục gốc repo (chứa music-be, music-web, music-ai)
_REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_INTERNAL_KEY = "dev-internal-key"


@dataclass(frozen=True)
class Settings:
    """Giá trị cấu hình đã đọc xong. Dùng :func:`get_settings` để lấy bản dùng chung."""

    storage_root: Path
    """Gốc thư mục storage dùng chung với Java. Mọi đường dẫn trao đổi đều tương đối so với thư mục này."""

    internal_key: str
    """Khóa bí mật dùng chung với Spring Boot (header ``X-Internal-Key``, cả hai chiều)."""

    java_base_url: str
    """Địa chỉ Spring Boot để gọi callback ``/internal/ai-tasks/**``."""

    task_timeout_s: int = 600
    """Tối đa cho cả một job (10 phút, đặc tả mục 2.2)."""

    page_timeout_s: int = 90
    """Tối đa cho mỗi trang (90 giây, đặc tả mục 2.2)."""

    pdf_dpi: int = 300
    """Độ phân giải khi vẽ trang PDF thành ảnh (đặc tả mục 2.2: PyMuPDF 300 DPI)."""

    max_side_px: int = 3600
    """Cạnh dài tối đa của ảnh làm việc. Lớn hơn thì thu nhỏ ngay khi đọc để giữ bộ nhớ và thời gian xử lý."""

    max_pages: int = 40
    """Số trang tối đa một job nhận. Java đã giới hạn 20; đây là chốt chặn thứ hai."""

    queue_max: int = 50
    """Số job tối đa trong hàng đợi. Đầy thì POST /omr/jobs trả 503 và Java sẽ gửi lại sau."""

    callback_retries: int = 3
    """Số lần thử gọi callback khi lỗi mạng hoặc Java trả 5xx."""

    callback_timeout_s: int = 10
    """Timeout mỗi lần gọi callback."""


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Biến môi trường {name} phải là số nguyên, nhận được {raw!r}") from exc


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Đọc cấu hình một lần. Test muốn đổi cấu hình thì đặt biến môi trường rồi gọi ``get_settings.cache_clear()``."""
    storage = os.environ.get("STORAGE_ROOT", "").strip()
    storage_root = Path(storage) if storage else _REPO_ROOT / "music-be" / "storage"
    return Settings(
        storage_root=storage_root.expanduser().resolve(),
        internal_key=os.environ.get("INTERNAL_KEY", DEFAULT_INTERNAL_KEY),
        java_base_url=os.environ.get("JAVA_BASE_URL", "http://localhost:8080").rstrip("/"),
        task_timeout_s=_int_env("TASK_TIMEOUT_S", 600),
        page_timeout_s=_int_env("PAGE_TIMEOUT_S", 90),
        pdf_dpi=_int_env("PDF_DPI", 300),
        max_side_px=_int_env("MAX_SIDE_PX", 3600),
        max_pages=_int_env("MAX_PAGES", 40),
        queue_max=_int_env("QUEUE_MAX", 50),
        callback_retries=_int_env("CALLBACK_RETRIES", 3),
        callback_timeout_s=_int_env("CALLBACK_TIMEOUT_S", 10),
    )
