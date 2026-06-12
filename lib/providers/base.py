"""Abstract sports data provider interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class SportsDataProvider(ABC):
    @abstractmethod
    def get_teams(self, league: str = 'NBA') -> list[dict]:
        ...

    @abstractmethod
    def get_games_for_team(self, team_id: str, time_range: str) -> list[dict]:
        ...

    @abstractmethod
    def get_performance_series(self, team_id: str, time_range: str) -> dict:
        ...

    @abstractmethod
    def get_matchup_performance_series(
        self, team_a_id: str, team_b_id: str, time_range: str,
    ) -> dict:
        ...
