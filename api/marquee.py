import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api_bootstrap import BaseJsonHandler, load_env
from odds.performance_data import get_marquee_payload

load_env()


class handler(BaseJsonHandler):
    def get_payload(self) -> dict:
        qs = parse_qs(urlparse(self.path).query)
        league = (qs.get('league') or ['NBA'])[0]
        return get_marquee_payload(league)
