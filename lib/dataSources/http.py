"""Shared HTTP helper for provider fetchers. Raw JSON only."""

from __future__ import annotations

import json
import time
import urllib.request


def get_json(url: str, headers: dict | None = None, timeout: int = 20):
    req_headers = {'User-Agent': 'GP-Orbit/1.0'}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def iso_now() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
