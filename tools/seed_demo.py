#!/usr/bin/env python3
"""Tạo dữ liệu demo qua REST API, như người dùng thật (dùng cho buổi bảo vệ).

Việc làm:
  1. Đăng nhập 3 tài khoản seed sẵn của BE (mật khẩu 12345678).
  2. Sinh 5 bản hợp xướng Bach (phạm vi công cộng, lấy từ kho mẫu của music21) thành MusicXML rồi nhập qua API.
  3. Xin công khai cả 5 bản, admin duyệt 3 bản đầu.
  4. Chia sẻ 1 bản quyền EDIT, 1 bản quyền REVIEW cho tài khoản khác.
  5. Nhập 3 bản chỉ có giai điệu (bài phạm vi công cộng) để demo gợi ý hợp âm (R3), chia sẻ quyền REVIEW cho admin.
  6. Góp ý gắn ô nhịp (4.2) và một đề xuất sửa (4.3) từ người được chia sẻ, chủ bản nhạc trả lời góp ý.
  7. Gợi ý hợp âm Pop cho "Twinkle" (cần music-ai đang chạy; không có thì bỏ qua, các bước khác vẫn xong).

Chạy lại nhiều lần không tạo trùng (kiểm theo tiêu đề). Chỉ dùng thư viện chuẩn, trừ music21 để sinh MusicXML:
    pip install music21
    python tools/seed_demo.py [--base-url http://localhost:8080]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
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

# Giai điệu phạm vi công cộng cho demo gợi ý hợp âm: (tiêu đề, nhạc sĩ, giọng (số dấu hóa), nhịp, các ô nhịp).
# Mỗi nốt là (cao độ music21, số phách đen); "r" là dấu lặng.
MELODIES = [
    (
        "Demo – Giai điệu: Twinkle Twinkle Little Star",
        "Dân ca Pháp",
        0,
        "4/4",
        [
            [("C4", 1), ("C4", 1), ("G4", 1), ("G4", 1)], [("A4", 1), ("A4", 1), ("G4", 2)],
            [("F4", 1), ("F4", 1), ("E4", 1), ("E4", 1)], [("D4", 1), ("D4", 1), ("C4", 2)],
            [("G4", 1), ("G4", 1), ("F4", 1), ("F4", 1)], [("E4", 1), ("E4", 1), ("D4", 2)],
            [("G4", 1), ("G4", 1), ("F4", 1), ("F4", 1)], [("E4", 1), ("E4", 1), ("D4", 2)],
            [("C4", 1), ("C4", 1), ("G4", 1), ("G4", 1)], [("A4", 1), ("A4", 1), ("G4", 2)],
            [("F4", 1), ("F4", 1), ("E4", 1), ("E4", 1)], [("D4", 1), ("D4", 1), ("C4", 2)],
        ],
    ),
    (
        "Demo – Giai điệu: Ode to Joy",
        "Ludwig van Beethoven",
        2,
        "4/4",
        [
            [("F#4", 1), ("F#4", 1), ("G4", 1), ("A4", 1)], [("A4", 1), ("G4", 1), ("F#4", 1), ("E4", 1)],
            [("D4", 1), ("D4", 1), ("E4", 1), ("F#4", 1)], [("F#4", 1.5), ("E4", 0.5), ("E4", 2)],
            [("F#4", 1), ("F#4", 1), ("G4", 1), ("A4", 1)], [("A4", 1), ("G4", 1), ("F#4", 1), ("E4", 1)],
            [("D4", 1), ("D4", 1), ("E4", 1), ("F#4", 1)], [("E4", 1.5), ("D4", 0.5), ("D4", 2)],
        ],
    ),
    (
        "Demo – Giai điệu: Amazing Grace",
        "John Newton",
        1,
        "3/4",
        [
            [("G4", 2), ("B4", 0.5), ("G4", 0.5)], [("B4", 2), ("A4", 1)], [("G4", 2), ("E4", 1)],
            [("D4", 2), ("D4", 1)], [("G4", 2), ("B4", 0.5), ("G4", 0.5)], [("B4", 2), ("A4", 1)],
            [("D5", 3)], [("D5", 2), ("B4", 1)], [("D5", 2), ("B4", 0.5), ("G4", 0.5)], [("B4", 2), ("A4", 1)],
            [("G4", 2), ("E4", 1)], [("D4", 2), ("D4", 1)], [("G4", 2), ("B4", 0.5), ("G4", 0.5)],
            [("B4", 2), ("A4", 1)], [("G4", 3)], [("G4", 2), ("r", 1)],
        ],
    ),
]
TWINKLE, ODE = MELODIES[0][0], MELODIES[1][0]


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

    def text(self, path: str) -> str:
        """GET trả nội dung chữ (MusicXML), không qua ApiResponse."""
        req = urllib.request.Request(self.base + path, headers={"Authorization": f"Bearer {self.token}"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8")

    def multipart(self, path: str, fields: dict[str, str], file_name: str, file_bytes: bytes):
        boundary = uuid.uuid4().hex
        parts = [
            f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()
        ]
        parts.append(
            (
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{file_name}"\r\n'
                "Content-Type: application/vnd.recordare.musicxml+xml\r\n\r\n"
            ).encode()
            + file_bytes
            + b"\r\n"
        )
        parts.append(f"--{boundary}--\r\n".encode())
        return self.request("POST", path, raw=b"".join(parts), content_type=f"multipart/form-data; boundary={boundary}")

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
        res = api.request("GET", f"/api/scores/me?page={page}&size=50&keyword={urllib.parse.quote('Demo –')}")
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


def build_melody(out_dir: Path, index: int) -> Path:
    """MusicXML một bè chỉ có giai điệu (không hợp âm), để demo gợi ý hợp âm."""
    from music21 import key, meter, metadata, note, stream

    title, composer, fifths, time_signature, measures = MELODIES[index]
    part = stream.Part()
    for number, notes in enumerate(measures, start=1):
        measure = stream.Measure(number=number)
        if number == 1:
            measure.append(key.KeySignature(fifths))
            measure.append(meter.TimeSignature(time_signature))
        for pitch, length in notes:
            element = note.Rest() if pitch == "r" else note.Note(pitch)
            element.quarterLength = length
            measure.append(element)
        part.append(measure)
    score = stream.Score([part])
    score.metadata = metadata.Metadata(title=title, composer=composer)
    path = out_dir / f"melody-{index}.musicxml"
    score.write("musicxml", fp=str(path))
    return path


def seed_melodies(owner: Api, known: dict[str, str]) -> dict[str, str]:
    ids: dict[str, str] = {}
    with tempfile.TemporaryDirectory() as tmp:
        for index, (title, composer, *_rest) in enumerate(MELODIES):
            if title in known:
                print(f"[có sẵn] {title}")
                ids[title] = known[title]
                continue
            ids[title] = owner.upload(build_melody(Path(tmp), index), title, composer)
            print(f"[đã nhập] {title}")
    return ids


def share(owner: Api, score_id: str, email: str, code: int) -> None:
    if email in json.dumps(owner.request("GET", f"/api/scores/{score_id}/sharing")):
        return
    owner.request("POST", f"/api/scores/{score_id}/sharing/members", {"email": email, "permission": code})
    print(f"[đã chia sẻ] {email} quyền {'EDIT' if code == 3 else 'REVIEW'}")


def seed_comments(owner: Api, reviewer: Api, score_id: str) -> None:
    existing = reviewer.request("GET", f"/api/scores/{score_id}/comments")
    items = existing.get("comments", []) if isinstance(existing, dict) else existing
    if items:
        print("[có sẵn] góp ý")
        return
    first = reviewer.request(
        "POST",
        f"/api/scores/{score_id}/comments",
        {"content": "Ô 4 nên để nốt E dài hơn một chút cho câu nhạc kết mềm hơn.", "startMeasure": 4, "endMeasure": 4},
    )
    reviewer.request(
        "POST",
        f"/api/scores/{score_id}/comments",
        {"content": "Hai ô đầu hát nhẹ, tăng dần từ ô 3.", "startMeasure": 1, "endMeasure": 2},
    )
    owner.request("POST", f"/api/comments/{first['id']}/replies", {"content": "Cảm ơn, để mình gửi bản sửa thử."})
    print("[đã tạo] 2 góp ý và 1 trả lời")


def seed_suggestion(reviewer: Api, score_id: str) -> None:
    listed = reviewer.request("GET", f"/api/scores/{score_id}/suggestions?status=OPEN")
    if listed.get("content"):
        print("[có sẵn] đề xuất sửa")
        return
    detail = reviewer.request("GET", f"/api/scores/{score_id}")
    xml = reviewer.text(f"/api/scores/{score_id}/musicxml")
    # Bỏ DOCTYPE (máy chủ không nhận DOCTYPE trong file gửi lên) rồi đổi nốt cuối ô 4 từ E thành F#
    xml = re.sub(r"<!DOCTYPE[^>]*>\s*", "", xml, count=1)
    measures = re.split(r"(?=<measure\b)", xml)
    target = next(i for i, m in enumerate(measures) if re.match(r'<measure[^>]*number="4"', m))
    steps = [m.start() for m in re.finditer(r"<step>E</step>", measures[target])]
    if not steps:
        print("[bỏ qua] không tìm thấy nốt E ở ô 4 để làm đề xuất sửa")
        return
    at = steps[-1]
    measures[target] = (
        measures[target][:at]
        + "<step>F</step><alter>1</alter>"
        + measures[target][at + len("<step>E</step>") :]
    )
    reviewer.multipart(
        f"/api/scores/{score_id}/suggestions",
        {
            "baseVersion": str(detail["currentVersion"]),
            "title": "Kết câu ô 4 lên F#",
            "description": "Đổi nốt cuối ô 4 từ E lên F# cho câu nhạc mở hơn.",
        },
        "suggestion.musicxml",
        "".join(measures).encode("utf-8"),
    )
    print("[đã tạo] đề xuất sửa ô 4")


def seed_chords(owner: Api, score_id: str) -> None:
    listed = owner.request("GET", f"/api/scores/{score_id}/suggestions?status=OPEN")
    if any(item["title"].startswith("Gợi ý hợp âm") for item in listed.get("content", [])):
        print("[có sẵn] gợi ý hợp âm")
        return
    try:
        task = owner.request("POST", f"/api/scores/{score_id}/chord-suggestions", {"style": "POP"})
    except SystemExit as exc:
        print(f"[bỏ qua] gợi ý hợp âm: {exc}")
        return
    for _ in range(60):
        task = owner.request("GET", f"/api/ai-tasks/{task['id']}")
        if task["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
            break
        time.sleep(1)
    if task["status"] == "COMPLETED":
        print("[đã tạo] gợi ý hợp âm Pop (mở tab Đề xuất của bản Twinkle để duyệt)")
    else:
        print(f"[bỏ qua] gợi ý hợp âm: tác vụ {task['status']} {task.get('errorMessage') or ''} (music-ai đã chạy chưa?)")


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

    melody_ids = seed_melodies(owner, known)
    reviewer = Api(args.base_url)
    reviewer.login(REVIEWER)
    share(owner, melody_ids[ODE], REVIEWER, 2)
    seed_comments(owner, reviewer, melody_ids[ODE])
    seed_suggestion(reviewer, melody_ids[ODE])
    seed_chords(owner, melody_ids[TWINKLE])

    print("Xong. Đăng nhập thử bằng user@music.com / admin2@music.com / admin@music.com, mật khẩu 12345678.")


if __name__ == "__main__":
    sys.exit(main())
