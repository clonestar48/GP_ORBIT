import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api_bootstrap import BaseJsonHandler, load_env
from odds.performance_data import get_team_context_payload

load_env()


class handler(BaseJsonHandler):
    def get_payload(self) -> dict:
        qs = parse_qs(urlparse(self.path).query)
        team_id = (qs.get('teamId') or [''])[0]
        league = (qs.get('league') or ['NBA'])[0]
        if not team_id:
            return {'error': 'teamId required'}
        return get_team_context_payload(team_id, league)
