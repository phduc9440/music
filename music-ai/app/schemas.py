"""Mô hình dữ liệu của API music-ai, kiểm tra bằng Pydantic (đặc tả mục 6.2).

Dữ liệu sai thì Pydantic ném ``ValidationError`` và FastAPI trả HTTP 422; phía Java sẽ ghi task FAILED
(``JOB_REJECTED``). Vì vậy mọi kiểm tra đường dẫn đều làm ở đây, trước khi job vào hàng đợi.
"""

from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.storage import resolve, resolve_existing_file


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

    stopAfter: str = "EXPORT"
    """Bước cuối cùng được chạy: PREPROCESS (chỉ tiền xử lý), MERGE (thêm nhận diện + ghép kern) hoặc EXPORT (thêm xuất
    MusicXML và MIDI, mặc định)."""

    musicXmlVersion: int = Field(default=1, ge=1, le=100000)
    """Version của bản MusicXML lần chạy này tạo ra (``musicxml/v{n}.musicxml``, ``midi/v{n}.mid``). Java gửi
    ``scores.current_version + 1`` nên nhận diện lại sinh bản mới mà không ghi đè bản cũ (đặc tả mục 2.3)."""


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


# ====================================================================== /convert/** (đặc tả mục 6.2)


def _score_dir(path: str) -> str:
    """``scores/{scoreId}`` của một đường dẫn trong storage, hoặc ném ValueError nếu không nằm trong ``scores/``."""
    parts = path.strip().replace("\\", "/").split("/")
    if len(parts) < 3 or parts[0] != "scores" or not parts[1]:
        raise ValueError(f"Đường dẫn {path!r} phải có dạng scores/{{scoreId}}/...")
    return "/".join(parts[:2])


def _safe_output_path(value: str, suffix: str) -> str:
    """Đường dẫn đầu ra: tương đối, an toàn, nằm trong ``scores/{scoreId}/`` và đúng đuôi file."""
    resolve(value)  # ném ValueError nếu rỗng, tuyệt đối, chứa ".." hoặc thoát khỏi storage
    _score_dir(value)
    if not value.lower().endswith(suffix):
        raise ValueError(f"File đầu ra phải có đuôi {suffix}")
    return value.strip().replace("\\", "/")


class KernToMusicXmlRequest(BaseModel):
    """Body của ``POST /convert/kern-to-musicxml``."""

    kernPath: str
    outPath: str
    tempoBpm: Optional[int] = Field(default=None, ge=20, le=400)
    """Tempo ghi vào ô nhịp 1; bỏ trống thì giữ tempo trong kern, không có thì 100."""

    @field_validator("kernPath")
    @classmethod
    def _kern_must_exist(cls, value: str) -> str:
        resolve_existing_file(value)
        _score_dir(value)
        return value.strip().replace("\\", "/")

    @field_validator("outPath")
    @classmethod
    def _out_must_be_musicxml(cls, value: str) -> str:
        return _safe_output_path(value, ".musicxml")

    @model_validator(mode="after")
    def _same_score(self) -> "KernToMusicXmlRequest":
        if _score_dir(self.kernPath) != _score_dir(self.outPath):
            raise ValueError("kernPath và outPath phải thuộc cùng một bản nhạc")
        return self


class MusicXmlToMidiRequest(BaseModel):
    """Body của ``POST /convert/musicxml-to-midi``."""

    musicXmlPath: str
    outPath: str
    tempoBpm: int = Field(default=100, ge=20, le=400)

    @field_validator("musicXmlPath")
    @classmethod
    def _xml_must_exist(cls, value: str) -> str:
        resolve_existing_file(value)
        _score_dir(value)
        return value.strip().replace("\\", "/")

    @field_validator("outPath")
    @classmethod
    def _out_must_be_midi(cls, value: str) -> str:
        return _safe_output_path(value, ".mid")

    @model_validator(mode="after")
    def _same_score(self) -> "MusicXmlToMidiRequest":
        if _score_dir(self.musicXmlPath) != _score_dir(self.outPath):
            raise ValueError("musicXmlPath và outPath phải thuộc cùng một bản nhạc")
        return self


class PrepareRequest(BaseModel):
    """Body của ``POST /convert/prepare`` (dịch giọng, đổi tempo, chọn tay, đặt tiêu đề trước khi xuất file)."""

    inPath: str
    outPath: str
    transpose: int = Field(default=0, ge=-12, le=12)
    tempoPercent: int = Field(default=100, ge=20, le=200)
    hands: Literal["BOTH", "RIGHT", "LEFT"] = "BOTH"
    title: Optional[str] = Field(default=None, max_length=255)
    composer: Optional[str] = Field(default=None, max_length=255)
    showTitle: bool = True
    stripHarmony: bool = False

    @field_validator("inPath")
    @classmethod
    def _in_must_exist(cls, value: str) -> str:
        resolve_existing_file(value)
        _score_dir(value)
        return value.strip().replace("\\", "/")

    @field_validator("outPath")
    @classmethod
    def _out_must_be_musicxml(cls, value: str) -> str:
        return _safe_output_path(value, ".musicxml")

    @model_validator(mode="after")
    def _same_score(self) -> "PrepareRequest":
        if _score_dir(self.inPath) != _score_dir(self.outPath):
            raise ValueError("inPath và outPath phải thuộc cùng một bản nhạc")
        return self


class NormalizeRequest(BaseModel):
    """Body của ``POST /convert/normalize``: chuẩn hóa MusicXML có sẵn trong storage."""

    inPath: str
    outPath: str
    tempoBpm: Optional[int] = Field(default=None, ge=20, le=400)
    """Tempo ghi vào ô nhịp 1; bỏ trống thì giữ tempo đã có, không có thì 100."""

    @field_validator("inPath")
    @classmethod
    def _in_must_exist(cls, value: str) -> str:
        resolve_existing_file(value)
        _score_dir(value)
        return value.strip().replace("\\", "/")

    @field_validator("outPath")
    @classmethod
    def _out_must_be_musicxml(cls, value: str) -> str:
        return _safe_output_path(value, ".musicxml")

    @model_validator(mode="after")
    def _same_score(self) -> "NormalizeRequest":
        if _score_dir(self.inPath) != _score_dir(self.outPath):
            raise ValueError("inPath và outPath phải thuộc cùng một bản nhạc")
        return self
