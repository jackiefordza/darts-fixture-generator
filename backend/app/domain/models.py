"""Pure, persistence-independent records used by fixture generation and validation."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from enum import StrEnum
from typing import Literal
from uuid import uuid4


class CalendarEventType(StrEnum):
    """Known calendar event categories; callers may use OTHER for future events."""

    COMPETITION = "competition"
    TOURNAMENT = "tournament"
    TEAM_KO = "team_ko"
    BREAK = "break"
    OTHER = "other"


@dataclass(frozen=True, slots=True)
class Venue:
    id: str
    name: str
    board_capacity: int


@dataclass(frozen=True, slots=True)
class Team:
    id: str
    name: str
    home_venue_id: str


@dataclass(frozen=True, slots=True)
class Division:
    id: str
    name: str
    teams: tuple[Team, ...]


@dataclass(frozen=True, slots=True)
class CalendarEvent:
    id: str
    name: str
    start_date: date
    event_type: CalendarEventType
    blocks_initial_generation: bool
    end_date: date | None = None
    appears_on_poster: bool = False

    def includes(self, value: date) -> bool:
        """Return whether ``value`` falls within the inclusive event range."""
        return self.start_date <= value <= (self.end_date or self.start_date)


@dataclass(frozen=True, slots=True)
class Season:
    id: str
    name: str
    divisions: tuple[Division, ...]
    venues: tuple[Venue, ...]
    first_fixture_date: date
    calendar_events: tuple[CalendarEvent, ...] = ()


@dataclass(frozen=True, slots=True)
class SoftPreferenceWeights:
    """Configurable scores used only to select among schedules that are already valid."""

    home_away_imbalance: int = 1
    consecutive_home_away: int = 1
    bye_distribution: int = 1
    fixture_gap: int = 1


@dataclass(frozen=True, slots=True)
class GenerationConfig:
    seed: int | None = None
    fixture_cadence: timedelta = timedelta(days=7)
    max_pairing_attempts: int = 100
    soft_preferences: SoftPreferenceWeights = field(default_factory=SoftPreferenceWeights)


@dataclass(frozen=True, slots=True)
class Fixture:
    id: str
    division_id: str
    home_team_id: str
    away_team_id: str
    week_number: int
    scheduled_date: date
    playing_venue_id: str
    original_scheduled_date: date | None = None
    locked: bool = False
    manual: bool = False
    rescheduling_history: tuple[str, ...] = ()

    @classmethod
    def create(
        cls,
        *,
        division_id: str,
        home_team_id: str,
        away_team_id: str,
        week_number: int,
        scheduled_date: date,
        playing_venue_id: str,
    ) -> Fixture:
        return cls(
            id=str(uuid4()),
            division_id=division_id,
            home_team_id=home_team_id,
            away_team_id=away_team_id,
            week_number=week_number,
            scheduled_date=scheduled_date,
            playing_venue_id=playing_venue_id,
            original_scheduled_date=scheduled_date,
        )


IssueSeverity = Literal["error", "warning", "info"]


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    message: str
    severity: IssueSeverity = "error"
    fixture_ids: tuple[str, ...] = ()
    division_id: str | None = None


@dataclass(frozen=True, slots=True)
class ValidationResult:
    issues: tuple[ValidationIssue, ...] = ()

    @property
    def is_valid(self) -> bool:
        return not any(issue.severity == "error" for issue in self.issues)


@dataclass(frozen=True, slots=True)
class GenerationStatistics:
    fixture_count: int
    weeks_used: int
    soft_score: int
    pairing_attempts: int


@dataclass(frozen=True, slots=True)
class GenerationResult:
    success: bool
    seed: int
    fixtures: tuple[Fixture, ...]
    validation: ValidationResult
    diagnostics: tuple[str, ...] = ()
    statistics: GenerationStatistics | None = None
