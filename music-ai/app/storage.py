"""Truy cập storage dùng chung với Java, có chặn path traversal (đặc tả mục 6.1).

Giống ``LocalFileStorageService.resolve`` bên Java: mọi đường dẫn trao đổi là đường dẫn TƯƠNG ĐỐI so với gốc storage,
và đường dẫn sau khi chuẩn hóa không được thoát ra ngoài gốc đó.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.config import get_settings

_WINDOWS_DRIVE = re.compile(r"^[A-Za-z]:")


def resolve(relative: str) -> Path:
    """Đổi đường dẫn tương đối thành đường dẫn tuyệt đối trên đĩa.

    Ném ``ValueError`` (tiếng Việt) nếu đường dẫn rỗng, là đường dẫn tuyệt đối, chứa ``..`` hoặc thoát khỏi gốc
    storage. Không kiểm tra file có tồn tại hay không.
    """
    if not relative or not relative.strip() or "\x00" in relative:
        raise ValueError("Đường dẫn không được để trống")
    normalized = relative.strip().replace("\\", "/")
    if normalized.startswith("/") or _WINDOWS_DRIVE.match(normalized):
        raise ValueError("Đường dẫn phải là đường dẫn tương đối so với gốc storage")
    # Giống Java: cấm mọi chuỗi ".." (kể cả "a..b") cho đơn giản và an toàn
    if ".." in normalized:
        raise ValueError("Đường dẫn không được chứa '..'")

    root = get_settings().storage_root
    target = (root / normalized).resolve()
    if target != root and root not in target.parents:
        raise ValueError("Đường dẫn nằm ngoài thư mục storage")
    return target


def resolve_existing_file(relative: str) -> Path:
    """Như :func:`resolve` nhưng bắt buộc là file đang tồn tại. Ném ``ValueError`` nếu không."""
    path = resolve(relative)
    if not path.is_file():
        raise ValueError(f"File không tồn tại: {relative}")
    return path


def to_relative(path: Path) -> str:
    """Đường dẫn tuyệt đối trong storage -> đường dẫn tương đối dùng dấu ``/`` để gửi cho Java."""
    return path.resolve().relative_to(get_settings().storage_root).as_posix()
