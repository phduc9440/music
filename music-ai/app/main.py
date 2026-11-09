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

from app import storage
from app.analysis.diff import diff_files
from app.config import get_settings
from app.convert.errors import ConversionError
from app.convert.kern import kern_file_to_musicxml_file
from app.convert.midi import musicxml_file_to_midi_file
from app.convert.normalize import normalize_musicxml_file
from app.convert.prepare import prepare_musicxml
from app.jobs import JobManager, QueueFullError
from app.omr.transcoda import get_recognizer
from app.schemas import (
    DiffRequest,
    JobRequest,
    KernToMusicXmlRequest,
    MusicXmlToMidiRequest,
    NormalizeRequest,
    PrepareRequest,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("music-ai")

manager = JobManager()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    log.info("STORAGE_ROOT = %s, JAVA_BASE_URL = %s", settings.storage_root, settings.java_base_url)
    # Nạp Transcoda một lần ở luồng nền (đặc tả mục 2.3): dịch vụ lên ngay, /health báo modelLoaded khi xong
    get_recognizer().start_loading()
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
    """Trạng thái dịch vụ.

    ``modelLoaded`` là true khi Transcoda đã nạp xong; ``modelState`` là một trong idle, loading, ready, failed,
    disabled (``LOAD_MODEL=false``); nạp lỗi thì ``modelError`` ghi nguyên nhân. ``device`` là thiết bị đang chạy model.
    """
    recognizer = get_recognizer()
    body = {
        "modelLoaded": recognizer.model_loaded,
        "modelState": recognizer.state,
        "device": recognizer.device if recognizer.model_loaded else _detect_device(),
        "queueSize": manager.queue_size,
    }
    if recognizer.error:
        body["modelError"] = recognizer.error
    return body


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


@app.post("/convert/kern-to-musicxml", dependencies=[Depends(require_internal_key)])
def convert_kern_to_musicxml(body: KernToMusicXmlRequest) -> dict:
    """kern -> MusicXML đã chuẩn hóa (1 part Piano nhiều staff), đồng bộ (đặc tả mục 6.2).

    Chạy ngoài hàng đợi OMR nên không phải chờ job Transcoda. Trả metadata để Java cập nhật ``scores``. Đường dẫn sai:
    422 (Pydantic); kern hỏng hoặc thiếu music21: 422 kèm lý do.
    """
    try:
        result = kern_file_to_musicxml_file(
            storage.resolve(body.kernPath), storage.resolve(body.outPath), body.tempoBpm
        )
    except ConversionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "outPath": body.outPath,
        "measureCount": result.measure_count,
        "staffCount": result.staff_count,
        "keySignature": result.key_signature,
        "timeSignature": result.time_signature,
        "tempoBpm": result.tempo_bpm,
        "warnings": result.warnings,
    }


@app.post("/convert/musicxml-to-midi", dependencies=[Depends(require_internal_key)])
def convert_musicxml_to_midi(body: MusicXmlToMidiRequest) -> dict:
    """MusicXML -> MIDI (staff 1 -> track/kênh 1, staff 2 -> track/kênh 2), đồng bộ (đặc tả mục 6.2).

    Java gọi khi Editor vừa lưu MusicXML mới và MIDI cũ đã lỗi thời; thường dưới 1 giây. MusicXML hỏng hoặc không có
    nốt: 422 kèm lý do.
    """
    try:
        stats = musicxml_file_to_midi_file(
            storage.resolve(body.musicXmlPath), storage.resolve(body.outPath), body.tempoBpm
        )
    except ConversionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"outPath": body.outPath, "notes": stats.notes, "tracks": stats.tracks, "seconds": stats.seconds}


@app.post("/convert/prepare", dependencies=[Depends(require_internal_key)])
def convert_prepare(body: PrepareRequest) -> dict:
    """Chuẩn bị MusicXML trước khi MuseScore xuất file: dịch giọng, đổi tempo, chọn tay, đặt/ẩn tiêu đề, bỏ hợp âm.

    Đồng bộ, chạy ngoài hàng đợi OMR. File vào và ra nằm trong cùng ``scores/{scoreId}/``. MusicXML hỏng hoặc thiếu
    music21 khi cần dịch giọng: 422 kèm lý do.
    """
    try:
        result = prepare_musicxml(
            storage.resolve(body.inPath),
            storage.resolve(body.outPath),
            transpose=body.transpose,
            tempo_percent=body.tempoPercent,
            hands=body.hands,
            title=body.title,
            composer=body.composer,
            show_title=body.showTitle,
            strip_harmony=body.stripHarmony,
        )
    except ConversionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"outPath": body.outPath, "warnings": result.warnings}


@app.post("/convert/normalize", dependencies=[Depends(require_internal_key)])
def convert_normalize(body: NormalizeRequest) -> dict:
    """Chuẩn hóa MusicXML có sẵn (nhập từ file hoặc do MuseScore sinh từ MIDI) thành MusicXML piano nhiều staff, đồng bộ.

    Trả metadata như ``/convert/kern-to-musicxml`` để Java cập nhật ``scores``. XML hỏng, không phải score-partwise,
    không có ô nhịp hoặc có khai báo ENTITY: 422 kèm lý do.
    """
    try:
        result = normalize_musicxml_file(storage.resolve(body.inPath), storage.resolve(body.outPath), body.tempoBpm)
    except ConversionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "outPath": body.outPath,
        "measureCount": result.measure_count,
        "staffCount": result.staff_count,
        "keySignature": result.key_signature,
        "timeSignature": result.time_signature,
        "tempoBpm": result.tempo_bpm,
        "warnings": result.warnings,
    }


@app.post("/analysis/diff", dependencies=[Depends(require_internal_key)])
def analysis_diff(body: DiffRequest) -> dict:
    """So sánh hai MusicXML của cùng một bản nhạc (bản OMR và bản đã sửa), đồng bộ.

    Trả ``{measures: [{base, target, status, errors[]}], summary: {...}}`` (xem ``app/analysis/diff.py``). File hỏng,
    không phải score-partwise hoặc có khai báo ENTITY: 422 kèm lý do.
    """
    try:
        return diff_files(storage.resolve(body.basePath), storage.resolve(body.targetPath))
    except ConversionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
