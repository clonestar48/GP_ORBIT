import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api_bootstrap import BaseJsonHandler, load_env
from odds.performance_data import get_performance_payload

load_env()


class handler(BaseJsonHandler):
    def get_payload(self) -> dict:
        qs = parse_qs(urlparse(self.path).query)
        team_id = (qs.get('teamId') or [''])[0]
        time_range = (qs.get('range') or ['week'])[0]
        start_date = (qs.get('startDate') or [None])[0]
        end_date = (qs.get('endDate') or [None])[0]
        if not team_id:
            return {'error': 'teamId required'}
        return get_performance_payload(team_id, time_range, start_date, end_date)
