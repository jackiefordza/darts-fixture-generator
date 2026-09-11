"""Composition root for pairing, calendar scheduling, and capacity-aware orientation."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from random import Random, SystemRandom
from uuid import NAMESPACE_URL, uuid5

from app.domain import (
    Division,
    Fixture,
    GenerationConfig,
    GenerationResult,
    GenerationStatistics,
    Season,
    ValidationResult,
)
from app.scheduling.pairing import RoundRobinPairingGenerator
from app.validation import ScheduleValidator


@dataclass(frozen=True, slots=True)
class _OrientationUnit:
    division_id: str
    first_week: int
    second_week: int
    first_team_id: str
    second_team_id: str


class FixtureGenerator:
    """Generate a complete season without coupling scheduling rules to persistence or HTTP."""

    def __init__(self, validator: ScheduleValidator | None = None) -> None:
        self._pairings = RoundRobinPairingGenerator()
        self._validator = validator or ScheduleValidator()

    def generate(
        self, season: Season, config: GenerationConfig = GenerationConfig()
    ) -> GenerationResult:
        """Return a valid schedule, or an explicit infeasibility result with diagnostics."""
        input_errors = self._validate_input(season, config)
        seed = config.seed if config.seed is not None else SystemRandom().randrange(2**63)
        if input_errors:
            return GenerationResult(
                success=False,
                seed=seed,
                fixtures=(),
                validation=ValidationResult(),
                diagnostics=tuple(input_errors),
            )

        random = Random(seed)
        total_weeks = max(self._rounds_per_half(division) * 2 for division in season.divisions)
        dates = self._league_dates(season, total_weeks, config)
        last_diagnostics = "No capacity-feasible home/away orientation was found."

        for attempt in range(1, config.max_pairing_attempts + 1):
            pairings = [self._pairings.generate(division, random) for division in season.divisions]
            units = self._orientation_units(season.divisions, pairings)
            orientations = self._orient(units, season, random)
            if orientations is None:
                continue
            fixtures = self._fixtures_from_orientations(orientations, dates, seed, season)
            validation = self._validator.validate(season, fixtures)
            if validation.is_valid:
                statistics = GenerationStatistics(
                    fixture_count=len(fixtures),
                    weeks_used=total_weeks,
                    soft_score=self._soft_score(fixtures, config),
                    pairing_attempts=attempt,
                )
                return GenerationResult(
                    success=True,
                    seed=seed,
                    fixtures=fixtures,
                    validation=validation,
                    statistics=statistics,
                )
            last_diagnostics = "; ".join(issue.message for issue in validation.issues)

        return GenerationResult(
            success=False,
            seed=seed,
            fixtures=(),
            validation=ValidationResult(),
            diagnostics=(
                "Unable to satisfy hard constraints after "
                f"{config.max_pairing_attempts} pairing attempts.",
                last_diagnostics,
            ),
        )

    @staticmethod
    def _rounds_per_half(division: Division) -> int:
        team_count = len(division.teams)
        return team_count - 1 if team_count % 2 == 0 else team_count

    @staticmethod
    def _validate_input(season: Season, config: GenerationConfig) -> list[str]:
        errors: list[str] = []
        if len(season.divisions) != 4:
            errors.append("A season must contain exactly four divisions.")
        if config.fixture_cadence.days <= 0 or config.fixture_cadence.seconds != 0:
            errors.append("Fixture cadence must be a positive whole number of days.")
        if config.max_pairing_attempts < 1:
            errors.append("max_pairing_attempts must be at least 1.")
        venue_ids = {venue.id for venue in season.venues}
        if any(venue.board_capacity < 1 for venue in season.venues):
            errors.append("Venue board capacity must be at least 1.")
        division_ids: set[str] = set()
        team_ids: set[str] = set()
        for division in season.divisions:
            if division.id in division_ids:
                errors.append(f"Duplicate division ID: {division.id}.")
            division_ids.add(division.id)
            if len(division.teams) < 2:
                errors.append(f"Division {division.id} needs at least two teams.")
            for team in division.teams:
                if team.id in team_ids:
                    errors.append(f"Team ID {team.id} must be unique across the season.")
                team_ids.add(team.id)
                if team.home_venue_id not in venue_ids:
                    errors.append(f"Team {team.id} references an unknown home venue.")
        return errors

    @staticmethod
    def _league_dates(
        season: Season, total_weeks: int, config: GenerationConfig
    ) -> dict[int, date]:
        dates: dict[int, date] = {}
        current = season.first_fixture_date
        week = 1
        while week <= total_weeks:
            blocked = any(
                event.blocks_initial_generation and event.includes(current)
                for event in season.calendar_events
            )
            if not blocked:
                dates[week] = current
                week += 1
            current += config.fixture_cadence
        return dates

    def _orientation_units(
        self, divisions: tuple[Division, ...], pairings: list[object]
    ) -> list[_OrientationUnit]:
        units: list[_OrientationUnit] = []
        for division, pairing in zip(divisions, pairings, strict=True):
            rounds = pairing.first_half_rounds  # type: ignore[attr-defined]
            round_count = len(rounds)
            for index, pairs in enumerate(rounds, start=1):
                for first, second in pairs:
                    if RoundRobinPairingGenerator.bye_slot not in (first, second):
                        units.append(
                            _OrientationUnit(division.id, index, index + round_count, first, second)
                        )
        return units

    @staticmethod
    def _orient(
        units: list[_OrientationUnit], season: Season, random: Random
    ) -> dict[_OrientationUnit, tuple[str, str]] | None:
        capacity = {venue.id: venue.board_capacity for venue in season.venues}
        team_venues = {
            team.id: team.home_venue_id for division in season.divisions for team in division.teams
        }
        usage: dict[tuple[int, str], int] = defaultdict(int)
        # Units touching constrained venues first reduce backtracking on shared venues.
        ordered = sorted(
            units,
            key=lambda unit: min(
                capacity[team_venues[unit.first_team_id]],
                capacity[team_venues[unit.second_team_id]],
            ),
        )
        result: dict[_OrientationUnit, tuple[str, str]] = {}

        def fits(home_id: str, first_week: int, away_id: str, second_week: int) -> bool:
            return (
                usage[(first_week, team_venues[home_id])] < capacity[team_venues[home_id]]
                and usage[(second_week, team_venues[away_id])] < capacity[team_venues[away_id]]
            )

        def visit(index: int) -> bool:
            if index == len(ordered):
                return True
            unit = ordered[index]
            options = [
                (unit.first_team_id, unit.second_team_id),
                (unit.second_team_id, unit.first_team_id),
            ]
            random.shuffle(options)
            for home, away in options:
                if not fits(home, unit.first_week, away, unit.second_week):
                    continue
                first_key = (unit.first_week, team_venues[home])
                second_key = (unit.second_week, team_venues[away])
                usage[first_key] += 1
                usage[second_key] += 1
                result[unit] = (home, away)
                if visit(index + 1):
                    return True
                del result[unit]
                usage[first_key] -= 1
                usage[second_key] -= 1
            return False

        return result if visit(0) else None

    @staticmethod
    def _fixtures_from_orientations(
        orientations: dict[_OrientationUnit, tuple[str, str]],
        dates: dict[int, date],
        seed: int,
        season: Season,
    ) -> tuple[Fixture, ...]:
        team_venues = {
            team.id: team.home_venue_id for division in season.divisions for team in division.teams
        }
        fixtures: list[Fixture] = []
        for unit in sorted(orientations, key=lambda value: (value.first_week, value.division_id)):
            home, away = orientations[unit]
            for week, first, second in (
                (unit.first_week, home, away),
                (unit.second_week, away, home),
            ):
                fixture_key = f"fixture-generator/{seed}/{unit.division_id}/{week}/{first}/{second}"
                fixtures.append(
                    Fixture(
                        id=str(uuid5(NAMESPACE_URL, fixture_key)),
                        division_id=unit.division_id,
                        home_team_id=first,
                        away_team_id=second,
                        week_number=week,
                        scheduled_date=dates[week],
                        playing_venue_id=team_venues[first],
                        original_scheduled_date=dates[week],
                    )
                )
        return tuple(sorted(fixtures, key=lambda fixture: (fixture.week_number, fixture.id)))

    @staticmethod
    def _soft_score(fixtures: tuple[Fixture, ...], config: GenerationConfig) -> int:
        """A small configurable signal; it never influences validity or overrides hard rules."""
        weights = config.soft_preferences
        by_team: dict[str, list[tuple[int, bool]]] = defaultdict(list)
        for fixture in fixtures:
            by_team[fixture.home_team_id].append((fixture.week_number, True))
            by_team[fixture.away_team_id].append((fixture.week_number, False))
        runs = 0
        for appearances in by_team.values():
            previous: bool | None = None
            for _, is_home in sorted(appearances):
                if is_home == previous:
                    runs += 1
                previous = is_home
        return runs * weights.consecutive_home_away
