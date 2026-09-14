"""Independent validation of fixture schedules."""

from __future__ import annotations

from collections import Counter, defaultdict
from itertools import combinations

from app.domain import Fixture, Season, ValidationIssue, ValidationResult


class ScheduleValidator:
    """Check schedule facts from supplied fixtures rather than generator implementation state."""

    def validate(
        self, season: Season, fixtures: tuple[Fixture, ...] | list[Fixture]
    ) -> ValidationResult:
        issues: list[ValidationIssue] = []
        fixtures = tuple(fixtures)
        by_division: dict[str, list[Fixture]] = defaultdict(list)
        division_map = {division.id: division for division in season.divisions}
        team_map = {team.id: team for division in season.divisions for team in division.teams}
        venue_map = {venue.id: venue for venue in season.venues}

        for fixture in fixtures:
            if fixture.division_id not in division_map:
                issues.append(
                    self._issue(
                        "unknown_division", "Fixture references an unknown division.", fixture
                    )
                )
                continue
            by_division[fixture.division_id].append(fixture)
            if fixture.home_team_id == fixture.away_team_id:
                issues.append(self._issue("self_fixture", "A team cannot play itself.", fixture))
            for team_id in (fixture.home_team_id, fixture.away_team_id):
                if team_id not in team_map or team_id not in {
                    team.id for team in division_map[fixture.division_id].teams
                }:
                    issues.append(
                        self._issue("invalid_team", "Fixture team is not in its division.", fixture)
                    )
            home = team_map.get(fixture.home_team_id)
            if home and fixture.playing_venue_id != home.home_venue_id:
                issues.append(
                    self._issue(
                        "invalid_home_venue",
                        "Fixture venue differs from home team's venue.",
                        fixture,
                    )
                )
            if fixture.playing_venue_id not in venue_map:
                issues.append(
                    self._issue("unknown_venue", "Fixture references an unknown venue.", fixture)
                )
            if not fixture.manual and any(
                event.blocks_initial_generation and event.includes(fixture.scheduled_date)
                for event in season.calendar_events
            ):
                issues.append(
                    self._issue(
                        "blocked_date", "Fixture is scheduled on a blocking calendar date.", fixture
                    )
                )

        issues.extend(self._check_unique_fixture_ids(fixtures))
        issues.extend(self._check_team_date_clashes(fixtures))
        issues.extend(self._check_venue_capacity(fixtures, venue_map))
        issues.extend(self._check_week_date_alignment(fixtures))
        for division in season.divisions:
            issues.extend(
                self._check_division(division.id, tuple(division.teams), by_division[division.id])
            )
        return ValidationResult(tuple(issues))

    @staticmethod
    def _issue(code: str, message: str, fixture: Fixture) -> ValidationIssue:
        return ValidationIssue(
            code=code, message=message, fixture_ids=(fixture.id,), division_id=fixture.division_id
        )

    @staticmethod
    def _check_unique_fixture_ids(fixtures: tuple[Fixture, ...]) -> list[ValidationIssue]:
        duplicates = [
            fixture_id for fixture_id, count in Counter(f.id for f in fixtures).items() if count > 1
        ]
        return [
            ValidationIssue(
                "duplicate_fixture_id", "Fixture IDs must be unique.", fixture_ids=(fixture_id,)
            )
            for fixture_id in duplicates
        ]

    @staticmethod
    def _check_team_date_clashes(fixtures: tuple[Fixture, ...]) -> list[ValidationIssue]:
        appearances: dict[tuple[str, object], list[Fixture]] = defaultdict(list)
        for fixture in fixtures:
            appearances[(fixture.home_team_id, fixture.scheduled_date)].append(fixture)
            appearances[(fixture.away_team_id, fixture.scheduled_date)].append(fixture)
        return [
            ValidationIssue(
                "team_date_clash",
                "A team is scheduled more than once on the same date.",
                fixture_ids=tuple(fixture.id for fixture in fixtures_on_date),
            )
            for fixtures_on_date in appearances.values()
            if len(fixtures_on_date) > 1
        ]

    @staticmethod
    def _check_venue_capacity(
        fixtures: tuple[Fixture, ...], venue_map: dict[str, object]
    ) -> list[ValidationIssue]:
        grouped: dict[tuple[str, object], list[Fixture]] = defaultdict(list)
        for fixture in fixtures:
            grouped[(fixture.playing_venue_id, fixture.scheduled_date)].append(fixture)
        issues: list[ValidationIssue] = []
        for (venue_id, _), hosted in grouped.items():
            venue = venue_map.get(venue_id)
            if venue is not None and len(hosted) > venue.board_capacity:  # type: ignore[attr-defined]
                issues.append(
                    ValidationIssue(
                        "venue_capacity",
                        f"Venue {venue_id} exceeds its board capacity.",
                        fixture_ids=tuple(fixture.id for fixture in hosted),
                    )
                )
        return issues

    @staticmethod
    def _check_week_date_alignment(fixtures: tuple[Fixture, ...]) -> list[ValidationIssue]:
        """Every non-manual fixture in a week must share that week's canonical date.

        A manually rescheduled fixture is explicitly exempt: its week number is retained for
        standings/audit purposes, but its date is intentionally decoupled from the shared
        league-week date once it has been postponed.
        """
        grouped: dict[int, list[Fixture]] = defaultdict(list)
        for fixture in fixtures:
            if fixture.manual:
                continue
            grouped[fixture.week_number].append(fixture)
        issues: list[ValidationIssue] = []
        for week, week_fixtures in grouped.items():
            if len({fixture.scheduled_date for fixture in week_fixtures}) > 1:
                issues.append(
                    ValidationIssue(
                        "week_date_misalignment",
                        f"League week {week} has more than one fixture date.",
                        fixture_ids=tuple(fixture.id for fixture in week_fixtures),
                    )
                )
        return issues

    def _check_division(
        self, division_id: str, teams: tuple[object, ...], fixtures: list[Fixture]
    ) -> list[ValidationIssue]:
        team_ids = {team.id for team in teams}  # type: ignore[attr-defined]
        rounds = len(team_ids) - 1 if len(team_ids) % 2 == 0 else len(team_ids)
        expected_pairs = {frozenset(pair) for pair in combinations(team_ids, 2)}
        first = [fixture for fixture in fixtures if 1 <= fixture.week_number <= rounds]
        second = [fixture for fixture in fixtures if rounds < fixture.week_number <= rounds * 2]
        outside = [
            fixture
            for fixture in fixtures
            if fixture.week_number < 1 or fixture.week_number > rounds * 2
        ]
        issues: list[ValidationIssue] = []
        if outside:
            issues.append(
                ValidationIssue(
                    "invalid_week",
                    "Fixture is outside the division's double-round-robin weeks.",
                    tuple(fixture.id for fixture in outside),
                    division_id,
                )
            )
        first_pairs = [frozenset((fixture.home_team_id, fixture.away_team_id)) for fixture in first]
        first_counts = Counter(first_pairs)
        if set(first_pairs) != expected_pairs or any(count != 1 for count in first_counts.values()):
            issues.append(
                ValidationIssue(
                    "first_half_coverage",
                    "First half does not contain every pairing exactly once.",
                    division_id=division_id,
                )
            )
        if len(first) != len(expected_pairs) or len(second) != len(expected_pairs):
            issues.append(
                ValidationIssue(
                    "fixture_completeness",
                    "Division does not contain the required fixtures.",
                    division_id=division_id,
                )
            )
        fixtures_by_week: dict[int, list[Fixture]] = defaultdict(list)
        for fixture in fixtures:
            fixtures_by_week[fixture.week_number].append(fixture)
        for week in range(1, rounds + 1):
            first_round = fixtures_by_week[week]
            second_round = fixtures_by_week[week + rounds]
            expected_mirrors = Counter(
                (fixture.away_team_id, fixture.home_team_id) for fixture in first_round
            )
            actual = Counter(
                (fixture.home_team_id, fixture.away_team_id) for fixture in second_round
            )
            if actual != expected_mirrors:
                issues.append(
                    ValidationIssue(
                        "second_half_mirror",
                        f"Week {week + rounds} is not the home/away mirror of week {week}.",
                        tuple(fixture.id for fixture in (*first_round, *second_round)),
                        division_id,
                    )
                )
        expected_appearances = 2 * (len(team_ids) - 1)
        appearances = Counter(
            team_id
            for fixture in fixtures
            for team_id in (fixture.home_team_id, fixture.away_team_id)
        )
        if any(appearances[team_id] != expected_appearances for team_id in team_ids):
            issues.append(
                ValidationIssue(
                    "bye_behaviour",
                    "Team appearances do not match required Bye behaviour.",
                    division_id=division_id,
                )
            )
        return issues
