import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api_bootstrap import BaseJsonHandler, load_env
from odds.sports_data import get_games_payload

load_env()


class handler(BaseJsonHandler):
    get_payload = staticmethod(get_games_payload)
