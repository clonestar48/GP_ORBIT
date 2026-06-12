"""Shared setup for Vercel Python serverless handlers."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent


def load_env() -> None:
    from odds.sports_data import load_dotenv

    load_dotenv(ROOT)


def send_json(http_handler: BaseHTTPRequestHandler, status: int, body: dict) -> None:
    http_handler.send_response(status)
    http_handler.send_header('Content-Type', 'application/json')
    http_handler.end_headers()
    http_handler.wfile.write(json.dumps(body).encode('utf-8'))


class BaseJsonHandler(BaseHTTPRequestHandler):
    get_payload: Callable[[], dict] = staticmethod(lambda: {})

    def do_GET(self) -> None:
        try:
            send_json(self, 200, self.get_payload())
        except Exception as err:
            send_json(self, 500, {'error': str(err)})

    def log_message(self, format: str, *args) -> None:
        return
