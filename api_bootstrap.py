"""Shared setup for Vercel Python serverless handlers."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Callable

from odds.sports_data import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT)


def send_json(handler: BaseHTTPRequestHandler, status: int, body: dict) -> None:
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json')
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode('utf-8'))


def make_get_handler(get_payload: Callable[[], dict]) -> type[BaseHTTPRequestHandler]:
    class handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            try:
                send_json(self, 200, get_payload())
            except Exception as err:
                send_json(self, 500, {'error': str(err)})
            return

    return handler
