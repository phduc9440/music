"""Spring Boot giả: nhận callback /internal/ai-tasks/** và ghi lại để test kiểm tra (cũng dùng chạy tay, xem README)."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer


class FakeJava:
    def __init__(self, key: str = "test-key", port: int = 0, verbose: bool = False) -> None:
        self.calls: list[tuple[str, str, dict]] = []  # (task_id, endpoint, body)
        self.key = key
        self.reject_with: dict[str, int] = {}  # endpoint -> mã HTTP trả về (mô phỏng 404/400/500)
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or b"{}")
                parts = self.path.strip("/").split("/")  # internal/ai-tasks/{id}/{endpoint}
                task_id, endpoint = parts[2], parts[3]
                if self.headers.get("X-Internal-Key") != outer.key:
                    self.send_response(401)
                    self.end_headers()
                    return
                outer.calls.append((task_id, endpoint, body))
                if verbose:
                    print(endpoint, json.dumps(body, ensure_ascii=False), flush=True)
                self.send_response(outer.reject_with.get(endpoint, 200))
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"code":200}')

            def log_message(self, *args):  # im lặng
                pass

        self._server = HTTPServer(("127.0.0.1", port), Handler)
        self.port = self._server.server_address[1]
        self.url = f"http://127.0.0.1:{self.port}"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._server.shutdown()

    def endpoints(self) -> list[str]:
        return [c[1] for c in self.calls]

    def bodies(self, endpoint: str) -> list[dict]:
        return [c[2] for c in self.calls if c[1] == endpoint]


if __name__ == "__main__":  # python tests/fake_java.py [port]
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = FakeJava(key=sys.argv[2] if len(sys.argv) > 2 else "dev-internal-key", port=port, verbose=True)
    print(f"Spring Boot giả đang nghe ở {server.url} (Ctrl+C để dừng)", flush=True)
    threading.Event().wait()
