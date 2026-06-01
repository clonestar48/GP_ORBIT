#!/usr/bin/env python3
"""Local dev server with correct MIME types and CORS headers for ES modules."""

import http.server
import socketserver

PORT = 8112

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.json': 'application/json',
    }

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    try:
        httpd = socketserver.TCPServer(('', PORT), Handler)
    except OSError as e:
        if e.errno == 48:
            print(f'Port {PORT} is already in use. Stop the other server, then run:')
            print('  python3 serve.py')
            raise SystemExit(1) from e
        raise
    with httpd:
        print(f'Serving: {os.getcwd()}')
        print(f'Open → http://127.0.0.1:{PORT}')
        print('(Use 127.0.0.1 - not file:// - then hard refresh Cmd+Shift+R)')
        httpd.serve_forever()
