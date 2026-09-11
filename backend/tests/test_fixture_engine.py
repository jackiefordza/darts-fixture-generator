from __future__ import annotations

from datetime import date

import pytest

from app.domain import (
    CalendarEvent,
    CalendarEventType,
    Division,
    GenerationConfig,
    Season,
    Team,
    Venue,
)
from app.scheduling import FixtureGenerator


def make_season(
    counts: tuple[int, int, int, int] = (4, 5, 6, 7),
    *,
    burnaby_teams: set[str] | None = None,
    events: tuple[CalendarEvent, ...] = (),
) -> Season:
    burnaby_teams = burnaby_teams or set()
    divisions = []
    venues = [Venue("burnaby", "Burnaby Arms", 2)]
    for division_index, count in enumerate(counts, start=1):
        teams = []
        for team_index in range(1, count + 1):
            team_id = f"d{division_index}t{team_index}"
            venue_id = "burnaby" if team_id in burnaby_teams else f"v-{team_id}"
            teams.append(Team(team_id, team_id, venue_id))
            if venue_id != "burnaby":
                venues.append(Venue(venue_id, venue_id, 1))
        divisions.append(Division(f"d{division_index}", f"Division {division_index}", tuple(teams)))
    return Season(
        id="season-1",
        name="Test Season",
        divisions=tuple(divisions),
        venues=tuple(venues),
        first_fixture_date=date(2026, 9, 2),
        calendar_events=events,
    )


@pytest.mark.parametrize("count", [4, 5, 6, 7, 8])
def test_supported_division_sizes_generate_valid_double_round_robin(count: int) -> None:
    result = FixtureGenerator().generate(
        make_season((count, count, count, count)), GenerationConfig(seed=17)
    )
    assert result.success
    assert result.validation.is_valid
    expected_per_division = count * (count - 1)
    assert all(
        sum(fixture.division_id == division.id for fixture in result.fixtures)
        == expected_per_division
        for division in make_season((count, count, count, count)).divisions
    )


def test_first_half_coverage_and_second_half_mirror() -> None:
    season = make_season()
    result = FixtureGenerator().generate(season, GenerationConfig(seed=23))
    assert result.success
    for division in season.divisions:
        rounds = len(division.teams) - 1 if len(division.teams) % 2 == 0 else len(division.teams)
        first = [
            fixture
            for fixture in result.fixtures
            if fixture.division_id == division.id and fixture.week_number <= rounds
        ]
        second = [
            fixture
            for fixture in result.fixtures
            if fixture.division_id == division.id and fixture.week_number > rounds
        ]
        assert len(
            {frozenset((fixture.home_team_id, fixture.away_team_id)) for fixture in first}
        ) == len(first)
        for fixture in first:
            mirrors = [
                candidate
                for candidate in second
                if candidate.week_number == fixture.week_number + rounds
                and candidate.home_team_id == fixture.away_team_id
                and candidate.away_team_id == fixture.home_team_id
            ]
            assert len(mirrors) == 1


def test_odd_divisions_have_the_expected_bye_rounds() -> None:
    season = make_season((5, 7, 5, 7))
    result = FixtureGenerator().generate(season, GenerationConfig(seed=5))
    assert result.success
    for division in season.divisions:
        weeks = len(division.teams) * 2
        for team in division.teams:
            played = {
                fixture.week_number
                for fixture in result.fixtures
                if team.id in (fixture.home_team_id, fixture.away_team_id)
            }
            assert len(played) == 2 * (len(division.teams) - 1)
            assert len(set(range(1, weeks + 1)) - played) == 2


def test_blocked_competition_and_break_dates_do_not_consume_weeks() -> None:
    blocked = (
        CalendarEvent("competition", "Cup", date(2026, 9, 9), CalendarEventType.COMPETITION, True),
        CalendarEvent(
            "break",
            "Christmas",
            date(2026, 9, 23),
            CalendarEventType.BREAK,
            True,
            date(2026, 9, 30),
        ),
    )
    result = FixtureGenerator().generate(make_season(events=blocked), GenerationConfig(seed=1))
    assert result.success
    week_dates = {fixture.week_number: fixture.scheduled_date for fixture in result.fixtures}
    assert week_dates[1] == date(2026, 9, 2)
    assert week_dates[2] == date(2026, 9, 16)
    assert date(2026, 9, 23) not in week_dates.values()
    assert date(2026, 9, 30) not in week_dates.values()


def test_four_divisions_remain_aligned_by_week_and_teams_never_clash() -> None:
    result = FixtureGenerator().generate(make_season((4, 5, 6, 8)), GenerationConfig(seed=29))
    assert result.success
    by_week: dict[int, set[date]] = {}
    appearances: set[tuple[str, date]] = set()
    for fixture in result.fixtures:
        by_week.setdefault(fixture.week_number, set()).add(fixture.scheduled_date)
        for team_id in (fixture.home_team_id, fixture.away_team_id):
            assert (team_id, fixture.scheduled_date) not in appearances
            appearances.add((team_id, fixture.scheduled_date))
    assert all(len(dates) == 1 for dates in by_week.values())


def test_burnaby_two_board_capacity_is_applied_across_divisions() -> None:
    burnaby = {"d1t1", "d2t1", "d3t1"}
    season = make_season(burnaby_teams=burnaby)
    result = FixtureGenerator().generate(season, GenerationConfig(seed=42))
    assert result.success
    for scheduled_date in {fixture.scheduled_date for fixture in result.fixtures}:
        assert (
            sum(
                fixture.playing_venue_id == "burnaby" and fixture.scheduled_date == scheduled_date
                for fixture in result.fixtures
            )
            <= 2
        )


def test_seed_reproduces_structure_and_different_seeds_can_differ() -> None:
    season = make_season()
    generator = FixtureGenerator()
    first = generator.generate(season, GenerationConfig(seed=101))
    repeated = generator.generate(season, GenerationConfig(seed=101))
    different = generator.generate(season, GenerationConfig(seed=202))

    def shape(result: object) -> list[tuple[str, int, str, str]]:
        return [
            (fixture.division_id, fixture.week_number, fixture.home_team_id, fixture.away_team_id)
            for fixture in result.fixtures  # type: ignore[attr-defined]
        ]

    assert shape(first) == shape(repeated)
    assert shape(first) != shape(different)


def test_impossible_shared_venue_input_returns_clear_failure() -> None:
    season = make_season(
        (2, 2, 2, 2),
        burnaby_teams={"d1t1", "d1t2", "d2t1", "d2t2", "d3t1", "d3t2"},
    )
    result = FixtureGenerator().generate(season, GenerationConfig(seed=7, max_pairing_attempts=3))
    assert not result.success
    assert result.diagnostics


def test_fixture_has_future_manual_change_fields() -> None:
    result = FixtureGenerator().generate(make_season(), GenerationConfig(seed=2))
    fixture = result.fixtures[0]
    assert fixture.original_scheduled_date == fixture.scheduled_date
    assert not fixture.locked
    assert not fixture.manual
