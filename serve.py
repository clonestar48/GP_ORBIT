#!/usr/bin/env python3
"""Local dev server with correct MIME types and CORS headers for ES modules."""

import http.server
import os
import socketserver

PORT = 8120

REQUIRED_FILES = ('index.html', 'js/main.js', 'assets/vendor/three.module.js')

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
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)
    missing = [path for path in REQUIRED_FILES if not os.path.isfile(path)]
    if missing:
        print('Missing required files (run serve.py from the GP_Orbit project root):')
        for path in missing:
            print(f'  - {path}')
        raise SystemExit(1)

    socketserver.TCPServer.allow_reuse_address = True
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
        print(f'Open → http://127.0.0.1:{PORT}/?fresh=9999')
        print('(Use 127.0.0.1 - not file:// - then hard refresh Cmd+Shift+R)')
        httpd.serve_forever()
