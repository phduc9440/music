"""Client gọi callback ``/internal/ai-tasks/**`` của Spring Boot (đặc tả mục 6.3).

music-ai KHÔNG kết nối MySQL: mọi thay đổi trạng thái đều đi qua các callback này. Chỉ dùng thư viện chuẩn
(``urllib``) để không phụ thuộc thêm gói nào.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any, Optional

from app.config import get_settings

log = logging.getLogger(__name__)

INTERNAL_KEY_HEADER = "X-Internal-Key"


class TaskGone(Exception):
    """Java trả 404: task không còn (bản nhạc đã bị xóa). Job nên dừng, không cần báo lại."""


class JavaCallback:
    """Gửi tiến độ/kết quả của một task về Spring Boot.

    Quy ước kết quả: mỗi hàm trả ``True`` nếu Java nhận (HTTP 2xx), ``False`` nếu không gửi được. Lỗi mạng và 5xx được
    thử lại; 4xx (ví dụ 400 vì tiến độ giảm, 401 sai khóa) không thử lại vì gửi lại cũng vô ích. Riêng 404 ném
    :class:`TaskGone`. Task đã COMPLETED/FAILED/CANCELLED thì Java vẫn trả 200 nên không bao giờ bị thử lại mãi.
    """

    def __init__(self, task_id: str) -> None:
        self.task_id = task_id
        self._settings = get_settings()

    # ------------------------------------------------------------------ API

    def progress(self, progress: int, step: str) -> bool:
        """Báo tiến độ 0-100 và bước hiện tại (SPLIT_PDF, PREPROCESS...)."""
        return self._post("progress", {"progress": int(progress), "step": step})

    def file(
        self,
        *,
        file_type: str,
        storage_path: str,
        page_number: Optional[int],
        content_type: str,
        size_bytes: int,
        meta: Optional[dict[str, Any]] = None,
        version: Optional[int] = None,
    ) -> bool:
        """Báo đã ghi xong một file kết quả (ví dụ ``pages/page-001.png``).

        ``version`` chỉ dùng cho MUSICXML (version của chính nó) và MIDI (version MusicXML nguồn), xem mục 1.2.
        """
        payload: dict[str, Any] = {
            "fileType": file_type,
            "storagePath": storage_path,
            "pageNumber": page_number,
            "contentType": content_type,
            "sizeBytes": size_bytes,
        }
        if meta is not None:
            payload["meta"] = meta
        if version is not None:
            payload["version"] = version
        return self._post("files", payload)

    def complete(self, result_data: dict[str, Any], score_metadata: Optional[dict[str, Any]] = None) -> bool:
        """Báo hoàn tất. ``result_data`` được Java lưu nguyên vào ``ai_tasks.result_data``."""
        payload: dict[str, Any] = {"resultData": result_data}
        if score_metadata:
            payload["scoreMetadata"] = score_metadata
        return self._post("complete", payload)

    def fail(self, error_code: str, message: Optional[str] = None) -> bool:
        """Báo lỗi. Java lưu ``error_message`` dạng ``"MÃ"`` hoặc ``"MÃ: message"`` (ví dụ ``PAGE_UNREADABLE: trang 3``)."""
        payload: dict[str, Any] = {"errorCode": error_code}
        if message:
            payload["message"] = message
        return self._post("fail", payload)

    # ------------------------------------------------------------------ nội bộ

    def _post(self, suffix: str, payload: dict[str, Any]) -> bool:
        url = f"{self._settings.java_base_url}/internal/ai-tasks/{self.task_id}/{suffix}"
        data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            INTERNAL_KEY_HEADER: self._settings.internal_key,
        }
        attempts = max(1, self._settings.callback_retries)

        for attempt in range(1, attempts + 1):
            request = urllib.request.Request(url, data=data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(request, timeout=self._settings.callback_timeout_s):
                    return True
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    raise TaskGone(self.task_id) from exc
                if 400 <= exc.code < 500:
                    log.warning("Java từ chối callback %s của task %s: HTTP %s", suffix, self.task_id, exc.code)
                    return False
                log.warning("Callback %s lỗi HTTP %s (lần %s/%s)", suffix, exc.code, attempt, attempts)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                log.warning("Callback %s lỗi mạng (lần %s/%s): %s", suffix, attempt, attempts, exc)
            if attempt < attempts:
                time.sleep(0.5 * attempt)

        log.error("Không gửi được callback %s của task %s sau %s lần", suffix, self.task_id, attempts)
        return False
