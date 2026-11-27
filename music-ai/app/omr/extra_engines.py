"""Engine nhận diện thứ hai, thứ ba (copisteria, homr, Audiveris...) chạy bằng lệnh ngoài trên ảnh từng trang, ra MusicXML.

Transcoda vẫn là engine chính (ra ``**kern``, đi qua mọi bước định tuyến/ghép/sửa). Các engine thêm chỉ đọc lại từng
trang để :mod:`app.omr.arbiter` so theo từng ô: ô Transcoda đọc sai trường độ mà engine khác đọc đúng thì thay, hai bên
đọc khác nhau thì gắn cờ cho người dùng (và cho AI xác minh nếu bật) kiểm tra. Mặc định tắt: chưa đo trên bộ đo thì không
biết engine nào giúp được (số liệu công bố của các engine là do chính tác giả đo).

Cấu hình (mỗi engine một tên viết thường, ví dụ ``copisteria``)::

    OMR_EXTRA_ENGINES=copisteria,homr
    OMR_ENGINE_COPISTERIA_COMMAND='/opt/copisteria/.venv/bin/python -m copisteria.pipeline {image} --out {outdir}'
    OMR_ENGINE_COPISTERIA_CWD=/opt/copisteria        # chạy lệnh trong thư mục này (copisteria tìm models/ ở đây)
    OMR_ENGINE_HOMR_COMMAND='/opt/homr/.venv/bin/homr {image}'

Lệnh nhận ``{image}`` (PNG trang gốc, đã chép vào ``{outdir}``, độ phân giải như lúc vẽ PDF/ảnh tải lên) và ``{outdir}``
(thư mục rỗng riêng cho lần chạy). Lệnh ghi MusicXML (``.musicxml``, ``.xml`` hoặc ``.mxl``) ở bất kỳ đâu trong
``{outdir}``; file mới nhất được dùng. homr ghi cạnh ảnh, copisteria ghi vào ``--out``, Audiveris ghi ``.mxl`` vào
``-output``: cả ba đều nằm trong ``{outdir}``.
"""

from __future__ import annotations

import logging
import os
import shlex
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from app.omr import musicxml_measures

log = logging.getLogger(__name__)

_SUFFIXES = (".musicxml", ".xml", ".mxl")


@dataclass
class EngineRun:
    """Kết quả một engine trên một trang."""

    engine: str
    page: int
    measures: list[musicxml_measures.Measure] = field(default_factory=list)
    seconds: float = 0.0
    error: Optional[str] = None


def configured(names: tuple[str, ...]) -> list[tuple[str, str, Optional[str]]]:
    """``(tên, lệnh, thư mục chạy)`` của các engine có đặt ``OMR_ENGINE_<TÊN>_COMMAND``; thiếu lệnh thì bỏ kèm log."""
    out = []
    for name in names:
        key = name.strip().upper().replace("-", "_")
        command = os.environ.get(f"OMR_ENGINE_{key}_COMMAND", "").strip()
        if not command:
            log.warning("OMR_EXTRA_ENGINES có %s nhưng chưa đặt OMR_ENGINE_%s_COMMAND, bỏ qua", name, key)
            continue
        cwd = os.environ.get(f"OMR_ENGINE_{key}_CWD", "").strip() or None
        out.append((name.strip().lower(), command, cwd))
    return out


def run_page(
    name: str,
    command: str,
    cwd: Optional[str],
    image_path: Path,
    page: int,
    check: Callable[[], None],
    timeout_s: float,
) -> EngineRun:
    """Chạy một engine trên ảnh một trang; lỗi không ném ra ngoài (ghi vào ``error``), trừ hủy/hết hạn job từ ``check``."""
    run = EngineRun(engine=name, page=page)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix=f"omr-{name}-") as tmp:
        outdir = Path(tmp)
        image = outdir / f"page-{page:03d}{image_path.suffix or '.png'}"
        shutil.copyfile(image_path, image)
        args = [part.format(image=str(image), outdir=str(outdir)) for part in shlex.split(command)]
        try:
            process = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        except OSError as exc:
            run.error = f"không chạy được lệnh: {exc}"
            return run
        try:
            while process.poll() is None:
                check()
                if time.monotonic() - started > timeout_s:
                    run.error = f"quá {int(timeout_s)} giây"
                    break
                time.sleep(0.2)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
        _stdout, stderr = process.communicate()
        run.seconds = time.monotonic() - started
        if run.error:
            return run
        if process.returncode != 0:
            run.error = f"lệnh lỗi (mã {process.returncode}): {(stderr or '').strip()[-300:]}"
            return run
        found = sorted(
            (p for p in outdir.rglob("*") if p.suffix.lower() in _SUFFIXES and p.is_file()),
            key=lambda p: p.stat().st_mtime,
        )
        if not found:
            run.error = "lệnh không ghi file MusicXML nào"
            return run
        try:
            run.measures = musicxml_measures.read_file(found[-1])
        except Exception as exc:  # noqa: BLE001 - MusicXML hỏng của engine ngoài không được làm hỏng job
            run.error = f"không đọc được MusicXML: {type(exc).__name__}: {exc}"
    return run
