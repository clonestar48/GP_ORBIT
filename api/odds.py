import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api_bootstrap import make_get_handler
from odds.sports_data import get_odds_payload

handler = make_get_handler(get_odds_payload)
