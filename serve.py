#!/usr/bin/env python3
"""Local dev server with correct MIME types and CORS headers for ES modules."""

import http.server
import json
import os
import socketserver
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = 8120
ROOT = Path(__file__).resolve().parent

REQUIRED_FILES = ('index.html', 'js/main.js', 'assets/vendor/three.module.js')

API_ROUTES = frozenset({
    '/api/teams',
    '/api/performance',
    '/api/matchup',
})


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

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path.rstrip('/') or '/'
        if route in API_ROUTES:
            self._serve_api(route, parsed.query)
            return
        super().do_GET()

    def _serve_api(self, route: str, query: str) -> None:
        from odds.performance_data import (
            get_matchup_payload,
            get_performance_payload,
            get_teams_payload,
        )

        qs = parse_qs(query)
        try:
            if route == '/api/teams':
                league = (qs.get('league') or ['NBA'])[0]
                payload = get_teams_payload(league)
            elif route == '/api/performance':
                team_id = (qs.get('teamId') or [''])[0]
                time_range = (qs.get('range') or ['week'])[0]
                start_date = (qs.get('startDate') or [None])[0]
                end_date = (qs.get('endDate') or [None])[0]
                payload = (
                    get_performance_payload(team_id, time_range, start_date, end_date)
                    if team_id else {'error': 'teamId required'}
                )
            elif route == '/api/matchup':
                team_a = (qs.get('teamA') or ['SAS'])[0]
                team_b = (qs.get('teamB') or ['NYK'])[0]
                time_range = (qs.get('range') or ['week'])[0]
                start_date = (qs.get('startDate') or [None])[0]
                end_date = (qs.get('endDate') or [None])[0]
                payload = get_matchup_payload(team_a, team_b, time_range, start_date, end_date)
            else:
                payload = {'error': 'Not found'}
            body = json.dumps(payload).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(body)
        except Exception as err:
            body = json.dumps({'error': str(err)}).encode('utf-8')
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(body)


if __name__ == '__main__':
    os.chdir(ROOT)
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
        print(f'Open → http://127.0.0.1:{PORT}/odds/')
        print('(Use 127.0.0.1 - not file:// - then hard refresh Cmd+Shift+R)')
        httpd.serve_forever()
