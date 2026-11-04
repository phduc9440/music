"""Nạp Transcoda một lần khi khởi động và nhận diện từng trang (đặc tả mục 2.3, bước "Xử lý phía Python" số 1).

Mô hình ``btrkeks/transcoda-59M-zeroshot-v1`` (VisionEncoderDecoder: ConvNeXt-V2-Tiny + decoder, ~59 triệu tham số)
nhận một ảnh trang đầy đủ 1050x1485 và sinh ra chuỗi ``**kern``. Cách nạp và giải mã theo model card:

* ``AutoModelForCausalLM.from_pretrained(repo, trust_remote_code=True)`` (cần ``transformers`` < 5);
* ``PreTrainedTokenizerFast.from_pretrained(repo)``;
* ``model.generate(pixel_values, image_sizes, max_length=2048, do_sample=False, repetition_penalty=1.1)``;
* ``tokenizer.decode(ids, skip_special_tokens=True)``.

``torch`` và ``transformers`` được import khi nạp (không ở đầu file) để phần còn lại của dịch vụ và các test chạy
được dù chưa cài chúng. Pipeline chỉ phụ thuộc giao diện :class:`Recognizer` nên test có thể thay bằng bản giả.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional, Protocol

from app.config import Settings, get_settings

log = logging.getLogger(__name__)

STATE_IDLE = "idle"
STATE_LOADING = "loading"
STATE_READY = "ready"
STATE_FAILED = "failed"
STATE_DISABLED = "disabled"


class RecognizerNotReady(Exception):
    """Model chưa dùng được: bị tắt (``LOAD_MODEL=false``), nạp lỗi, hoặc quá thời gian chờ nạp."""


@dataclass
class RecognitionResult:
    """Kết quả nhận diện một trang."""

    text: str
    """Chuỗi kern thô do model sinh (đã decode, chưa làm sạch)."""

    tokens: int
    """Số token đã sinh."""

    truncated: bool
    """True nếu chạm giới hạn ``max_tokens`` (có thể bị cắt giữa chừng hoặc sinh lặp)."""

    millis: int
    """Thời gian suy luận (mili giây)."""


class Recognizer(Protocol):
    """Giao diện pipeline dùng; :class:`TranscodaRecognizer` là bản thật, test dùng bản giả."""

    def wait_ready(self, check: Callable[[], None], timeout_s: float) -> None:
        """Chờ model sẵn sàng, gọi ``check()`` (hủy/hết hạn) đều đặn. Ném :class:`RecognizerNotReady` nếu không được."""

    def recognize(self, png_path, check: Callable[[], None]) -> RecognitionResult:
        """Nhận diện một ảnh trang 1050x1485. ``check()`` được gọi giữa các token để hủy/timeout kịp thời."""


class TranscodaRecognizer:
    """Giữ model trong bộ nhớ. Nạp ở luồng nền để dịch vụ lên ngay; ``/health`` báo ``modelLoaded`` khi xong."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()
        self._state = STATE_IDLE if self._settings.load_model else STATE_DISABLED
        self._error: Optional[str] = None
        # Kiểu Any vì torch/transformers chỉ được import khi nạp; tránh IDE báo "None không có generate"
        self._model: Any = None
        self._tokenizer: Any = None
        self._device = "cpu"
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ trạng thái

    @property
    def state(self) -> str:
        return self._state

    @property
    def model_loaded(self) -> bool:
        return self._state == STATE_READY

    @property
    def device(self) -> str:
        """Thiết bị model đang chạy (hoặc dự kiến chạy khi chưa nạp xong)."""
        return self._device

    @property
    def error(self) -> Optional[str]:
        return self._error

    # ------------------------------------------------------------------ nạp model

    def start_loading(self) -> None:
        """Bắt đầu nạp model ở luồng nền (gọi một lần lúc khởi động). Không làm gì nếu bị tắt hoặc đã nạp."""
        with self._lock:
            if self._state != STATE_IDLE:
                return
            self._state = STATE_LOADING
        threading.Thread(target=self.load, name="transcoda-loader", daemon=True).start()

    def load(self) -> None:
        """Nạp model (chặn tới khi xong). Lỗi được ghi lại trong :attr:`error`, không ném ra ngoài."""
        started = time.monotonic()
        try:
            import torch  # noqa: PLC0415  # type: ignore[import-not-found]
            from transformers import AutoModelForCausalLM, PreTrainedTokenizerFast  # noqa: PLC0415

            device = self._pick_device(torch)
            self._device = device
            model_id = self._settings.model_id
            log.info("Đang nạp Transcoda %s lên %s (lần đầu sẽ tải về, có thể mất vài phút)...", model_id, device)
            # trust_remote_code: kiến trúc vision-encoder-decoder tùy biến nằm trong repo model, không có sẵn
            # trong transformers. Lần đầu sẽ tải thêm trọng số ConvNeXt-V2-Tiny rồi bị ghi đè bởi trọng số Transcoda
            # (model card nói đây là bình thường).
            model = AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True)
            tokenizer = PreTrainedTokenizerFast.from_pretrained(model_id)
            model = model.to(device).eval()
            self._model, self._tokenizer = model, tokenizer
            self._state = STATE_READY
            log.info("Đã nạp Transcoda sau %.1f giây", time.monotonic() - started)
        except Exception as exc:  # noqa: BLE001 - mọi lỗi nạp đều phải thành trạng thái FAILED có thông điệp
            self._error = f"{type(exc).__name__}: {exc}"
            self._state = STATE_FAILED
            log.error("Không nạp được Transcoda: %s", self._error)

    def _pick_device(self, torch) -> str:
        wanted = self._settings.device
        if wanted == "auto":
            return "cuda" if torch.cuda.is_available() else "cpu"
        if wanted == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("DEVICE=cuda nhưng máy không có GPU NVIDIA dùng được")
        if wanted == "mps":
            mps = getattr(torch.backends, "mps", None)
            if mps is None or not mps.is_available():
                raise RuntimeError("DEVICE=mps nhưng máy không hỗ trợ MPS")
        if wanted not in ("cpu", "cuda", "mps"):
            raise RuntimeError(f"DEVICE={wanted!r} không hợp lệ (auto, cpu, cuda, mps)")
        return wanted

    def wait_ready(self, check: Callable[[], None], timeout_s: float) -> None:
        """Chờ nạp xong. Hủy/hết hạn job thì ``check()`` tự ném; ở đây chỉ ném khi model hỏng hoặc chờ quá lâu."""
        deadline = time.monotonic() + timeout_s
        while True:
            if self._state == STATE_READY:
                return
            if self._state == STATE_DISABLED:
                raise RecognizerNotReady("model bị tắt (LOAD_MODEL=false)")
            if self._state == STATE_IDLE:
                # Chưa ai gọi start_loading(): chờ cũng không bao giờ xong
                raise RecognizerNotReady("model chưa được nạp (dịch vụ chưa gọi start_loading)")
            if self._state == STATE_FAILED:
                raise RecognizerNotReady(self._error or "nạp model lỗi")
            check()
            if time.monotonic() > deadline:
                raise RecognizerNotReady(f"model chưa nạp xong sau {int(timeout_s)} giây")
            time.sleep(0.5)

    # ------------------------------------------------------------------ suy luận

    def recognize(self, png_path, check: Callable[[], None]) -> RecognitionResult:
        """Chạy Transcoda trên một ảnh trang (PNG 1050x1485 do bước tiền xử lý tạo ra)."""
        if self._state != STATE_READY:
            raise RecognizerNotReady("model chưa sẵn sàng")
        import torch  # noqa: PLC0415
        from transformers import StoppingCriteria, StoppingCriteriaList  # noqa: PLC0415

        from app.omr.model_input import to_model_input  # noqa: PLC0415

        settings = self._settings
        pixel_values, image_sizes = to_model_input(png_path)
        pixel_values = pixel_values.to(self._device)
        image_sizes = image_sizes.to(self._device)

        class _CheckEveryToken(StoppingCriteria):
            """Gọi ``check()`` sau mỗi token: Java hủy hoặc quá 90 giây thì ngoại lệ thoát khỏi ``generate``."""

            def __call__(self, input_ids, scores, **kwargs):  # noqa: ANN001
                check()
                return torch.zeros(input_ids.shape[0], dtype=torch.bool, device=input_ids.device)

        kwargs = dict(
            pixel_values=pixel_values,
            image_sizes=image_sizes,
            max_length=settings.max_tokens,
            do_sample=False,
            num_beams=settings.num_beams,
            repetition_penalty=settings.repetition_penalty,
        )
        started = time.monotonic()
        with torch.no_grad():
            try:
                output = self._model.generate(stopping_criteria=StoppingCriteriaList([_CheckEveryToken()]), **kwargs)
            except TypeError:
                # Bản model tùy biến không nhận stopping_criteria: vẫn chạy được, chỉ không ngắt được giữa chừng
                log.warning("generate() không nhận stopping_criteria, không thể hủy giữa một trang")
                output = self._model.generate(**kwargs)
        check()
        ids = output[0]
        text = self._tokenizer.decode(ids, skip_special_tokens=True)
        tokens = int(ids.shape[-1])
        return RecognitionResult(
            text=text,
            tokens=tokens,
            truncated=tokens >= settings.max_tokens,
            millis=int((time.monotonic() - started) * 1000),
        )


_recognizer: Optional[TranscodaRecognizer] = None
_recognizer_lock = threading.Lock()


def get_recognizer() -> TranscodaRecognizer:
    """Bản dùng chung của cả dịch vụ (tạo khi gọi lần đầu)."""
    global _recognizer
    with _recognizer_lock:
        if _recognizer is None:
            _recognizer = TranscodaRecognizer()
        return _recognizer
