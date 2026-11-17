"""Registry các engine nhận diện ký hiệu nhạc (nhánh A của pipeline).

Pipeline chỉ phụ thuộc giao diện :class:`app.omr.transcoda.Recognizer` (ảnh trang/hệ -> ``**kern``) cộng vòng đời nạp
model (``start_loading``, ``state``, ``model_loaded``, ``device``, ``error``). Đổi model không phải viết lại pipeline:

* model Transcoda khác (bản fine-tune trên Kaggle): chỉ cần ``MODEL_ID=/đường/dẫn/checkpoint`` (cùng kiến trúc);
* engine khác (ví dụ một model sinh kern theo từng khuông): viết lớp có cùng giao diện rồi :func:`register_engine`,
  chọn bằng ``OMR_ENGINE=<tên>``;
* engine chạy bằng lệnh ngoài (``OMR_ENGINE=command`` + ``OMR_ENGINE_COMMAND``): để thử nhanh một model có script suy
  luận riêng (ví dụ Transcoda v2.1 qua ``scripts/infer.py`` của repo gốc) trên benchmark mà không sửa pipeline.

Engine phải trả **kern** vì các bước sau (làm sạch, nhận diện lại theo hệ, ghép, kiểm tra ô nhịp, xuất MusicXML) đều làm
việc trên kern. Engine trả MusicXML (Audiveris, homr) cần một bộ chuyển MusicXML -> kern trước (chưa làm: xem
phần "Phương án đã cân nhắc" trong tài liệu thiết kế).
"""

from __future__ import annotations

import threading
from typing import Any, Callable, Optional

from app.config import Settings, get_settings

ENGINE_TRANSCODA = "transcoda"

EngineFactory = Callable[[Settings], Any]


def _transcoda(settings: Settings) -> Any:
    from app.omr.transcoda import TranscodaRecognizer  # noqa: PLC0415

    return TranscodaRecognizer(settings)


def _command(settings: Settings) -> Any:
    from app.omr.command_engine import CommandRecognizer  # noqa: PLC0415

    return CommandRecognizer(settings)


ENGINE_COMMAND = "command"

_FACTORIES: dict[str, EngineFactory] = {ENGINE_TRANSCODA: _transcoda, ENGINE_COMMAND: _command}
_shared: Optional[Any] = None
_shared_name: Optional[str] = None
_lock = threading.Lock()


class UnknownEngine(ValueError):
    """``OMR_ENGINE`` không có trong registry."""


def register_engine(name: str, factory: EngineFactory) -> None:
    """Đăng ký engine mới (gọi lúc import module của engine, trước khi dịch vụ khởi động)."""
    _FACTORIES[name.strip().lower()] = factory


def available_engines() -> list[str]:
    return sorted(_FACTORIES)


def create_engine(name: Optional[str] = None, settings: Optional[Settings] = None) -> Any:
    settings = settings or get_settings()
    key = (name or settings.music_engine).strip().lower()
    factory = _FACTORIES.get(key)
    if factory is None:
        raise UnknownEngine(f"OMR_ENGINE={key!r} không có (hiện có: {', '.join(available_engines())})")
    return factory(settings)


def get_music_engine() -> Any:
    """Engine dùng chung của cả dịch vụ (tạo một lần theo ``OMR_ENGINE``)."""
    global _shared, _shared_name
    with _lock:
        if _shared is None:
            settings = get_settings()
            _shared = create_engine(settings=settings)
            _shared_name = settings.music_engine
        return _shared


def music_engine_name() -> str:
    return _shared_name or get_settings().music_engine
