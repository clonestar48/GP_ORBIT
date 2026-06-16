import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api_bootstrap import BaseJsonHandler, load_env
from odds.performance_data import get_matchup_payload

load_env()


class handler(BaseJsonHandler):
    def get_payload(self) -> dict:
        qs = parse_qs(urlparse(self.path).query)
        team_a = (qs.get('teamA') or ['SAS'])[0]
        team_b = (qs.get('teamB') or ['NYK'])[0]
        start_date = (qs.get('startDate') or [None])[0]
        end_date = (qs.get('endDate') or [None])[0]
        range_param = (qs.get('range') or [None])[0]
        if range_param:
            time_range = range_param
            start_date = end_date = None
        elif start_date and end_date:
            time_range = None
        else:
            time_range = 'season'
        return get_matchup_payload(team_a, team_b, time_range, start_date, end_date)
