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

    # ---- Nhận diện bằng Transcoda (nhánh feature/omr-recognition) ----

    load_model: bool = True
    """Có nạp Transcoda khi khởi động không. Đặt ``LOAD_MODEL=false`` để chạy riêng phần tiền xử lý (không cần torch)."""

    model_id: str = "btrkeks/transcoda-59M-zeroshot-v1"
    """Tên repo trên Hugging Face, hoặc đường dẫn thư mục model đã tải về (``MODEL_ID=models/transcoda``)."""

    device: str = "auto"
    """``auto`` (cuda nếu có, ngược lại cpu), ``cpu``, ``cuda`` hoặc ``mps``. MPS (Mac Apple Silicon) nhanh hơn CPU
    nhưng chưa được model card xác nhận, hãy thử bằng ``DEVICE=mps``."""

    num_beams: int = 1
    """1 = greedy (nhanh, mặc định); 3 = beam search như bài báo (chính xác hơn nhưng chậm hơn nhiều)."""

    max_tokens: int = 2048
    """Số token sinh tối đa mỗi trang (cũng là độ dài tối đa của model)."""

    repetition_penalty: float = 1.1
    """Phạt lặp token của model card; giúp giảm hiện tượng sinh lặp vô hạn (~1% trường hợp)."""

    inference_page_timeout_s: int = 90
    """Tối đa cho suy luận mỗi trang (90 giây, đặc tả mục 2.3). Chạy CPU chậm thì tăng ``INFERENCE_PAGE_TIMEOUT_S``
    (và ``TASK_TIMEOUT_S``)."""

    model_wait_s: int = 600
    """Job đến khi model còn đang nạp thì chờ tối đa bấy nhiêu giây."""

    kern_parse_mode: str = "fail"
    """``fail``: kern ghép mà music21 không đọc được thì task FAILED ``KERN_PARSE_ERROR`` (đúng đặc tả).
    ``warn``: chỉ ghi cảnh báo và vẫn cho COMPLETED."""

    lenient_spines: bool = True
    """True: căn các trang về số spine phổ biến nhất (thêm/bỏ cột bên phải) và gộp spine đang tách ở cuối trang, nên model
    đọc thiếu một khuông ở vài trang vẫn ghép được. False: số spine khác trang đầu mà không căn lại được thì task FAILED
    ``MERGE_SPINE_MISMATCH`` (đúng đặc tả). Đặt bằng ``MERGE_LENIENT_SPINES``."""

    max_repeat_lines: int = 24
    """Một dòng kern giống hệt nhau lặp liên tiếp quá số này thì coi là model sinh lặp và cắt bớt."""

    # ---- Kiểm tra số khuông theo bố cục và nhận diện lại theo hệ (app/omr/routing.py) ----

    omr_routing: str = "fallback"
    """``off``: như cũ. ``fallback``: trang có số spine khác số khuông trên ảnh thì nhận diện lại từng hệ (sau khi xong
    lượt chính, trong thời gian còn lại của job). ``always``: nhận diện cả hai cách cho mọi trang có bố cục tin cậy rồi
    chọn (để đo, chậm gấp đôi). Đặt bằng ``OMR_ROUTING``."""

    routing_measures: bool = False
    """Trang đúng số spine nhưng có ô nhịp lệch trường độ cũng được nhận diện lại theo hệ (đọc lại mọi hệ của trang nên
    chậm hơn; hệ lệch ô nhịp trong trang đã nhận diện lại theo hệ luôn được xử lý bất kể cờ này). Đặt bằng
    ``OMR_ROUTING_MEASURES=1``."""

    routing_bars: bool = True
    """Trang có số ô nhịp lệch nhiều so với số ô đếm trên ảnh (vạch nhịp, ``app/omr/barlines.py``) cũng được nhận diện lại
    theo hệ, và khi chọn giữa các lần đọc thì ưu tiên lần đúng số ô. Đây là cách sửa lỗi model "lạc chỗ" (đọc lại hệ
    trước, lặp nguyên khối ô nhịp). Tắt bằng ``OMR_ROUTING_BARS=0`` (để đo so sánh)."""

    routing_retry_beams: int = 3
    """Hệ vẫn sai số spine thì thử lại bằng beam search với số beam này (bài báo dùng 3). 0 hoặc 1: không thử lại.
    Đặt bằng ``ROUTING_RETRY_BEAMS``."""

    routing_roles_first: bool = True
    """Hệ giọng hát + piano được đọc riêng (piano 2 khuông, khuông giọng) NGAY từ đầu khi nhận diện lại theo hệ, thay vì đọc
    cả hệ 3 khuông trước: Transcoda chỉ được train trên piano nên đọc cả hệ 3 khuông chỉ đúng số spine 12/30 lần (đọc lại
    beam 3: 14/23) trong storage, còn đọc riêng đúng 27/27. Kết quả ghép không đạt (sai số spine, mất nốt, lệch số ô trên
    ảnh) thì vẫn đọc cả hệ như cũ. Tắt bằng ``OMR_ROLES_FIRST=0``."""

    strip_text: bool = True
    """Xóa lời ca, tên hợp âm và các chữ khác ngoài khuông khỏi ảnh trước khi đưa vào Transcoda (``app/omr/textstrip.py``).
    Model chỉ được train trên nhạc piano không chữ nên lời ca làm nó lạc chỗ/đoán sai. Tắt bằng ``OMR_STRIP_TEXT=0``."""

    music_engine: str = "transcoda"
    """Engine nhận diện ký hiệu nhạc (``app/omr/engines.py``). Đặt bằng ``OMR_ENGINE``."""

    engine_command: str = ""
    """Lệnh cho ``OMR_ENGINE=command`` (``app/omr/command_engine.py``), có ``{image}``, ``{output}``, ``{beams}``.
    Đặt bằng ``OMR_ENGINE_COMMAND``."""

    ottava: str = "auto"
    """Xử lý ``*8va``/``*8ba`` model sinh ra (``app/omr/ottava.py``): ``auto`` bỏ trên khuông giọng hát/khuông đơn và
    đưa nốt về đúng quãng tám in trên ảnh; ``drop`` bỏ trên mọi khuông; ``keep`` giữ nguyên. Đặt bằng ``OMR_OTTAVA``."""

    pitch_check: bool = True
    """Sửa quãng tám theo vị trí đầu nốt trên ảnh (``app/omr/pitch_check.py``): Transcoda hay lệch 1-3 quãng tám nhưng tên
    nốt thì đúng. Tắt bằng ``OMR_PITCH_CHECK=0``."""

    rhythm_fix: bool = True
    """Đổi trường độ nhịp ba đọc nhầm (``12`` -> ``8``) khi ô thành đúng số chỉ nhịp, bỏ nốt hợp âm dài hơn cả ô
    (``app/omr/rhythm_fix.py``). Tắt bằng ``OMR_RHYTHM_FIX=0``."""

    routing_reserve_s: int = 30
    """Giây giữ lại cho bước ghép và xuất: nhận diện lại chỉ chạy khi job còn nhiều thời gian hơn mức này, nên không bao
    giờ làm job quá hạn. Đặt bằng ``ROUTING_RESERVE_S``."""

    # ---- Chấm tin cậy từng ô, đọc lại để bỏ phiếu, AI xác minh (app/omr/review.py, stability.py, llm_check.py) ----

    tta_reads: int = 2
    """Số lần đọc lại (ảnh dịch lên/xuống) mỗi hệ có ô nghi ngờ; 0 = tắt. Cần >= 2 thì mới tự thay ô (hai lần đọc lại
    phải giống nhau). Đặt bằng ``OMR_TTA``."""

    tta_shift_px: int = 3
    """Độ dịch ảnh (pixel trên ảnh trang 1050x1485) giữa các lần đọc lại. Đặt bằng ``OMR_TTA_SHIFT_PX``."""

    tta_max_systems: int = 4
    """Tối đa số hệ được đọc lại mỗi job (hệ nhiều ô nghi ngờ nhất trước). Đặt bằng ``OMR_TTA_MAX_SYSTEMS``."""

    llm_mode: str = "off"
    """``off`` (mặc định) hoặc ``anthropic``: gửi ảnh cắt từng ô tin cậy thấp cho AI xác minh. Đặt bằng ``OMR_LLM``."""

    llm_model: str = "claude-haiku-5-5"
    """Model AI xác minh (nên dùng model rẻ). Đặt bằng ``OMR_LLM_MODEL``."""

    llm_api_key: str = ""
    """Khóa API (``ANTHROPIC_API_KEY``). Thiếu khóa thì lớp AI tự tắt kèm cảnh báo."""

    llm_max_measures: int = 10
    """Trần số ô gửi AI mỗi job. Đặt bằng ``OMR_LLM_MAX_MEASURES``."""

    llm_timeout_s: int = 30
    """Hạn mỗi lần gọi AI (giây). Đặt bằng ``OMR_LLM_TIMEOUT_S``."""


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _float_env(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"Biến môi trường {name} phải là số, nhận được {raw!r}") from exc


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
        internal_key=os.environ.get("INTERNAL_KEY") or os.environ.get("AI_INTERNAL_KEY") or DEFAULT_INTERNAL_KEY,
        java_base_url=os.environ.get("JAVA_BASE_URL", "http://localhost:8080").rstrip("/"),
        task_timeout_s=_int_env("TASK_TIMEOUT_S", 600),
        page_timeout_s=_int_env("PAGE_TIMEOUT_S", 90),
        pdf_dpi=_int_env("PDF_DPI", 300),
        max_side_px=_int_env("MAX_SIDE_PX", 3600),
        max_pages=_int_env("MAX_PAGES", 40),
        queue_max=_int_env("QUEUE_MAX", 50),
        callback_retries=_int_env("CALLBACK_RETRIES", 3),
        callback_timeout_s=_int_env("CALLBACK_TIMEOUT_S", 10),
        load_model=_bool_env("LOAD_MODEL", True),
        model_id=os.environ.get("MODEL_ID", "").strip() or "btrkeks/transcoda-59M-zeroshot-v1",
        device=(os.environ.get("DEVICE", "").strip() or "auto").lower(),
        num_beams=max(1, _int_env("NUM_BEAMS", 1)),
        max_tokens=_int_env("MAX_TOKENS", 2048),
        repetition_penalty=_float_env("REPETITION_PENALTY", 1.1),
        inference_page_timeout_s=_int_env("INFERENCE_PAGE_TIMEOUT_S", 90),
        model_wait_s=_int_env("MODEL_WAIT_S", 600),
        kern_parse_mode=(os.environ.get("KERN_PARSE_MODE", "").strip() or "fail").lower(),
        lenient_spines=_bool_env("MERGE_LENIENT_SPINES", True),
        max_repeat_lines=_int_env("MAX_REPEAT_LINES", 24),
        omr_routing=_routing_env(),
        routing_measures=os.environ.get("OMR_ROUTING_MEASURES", "").strip().lower() in ("1", "true", "yes", "on"),
        routing_bars=_bool_env("OMR_ROUTING_BARS", True),
        routing_retry_beams=max(0, _int_env("ROUTING_RETRY_BEAMS", 3)),
        routing_roles_first=_bool_env("OMR_ROLES_FIRST", True),
        strip_text=_bool_env("OMR_STRIP_TEXT", True),
        routing_reserve_s=max(0, _int_env("ROUTING_RESERVE_S", 30)),
        music_engine=(os.environ.get("OMR_ENGINE", "").strip() or "transcoda").lower(),
        engine_command=os.environ.get("OMR_ENGINE_COMMAND", "").strip(),
        pitch_check=_bool_env("OMR_PITCH_CHECK", True),
        rhythm_fix=_bool_env("OMR_RHYTHM_FIX", True),
        ottava=_choice_env("OMR_OTTAVA", "auto", ("auto", "drop", "keep")),
        tta_reads=max(0, _int_env("OMR_TTA", 2)),
        tta_shift_px=max(1, _int_env("OMR_TTA_SHIFT_PX", 3)),
        tta_max_systems=max(0, _int_env("OMR_TTA_MAX_SYSTEMS", 4)),
        llm_mode=_choice_env("OMR_LLM", "off", ("off", "anthropic")),
        llm_model=os.environ.get("OMR_LLM_MODEL", "").strip() or "claude-haiku-5-5",
        llm_api_key=os.environ.get("ANTHROPIC_API_KEY", "").strip(),
        llm_max_measures=max(0, _int_env("OMR_LLM_MAX_MEASURES", 10)),
        llm_timeout_s=max(5, _int_env("OMR_LLM_TIMEOUT_S", 30)),
    )


def _choice_env(name: str, default: str, choices: tuple[str, ...]) -> str:
    raw = (os.environ.get(name, "").strip() or default).lower()
    if raw not in choices:
        raise ValueError(f"{name} phải là một trong {', '.join(choices)}, nhận được {raw!r}")
    return raw


def _routing_env() -> str:
    raw = (os.environ.get("OMR_ROUTING", "").strip() or "fallback").lower()
    if raw not in ("off", "fallback", "always"):
        raise ValueError(f"OMR_ROUTING phải là off, fallback hoặc always, nhận được {raw!r}")
    return raw
