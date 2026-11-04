"""FastAPI của music-ai (đặc tả mục 6.2). Chỉ Spring Boot gọi vào đây, không phải web.

Chạy: ``uvicorn app.main:app --host 127.0.0.1 --port 8000`` (xem README).
"""

from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager
from typing import Optional
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException

from app.config import get_settings
from app.jobs import JobManager, QueueFullError
from app.schemas import JobRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("music-ai")

manager = JobManager()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    log.info("STORAGE_ROOT = %s, JAVA_BASE_URL = %s", settings.storage_root, settings.java_base_url)
    manager.start()
    yield
    manager.stop()


app = FastAPI(title="music-ai", version="0.1.0", lifespan=lifespan)


def require_internal_key(x_internal_key: Optional[str] = Header(default=None)) -> None:
    """Chỉ Spring Boot (biết khóa dùng chung) được gọi các endpoint /omr/**."""
    expected = get_settings().internal_key
    if not x_internal_key or not hmac.compare_digest(x_internal_key.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Sai hoặc thiếu X-Internal-Key")


def _detect_device() -> str:
    """cuda nếu có GPU NVIDIA, mps trên Mac Apple Silicon, ngược lại cpu. Không có torch thì là cpu."""
    try:
        import torch  # noqa: PLC0415

        if torch.cuda.is_available():
            return "cuda"
        mps = getattr(torch.backends, "mps", None)
        if mps is not None and mps.is_available():
            return "mps"
    except Exception:  # noqa: BLE001
        pass
    return "cpu"


@app.get("/health")
def health() -> dict:
    """Trạng thái dịch vụ. ``modelLoaded`` luôn false ở nhánh tiền xử lý (chưa nạp Transcoda)."""
    return {"modelLoaded": False, "device": _detect_device(), "queueSize": manager.queue_size}


@app.post("/omr/jobs", status_code=202, dependencies=[Depends(require_internal_key)])
def submit_job(job: JobRequest) -> dict:
    """Nhận job OMR và xử lý nền. Trả 202 ngay. Dữ liệu sai: 422. Gửi lại cùng taskId: vẫn 202, không chạy lần hai."""
    try:
        status = manager.submit(job)
    except QueueFullError:
        raise HTTPException(status_code=503, detail="Hàng đợi đã đầy") from None
    return {"taskId": str(job.taskId), "status": status}


@app.delete("/omr/jobs/{task_id}", dependencies=[Depends(require_internal_key)])
def cancel_job(task_id: UUID) -> dict:
    """Hủy job đang chờ/chạy. ``cancelled=false`` nghĩa là không có job như vậy (đã xong hoặc chưa từng nhận)."""
    return {"taskId": str(task_id), "cancelled": manager.cancel(str(task_id))}
