"""Engine nhận diện chạy bằng lệnh ngoài: mỗi ảnh (trang hoặc hệ) gọi một lệnh, đọc ``**kern`` trả về.

Dùng để so sánh nhanh model khác trên benchmark mà không viết adapter riêng, ví dụ Transcoda v2.1 (chỉ nạp được bằng
``scripts/infer.py`` của repo gốc) hoặc checkpoint fine-tune chạy trong venv khác::

    OMR_ENGINE=command
    OMR_ENGINE_COMMAND='/path/venv/bin/python /path/transcoda/scripts/infer.py --image {image} --out {output}'

Lệnh nhận ``{image}`` (PNG 1050x1485 như Transcoda v1), ``{output}`` (file kern lệnh phải ghi; không ghi thì đọc
stdout) và ``{beams}``. Cờ dòng lệnh thật của script nào thì xem ``--help`` của script đó (không đoán ở đây).

Hạn chế: model được nạp lại ở mỗi lần gọi (chậm hơn adapter chạy trong tiến trình), không dừng sớm theo số vạch nhịp.
Hủy job/hết hạn vẫn dừng được: tiến trình con bị kết thúc.
"""

from __future__ import annotations

import logging
import shlex
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Callable, Optional

from app.config import Settings, get_settings
from app.omr.transcoda import STATE_FAILED, STATE_READY, RecognitionResult, RecognizerNotReady

log = logging.getLogger(__name__)


class CommandRecognizer:
    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()
        self.error: Optional[str] = None
        self.state = STATE_READY if self._settings.engine_command else STATE_FAILED
        if not self._settings.engine_command:
            self.error = "OMR_ENGINE=command nhưng chưa đặt OMR_ENGINE_COMMAND"
        self.device = "external"

    @property
    def model_loaded(self) -> bool:
        return self.state == STATE_READY

    def start_loading(self) -> None:  # không có gì để nạp trước
        return None

    def load(self) -> None:
        return None

    def wait_ready(self, check: Callable[[], None], timeout_s: float) -> None:
        if self.state != STATE_READY:
            raise RecognizerNotReady(self.error or "engine lệnh ngoài chưa sẵn sàng")

    def recognize(
        self, png_path, check: Callable[[], None], num_beams: Optional[int] = None, max_measures: Optional[int] = None
    ) -> RecognitionResult:
        beams = num_beams or self._settings.num_beams
        with tempfile.TemporaryDirectory(prefix="omr-cmd-") as tmp:
            output = Path(tmp) / "out.krn"
            command = [
                part.format(image=str(png_path), output=str(output), beams=beams)
                for part in shlex.split(self._settings.engine_command)
            ]
            started = time.monotonic()
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                while process.poll() is None:
                    check()  # hủy/hết hạn: ném ngoại lệ, tiến trình con bị kết thúc ở finally
                    time.sleep(0.2)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
            stdout, stderr = process.communicate()
            millis = int((time.monotonic() - started) * 1000)
            if process.returncode != 0:
                raise RuntimeError(f"lệnh nhận diện lỗi (mã {process.returncode}): {stderr.strip()[-300:]}")
            text = output.read_text(encoding="utf-8") if output.is_file() else stdout
        return RecognitionResult(text=text, tokens=len(text.split()), truncated=False, millis=millis)
