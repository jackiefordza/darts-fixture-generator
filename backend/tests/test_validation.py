from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from app.domain import CalendarEvent, CalendarEventType, GenerationConfig
from app.scheduling import FixtureGenerator
from app.validation import ScheduleValidator
from tests.test_fixture_engine import make_season


def generated_schedule():
    season = make_season()
    result = FixtureGenerator().generate(season, GenerationConfig(seed=19))
    assert result.success
    return season, list(result.fixtures)


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        (lambda fixtures: fixtures + [fixtures[0]], "duplicate_fixture_id"),
        (
            lambda fixtures: [
                replace(fixtures[0], away_team_id=fixtures[0].home_team_id),
                *fixtures[1:],
            ],
            "self_fixture",
        ),
        (
            lambda fixtures: [
                fixtures[0],
                replace(
                    fixtures[1],
                    home_team_id=fixtures[0].home_team_id,
                    scheduled_date=fixtures[0].scheduled_date,
                ),
                *fixtures[2:],
            ],
            "team_date_clash",
        ),
        (
            lambda fixtures: [
                replace(fixtures[0], playing_venue_id="burnaby"),
                replace(fixtures[1], playing_venue_id="burnaby"),
                replace(fixtures[2], playing_venue_id="burnaby"),
                *fixtures[3:],
            ],
            "venue_capacity",
        ),
    ],
)
def test_validator_detects_invalid_fixture_facts(mutation, expected_code: str) -> None:
    season, fixtures = generated_schedule()
    result = ScheduleValidator().validate(season, mutation(fixtures))
    assert expected_code in {issue.code for issue in result.issues}
    assert not result.is_valid


def test_validator_detects_blocked_date() -> None:
    season, fixtures = generated_schedule()
    event = CalendarEvent(
        "blocked", "Cup", fixtures[0].scheduled_date, CalendarEventType.COMPETITION, True
    )
    blocked_season = replace(season, calendar_events=(event,))
    result = ScheduleValidator().validate(blocked_season, fixtures)
    assert "blocked_date" in {issue.code for issue in result.issues}


def test_validator_detects_incorrect_second_half_mirror() -> None:
    season, fixtures = generated_schedule()
    division = season.divisions[0]
    rounds = len(division.teams) - 1
    mirror_index = next(
        index
        for index, fixture in enumerate(fixtures)
        if fixture.division_id == division.id and fixture.week_number == rounds + 1
    )
    fixtures[mirror_index] = replace(
        fixtures[mirror_index],
        home_team_id=fixtures[mirror_index].away_team_id,
        away_team_id=fixtures[mirror_index].home_team_id,
    )
    result = ScheduleValidator().validate(season, fixtures)
    assert "second_half_mirror" in {issue.code for issue in result.issues}


def test_validator_detects_missing_or_duplicate_first_half_pairing() -> None:
    season, fixtures = generated_schedule()
    first_index = next(
        index for index, fixture in enumerate(fixtures) if fixture.division_id == "d1"
    )
    fixtures.pop(first_index)
    result = ScheduleValidator().validate(season, fixtures)
    codes = {issue.code for issue in result.issues}
    assert "first_half_coverage" in codes
    assert "fixture_completeness" in codes


def test_validator_detects_week_date_misalignment() -> None:
    season, fixtures = generated_schedule()
    target = next(index for index, fixture in enumerate(fixtures) if fixture.week_number == 1)
    fixtures[target] = replace(fixtures[target], scheduled_date=date(2027, 1, 1))
    result = ScheduleValidator().validate(season, fixtures)
    assert "week_date_misalignment" in {issue.code for issue in result.issues}
