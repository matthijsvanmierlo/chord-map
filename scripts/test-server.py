#!/usr/bin/env python3
"""Static file server for the e2e tests. Like `python3 -m http.server`, plus:
  GET /__hold  blocks until GET /__done (keeps the test page "loading" so headless
               Chromium waits, in real time, for the tests to finish before dumping the DOM).
Usage: python3 scripts/test-server.py [PORT]
"""
import http.server, threading, sys, functools, os
done = threading.Event()
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/__hold'):
            done.wait(180); done.clear()
            self.send_response(200); self.send_header('Content-Type', 'image/gif'); self.end_headers()
            self.wfile.write(b'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;')
            return
        if self.path.startswith('/__done'):
            done.set(); self.send_response(204); self.end_headers(); return
        return super().do_GET()
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root))
srv.serve_forever()
