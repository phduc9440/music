"""Transcoda giả cho test: trả sẵn chuỗi kern theo thứ tự trang, không cần torch/transformers."""

from __future__ import annotations

import time
from typing import Callable, Optional

from app.omr.transcoda import RecognitionResult, RecognizerNotReady


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

    def wait_ready(self, check, timeout_s: float) -> None:
        if self.state != "ready":
            raise RecognizerNotReady(self.error or f"model {self.state}")

    def recognize(self, png_path, check) -> RecognitionResult:
        index = len(self.calls)
        self.calls.append(str(png_path))
        if self.on_call:
            self.on_call(index)
        deadline = time.monotonic() + self.delay_s
        while time.monotonic() < deadline:  # mô phỏng suy luận lâu nhưng vẫn kiểm tra hủy/timeout như Transcoda thật
            check()
            time.sleep(0.01)
        check()
        text = self.outputs[min(index, len(self.outputs) - 1)]
        return RecognitionResult(text=text, tokens=len(text.split()), truncated=self.truncated, millis=7)
