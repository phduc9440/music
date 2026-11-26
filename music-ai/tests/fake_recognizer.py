"""Transcoda giả cho test: trả sẵn chuỗi kern theo thứ tự trang, không cần torch/transformers."""

from __future__ import annotations

import time
from typing import Callable, Optional

from app.omr.transcoda import BarlineLimit, RecognitionResult, RecognizerNotReady


class FakeRecognizer:
    def __init__(
        self,
        outputs: list[str],
        *,
        state: str = "ready",
        error: Optional[str] = None,
        delay_s: float = 0.0,
        truncated: bool = False,
        on_call: Optional[Callable[[int], None]] = None,
    ) -> None:
        self.outputs = outputs
        self.state = state
        self.error = error
        self.delay_s = delay_s
        self.truncated = truncated
        self.on_call = on_call
        self.calls: list[str] = []
        self.beams: list = []
        """``num_beams`` của từng lần gọi (None = mặc định)."""
        self.limits: list = []
        """``max_measures`` của từng lần gọi (None = không giới hạn)."""

    def wait_ready(self, check, timeout_s: float) -> None:
        if self.state != "ready":
            raise RecognizerNotReady(self.error or f"model {self.state}")

    def recognize(self, png_path, check, num_beams=None, max_measures=None) -> RecognitionResult:
        index = len(self.calls)
        self.calls.append(str(png_path))
        self.beams.append(num_beams)
        self.limits.append(max_measures)
        if self.on_call:
            self.on_call(index)
        deadline = time.monotonic() + self.delay_s
        while time.monotonic() < deadline:  # mô phỏng suy luận lâu nhưng vẫn kiểm tra hủy/timeout như Transcoda thật
            check()
            time.sleep(0.01)
        check()
        text = self.outputs[min(index, len(self.outputs) - 1)]
        stopped = False
        if max_measures and BarlineLimit(max_measures).exceeded(text):
            # Như Transcoda thật: dừng ngay sau vạch nhịp vượt giới hạn
            lines = text.split("\n")
            bars = [i for i, line in enumerate(lines) if line.startswith("=")]
            text = "\n".join(lines[: bars[max_measures + 1] + 1]) + "\n"
            stopped = True
        return RecognitionResult(
            text=text,
            tokens=len(text.split()),
            truncated=self.truncated or stopped,
            millis=7,
            stopped_early=stopped,
        )
