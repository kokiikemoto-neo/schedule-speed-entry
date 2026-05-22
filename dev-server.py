"""no-cache 強制版 http.server (開発用)
ブラウザに HTML/CSS/JS をキャッシュさせないため、Cache-Control を送る。
使い方: python dev-server.py [port]
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    server = HTTPServer(("", port), NoCacheHandler)
    print(f"Serving (no-cache) at http://localhost:{port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
