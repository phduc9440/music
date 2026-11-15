#!/usr/bin/env python3
"""Tạo dữ liệu demo qua REST API, như người dùng thật (dùng cho buổi bảo vệ).

Việc làm:
  1. Đăng nhập 3 tài khoản seed sẵn của BE (mật khẩu 12345678).
  2. Sinh 5 bản hợp xướng Bach (phạm vi công cộng, lấy từ kho mẫu của music21) thành MusicXML rồi nhập qua API.
  3. Xin công khai cả 5 bản, admin duyệt 3 bản đầu.
  4. Chia sẻ 1 bản quyền EDIT, 1 bản quyền REVIEW cho tài khoản khác.

Chạy lại nhiều lần không tạo trùng (kiểm theo tiêu đề). Chỉ dùng thư viện chuẩn, trừ music21 để sinh MusicXML:
    pip install music21
    python tools/seed_demo.py [--base-url http://localhost:8080]
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

PASSWORD = "12345678"
OWNER = "user@music.com"  # USER
EDITOR = "admin2@music.com"  # ADMIN, cũng là người duyệt công khai
REVIEWER = "admin@music.com"  # SUPER_ADMIN

# (đường dẫn trong kho music21, tiêu đề hiển thị)
CHORALES = [
    ("bach/bwv66.6", "Demo – Bach: Ach wie flüchtig (BWV 26)"),
    ("bach/bwv269", "Demo – Bach: Aus meines Herzens Grunde (BWV 269)"),
    ("bach/bwv371", "Demo – Bach: Das walt Gott Vater (BWV 371)"),
    ("bach/bwv10.7", "Demo – Bach: Magnificat, chorale (BWV 10)"),
    ("bach/bwv13.6", "Demo – Bach: Meine Seufzer, meine Tränen (BWV 13)"),
]
PUBLISH_APPROVED = 3  # số bản đầu được admin duyệt, các bản còn lại để chờ duyệt


class Api:
    def __init__(self, base_url: str) -> None:
        self.base = base_url.rstrip("/")
        self.token: str | None = None

    def request(self, method: str, path: str, body=None, raw: bytes | None = None, content_type: str | None = None):
        data = raw
        headers = {}
        if body is not None:
            data = json.dumps(body).encode()
            content_type = "application/json"
        if content_type:
            headers["Content-Type"] = content_type
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise SystemExit(f"{method} {path} -> {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise SystemExit(f"Không gọi được {self.base}: {exc.reason}. BE đã chạy chưa?") from exc
        if isinstance(payload, dict) and payload.get("code") not in (None, 1000):
            raise SystemExit(f"{method} {path} -> lỗi {payload.get('code')}: {payload.get('message')}")
        return payload.get("result") if isinstance(payload, dict) else payload

    def login(self, email: str) -> None:
        self.token = None
        auth = self.request("POST", "/api/auth/login", {"username": email, "password": PASSWORD})
        self.token = auth["token"]

    def upload(self, path: Path, title: str, composer: str) -> str:
        boundary = uuid.uuid4().hex
        parts: list[bytes] = []

        def field(name: str, value: str) -> None:
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
            )

        field("title", title)
        field("composer", composer)
        parts.append(
            (
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
                "Content-Type: application/vnd.recordare.musicxml+xml\r\n\r\n"
            ).encode()
            + path.read_bytes()
            + b"\r\n"
        )
        parts.append(f"--{boundary}--\r\n".encode())
        result = self.request(
            "POST",
            "/api/scores/import",
            raw=b"".join(parts),
            content_type=f"multipart/form-data; boundary={boundary}",
        )
        return result["scoreId"]


def existing_titles(api: Api) -> dict[str, str]:
    found: dict[str, str] = {}
    page = 0
    while True:
        res = api.request("GET", f"/api/scores/me?page={page}&size=50&keyword={urllib.parse.quote('Demo – Bach')}")
        for item in res["content"]:
            found[item["title"]] = item["id"]
        page += 1
        if page >= res["totalPages"]:
            return found


def build_musicxml(out_dir: Path) -> list[tuple[Path, str]]:
    try:
        from music21 import corpus
    except ImportError:
        raise SystemExit("Cần music21 để sinh MusicXML mẫu: pip install music21") from None
    files = []
    for work, title in CHORALES:
        score = corpus.parse(work)
        path = out_dir / (work.split("/")[-1] + ".musicxml")
        score.write("musicxml", fp=str(path))
        files.append((path, title))
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost:8080")
    args = parser.parse_args()

    owner, admin = Api(args.base_url), Api(args.base_url)
    owner.login(OWNER)
    admin.login(EDITOR)

    known = existing_titles(owner)
    ids: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        files = None
        for index, (_, title) in enumerate(CHORALES):
            if title in known:
                print(f"[có sẵn] {title}")
                ids.append(known[title])
                continue
            if files is None:
                files = build_musicxml(Path(tmp))
            path = files[index][0]
            score_id = owner.upload(path, title, "Johann Sebastian Bach")
            print(f"[đã nhập] {title}")
            ids.append(score_id)

    for index, score_id in enumerate(ids):
        detail = owner.request("GET", f"/api/scores/{score_id}")
        if detail.get("visibility") == "PRIVATE":
            owner.request("PATCH", f"/api/scores/{score_id}", {"visibility": "PUBLIC"})
            detail["visibility"] = "PENDING"
        if index < PUBLISH_APPROVED and detail.get("visibility") == "PENDING":
            admin.request("POST", f"/api/scores/{score_id}/publish/approve")
            print(f"[đã duyệt công khai] {CHORALES[index][1]}")

    # SharePermission nhận mã số: 2 = REVIEW, 3 = EDIT
    for score_id, email, code in ((ids[3], EDITOR, 3), (ids[4], REVIEWER, 2)):
        sharing = owner.request("GET", f"/api/scores/{score_id}/sharing")
        text = json.dumps(sharing)
        if email in text:
            continue
        owner.request("POST", f"/api/scores/{score_id}/sharing/members", {"email": email, "permission": code})
        print(f"[đã chia sẻ] {email} quyền {'EDIT' if code == 3 else 'REVIEW'}")

    print("Xong. Đăng nhập thử bằng user@music.com / admin2@music.com / admin@music.com, mật khẩu 12345678.")


if __name__ == "__main__":
    sys.exit(main())
