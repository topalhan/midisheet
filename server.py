import http.server
import socket
import sys

PORT = 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        super().log_message(format, *args)
        sys.stdout.flush()

class DualStackServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, server_address, RequestHandlerClass):
        # Try dual stack IPv6 (which handles IPv4 mapped addresses on Windows)
        # If not supported, fallback to IPv4
        try:
            self.address_family = socket.AF_INET6
            super().__init__(server_address, RequestHandlerClass)
        except Exception:
            self.address_family = socket.AF_INET
            super().__init__(server_address, RequestHandlerClass)

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except Exception:
                pass
        super().server_bind()

if __name__ == '__main__':
    # Listen on all interfaces
    try:
        httpd = DualStackServer(("", PORT), NoCacheHandler)
    except Exception:
        # Fallback to standard IPv4
        http.server.ThreadingHTTPServer.allow_reuse_address = True
        httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), NoCacheHandler)

    print(f"MidiSheet server running at http://localhost:{PORT}/ and http://127.0.0.1:{PORT}/")
    sys.stdout.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
