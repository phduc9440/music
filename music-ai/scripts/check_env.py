"""Kiểm tra môi trường chạy music-ai và in phiên bản (chạy: python scripts/check_env.py).

Không cần model hay mạng. Thoát với mã 1 nếu thiếu thứ bắt buộc, để dán kết quả khi nhờ hỗ trợ. Hay gặp nhất: ``pip`` và
``python`` thuộc hai bản Python khác nhau (gói cài vào nơi ``python`` không đọc), nên luôn cài bằng ``python -m pip``.
"""

from __future__ import annotations

import importlib.metadata as md
import shutil
import sys
from pathlib import Path
from typing import Optional

# (tên gói pip, bắt buộc?)
PACKAGES = [
    ("fastapi", True), ("uvicorn", True), ("pydantic", True), ("numpy", True), ("opencv-python-headless", True),
    ("pillow", True), ("pymupdf", True), ("music21", True), ("torch", False), ("transformers", False),
    ("torchtune", False), ("torchao", False), ("pytesseract", False), ("pytest", False),
]
RECOMMENDED = ((3, 11), (3, 12))


def package_version(name: str) -> Optional[str]:
    try:
        return md.version(name)
    except md.PackageNotFoundError:
        return None


def tesseract_info() -> dict:
    """Phiên bản Tesseract và các gói ngôn ngữ; ``{"ok": False, "reason": ...}`` nếu dùng không được."""
    if shutil.which("tesseract") is None:
        return {"ok": False, "reason": "chưa có chương trình tesseract (brew install tesseract tesseract-lang)"}
    try:
        import pytesseract  # noqa: PLC0415
    except ImportError:
        return {"ok": False, "reason": "python này chưa có pytesseract (python -m pip install pytesseract)"}
    try:
        version = str(pytesseract.get_tesseract_version())
        langs = sorted(pytesseract.get_languages(config=""))
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": f"không gọi được Tesseract: {type(exc).__name__}: {exc}"}
    missing = [code for code in ("vie", "eng") if code not in langs]
    if missing:
        return {"ok": False, "version": version, "reason": f"thiếu gói ngôn ngữ {'+'.join(missing)}"}
    return {"ok": True, "version": version, "langs": langs}


def pip_mismatch() -> Optional[str]:
    """Cảnh báo khi lệnh ``pip`` trong PATH không thuộc Python đang chạy (nguyên nhân 'cài rồi mà import không thấy')."""
    pip = shutil.which("pip")
    if pip is None:
        return None
    try:
        shebang = Path(pip).read_text(errors="ignore").splitlines()[0]
    except (OSError, IndexError, UnicodeDecodeError):
        return None
    want = f"{sys.version_info[0]}.{sys.version_info[1]}"
    if shebang.startswith("#!") and "python" in shebang and want not in shebang and Path(sys.executable).name not in shebang:
        return f"lệnh pip ({pip}) khởi động bằng '{shebang[2:]}', khác Python đang chạy ({want}); dùng 'python -m pip'"
    return None


def collect() -> dict:
    problems: list[str] = []
    version = sys.version_info[:2]
    if version < (3, 10):
        problems.append(f"Python {version[0]}.{version[1]} quá cũ (cần 3.10 trở lên, khuyến nghị 3.11 hoặc 3.12)")
    elif version not in RECOMMENDED:
        problems.append(f"cảnh báo: Python {version[0]}.{version[1]} chưa được kiểm thử (khuyến nghị 3.11 hoặc 3.12)")
    packages = {name: package_version(name) for name, _ in PACKAGES}
    for name, required in PACKAGES:
        if required and packages[name] is None:
            problems.append(f"thiếu gói bắt buộc {name} (python -m pip install -r requirements.txt)")
    tess = tesseract_info()
    if not tess["ok"]:
        problems.append(f"cảnh báo: OCR lời ca tắt: {tess['reason']}")
    mismatch = pip_mismatch()
    if mismatch:
        problems.append(f"cảnh báo: {mismatch}")
    fatal = any(p for p in problems if not p.startswith("cảnh báo"))
    return {"python": sys.version.split()[0], "executable": sys.executable, "packages": packages, "tesseract": tess,
            "problems": problems, "ok": not fatal}


def main() -> int:
    info = collect()
    print(f"Python      {info['python']}  ({info['executable']})")
    for name, ver in info["packages"].items():
        print(f"  {name:<24}{ver or '-'}")
    tess = info["tesseract"]
    print(f"Tesseract   {tess.get('version', '-')}  " + ("(vie+eng sẵn sàng)" if tess["ok"] else f"({tess['reason']})"))
    for problem in info["problems"]:
        print(f"! {problem}")
    print("OK" if info["ok"] else "CÓ LỖI")
    return 0 if info["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
