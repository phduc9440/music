"""Mô hình dữ liệu của API music-ai, kiểm tra bằng Pydantic (đặc tả mục 6.2).

Dữ liệu sai thì Pydantic ném ``ValidationError`` và FastAPI trả HTTP 422; phía Java sẽ ghi task FAILED
(``JOB_REJECTED``). Vì vậy mọi kiểm tra đường dẫn đều làm ở đây, trước khi job vào hàng đợi.
"""

from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.storage import resolve_existing_file


class JobInput(BaseModel):
    """Một file đầu vào: 1 PDF (``page`` bỏ trống) hoặc 1 ảnh (``page`` là số trang, bắt đầu từ 1)."""

    path: str
    kind: Literal["PDF", "IMAGE"]
    page: Optional[int] = Field(default=None, ge=1)

    @field_validator("path")
    @classmethod
    def _path_must_be_safe_and_exist(cls, value: str) -> str:
        # Đường dẫn tương đối, không có "..", nằm trong storage và file phải tồn tại
        resolve_existing_file(value)
        return value.strip().replace("\\", "/")


class JobOptions(BaseModel):
    """Tùy chọn của job. Java lấy từ ``ai_tasks.input_data`` và cấu hình ``omr.stop-after``."""

    preprocess: bool = True
    """False: chỉ resize + pad về 1050x1485, không khử nhiễu/căn thẳng/nhị phân hóa (dùng cho đo SER 1.7)."""

    binarize: bool = True
    """Có nhị phân hóa thích ứng không. Mặc định bật theo đặc tả; tắt nếu làm đứt dòng kẻ trên ảnh thật."""

    sourceType: Literal["PHOTO", "SCAN", "PDF_NATIVE"] = "PHOTO"
    """Loại nguồn: quyết định cách khử nhiễu (ảnh chụp cần mạnh hơn bản scan; PDF gốc không cần)."""

    stopAfter: str = "MERGE"
    """Bước cuối cùng được chạy: PREPROCESS (chỉ tiền xử lý) hoặc MERGE (nhận diện + ghép kern). EXPORT chưa có nên được
    hiểu là MERGE."""


class JobRequest(BaseModel):
    """Body của ``POST /omr/jobs``."""

    taskId: UUID
    scoreId: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    inputs: list[JobInput] = Field(min_length=1)
    options: JobOptions = Field(default_factory=JobOptions)

    @model_validator(mode="after")
    def _check_inputs(self) -> "JobRequest":
        prefix = f"scores/{self.scoreId}/"
        for item in self.inputs:
            # Job chỉ được đọc file của đúng bản nhạc của nó
            if not item.path.startswith(prefix):
                raise ValueError(f"Đường dẫn {item.path!r} phải nằm trong {prefix}")

        kinds = {item.kind for item in self.inputs}
        if len(kinds) != 1:
            raise ValueError("Không được trộn PDF và ảnh trong cùng một job")
        if "PDF" in kinds and len(self.inputs) != 1:
            raise ValueError("Job PDF chỉ nhận đúng 1 file")

        pages = [item.page for item in self.inputs if item.page is not None]
        if len(pages) != len(set(pages)):
            raise ValueError("Số trang của các ảnh không được trùng nhau")
        return self
