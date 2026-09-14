"""Tests for manual fixture movement, postponements, locking, and safe regeneration."""

from __future__ import annotations

import csv
from dataclasses import replace
from datetime import date, timedelta
from io import StringIO

import pytest
from fastapi.testclient import TestClient

from app.domain import (
    CalendarEvent,
    CalendarEventType,
    Division,
    Fixture,
    GenerationConfig,
    Season,
    Team,
    Venue,
)
from app.main import create_app
from app.scheduling import FixtureGenerator
from app.services.seasons import SeasonService
from app.validation import ScheduleValidator
from tests.test_fixture_engine import make_season
from tests.test_validation import generated_schedule

DIVISION_TEAM_COUNTS = (4, 5, 6, 7)


# ---------------------------------------------------------------------------
# Validator: manual fixtures are exempt from week-date alignment / blocked-date
# ---------------------------------------------------------------------------


def test_manual_fixture_is_exempt_from_week_date_alignment() -> None:
    season, fixtures = generated_schedule()
    target = fixtures[0]
    moved = replace(
        target, scheduled_date=target.scheduled_date + timedelta(days=100), manual=True, locked=True
    )
    fixtures = [moved if fixture.id == target.id else fixture for fixture in fixtures]

    result = ScheduleValidator().validate(season, fixtures)
    assert "week_date_misalignment" not in {issue.code for issue in result.issues}


def test_non_manual_fixture_still_enforces_week_date_alignment() -> None:
    season, fixtures = generated_schedule()
    target = fixtures[0]
    misaligned = replace(target, scheduled_date=target.scheduled_date + timedelta(days=100))
    fixtures = [misaligned if fixture.id == target.id else fixture for fixture in fixtures]

    result = ScheduleValidator().validate(season, fixtures)
    assert "week_date_misalignment" in {issue.code for issue in result.issues}


def test_manual_fixture_is_exempt_from_blocked_date_check() -> None:
    """Only the manual fixture is exempt; its non-manual week-mates on the same date are not."""
    season, fixtures = generated_schedule()
    target = fixtures[0]
    blocking_event = CalendarEvent(
        "blk", "Cup", target.scheduled_date, CalendarEventType.COMPETITION, True
    )
    blocked_season = replace(season, calendar_events=(blocking_event,))
    moved = replace(target, manual=True, locked=True)
    fixtures = [moved if fixture.id == target.id else fixture for fixture in fixtures]

    result = ScheduleValidator().validate(blocked_season, fixtures)
    blocked_fixture_ids = {
        fixture_id
        for issue in result.issues
        if issue.code == "blocked_date"
        for fixture_id in issue.fixture_ids
    }
    assert target.id not in blocked_fixture_ids


def test_non_manual_fixture_still_respects_blocked_date_check() -> None:
    season, fixtures = generated_schedule()
    target = fixtures[0]
    blocking_event = CalendarEvent(
        "blk", "Cup", target.scheduled_date, CalendarEventType.COMPETITION, True
    )
    blocked_season = replace(season, calendar_events=(blocking_event,))

    result = ScheduleValidator().validate(blocked_season, fixtures)
    assert "blocked_date" in {issue.code for issue in result.issues}


# ---------------------------------------------------------------------------
# Generator: regenerate_unlocked
# ---------------------------------------------------------------------------


def test_regenerate_preserves_locked_fixtures_exactly() -> None:
    season = make_season()
    generator = FixtureGenerator()
    initial = generator.generate(season, GenerationConfig(seed=44))
    assert initial.success

    target = initial.fixtures[0]
    moved_date = target.scheduled_date + timedelta(days=3)
    locked = replace(target, scheduled_date=moved_date, locked=True, manual=True)
    existing = tuple(
        locked if fixture.id == target.id else fixture for fixture in initial.fixtures
    )

    result = generator.regenerate_unlocked(season, existing, GenerationConfig(seed=99))
    assert result.success
    preserved = next(fixture for fixture in result.fixtures if fixture.id == target.id)
    assert preserved == locked


def test_regenerate_still_satisfies_hard_constraints() -> None:
    season = make_season()
    generator = FixtureGenerator()
    initial = generator.generate(season, GenerationConfig(seed=13))
    assert initial.success

    locked_ids = {initial.fixtures[0].id, initial.fixtures[1].id}
    existing = tuple(
        replace(fixture, locked=True, manual=True) if fixture.id in locked_ids else fixture
        for fixture in initial.fixtures
    )
    result = generator.regenerate_unlocked(season, existing, GenerationConfig(seed=77))
    assert result.success
    assert result.validation.is_valid
    assert ScheduleValidator().validate(season, result.fixtures).is_valid


def test_regenerate_respects_shared_venue_capacity() -> None:
    burnaby = {"d1t1", "d2t1", "d3t1"}
    season = make_season(burnaby_teams=burnaby)
    generator = FixtureGenerator()
    initial = generator.generate(season, GenerationConfig(seed=8))
    assert initial.success

    result = generator.regenerate_unlocked(season, initial.fixtures, GenerationConfig(seed=21))
    assert result.success
    for scheduled_date in {fixture.scheduled_date for fixture in result.fixtures}:
        assert (
            sum(
                fixture.playing_venue_id == "burnaby" and fixture.scheduled_date == scheduled_date
                for fixture in result.fixtures
            )
            <= 2
        )


def test_regenerate_does_not_invent_neutral_venues() -> None:
    season = make_season()
    generator = FixtureGenerator()
    initial = generator.generate(season, GenerationConfig(seed=15))
    assert initial.success

    known_venue_ids = {venue.id for venue in season.venues}
    result = generator.regenerate_unlocked(season, initial.fixtures, GenerationConfig(seed=16))
    assert result.success
    assert all(fixture.playing_venue_id in known_venue_ids for fixture in result.fixtures)


def test_regenerate_reports_diagnostics_instead_of_an_invalid_schedule() -> None:
    """Divisions 2-4 are fully free; division 1's single locked leg already fills the
    only shared board at week 1, leaving nowhere valid for more than one of them."""
    burnaby = Venue("burnaby", "Burnaby Arms", 1)
    venues = [burnaby]
    divisions = []
    fixtures: list[Fixture] = []
    week1, week2 = date(2026, 9, 2), date(2026, 9, 9)
    for index in range(1, 5):
        home_id, away_id = f"x{index}", f"y{index}"
        away_venue_id = f"v{index}"
        venues.append(Venue(away_venue_id, away_venue_id, 1))
        divisions.append(
            Division(
                f"d{index}",
                f"Division {index}",
                (Team(home_id, home_id, "burnaby"), Team(away_id, away_id, away_venue_id)),
            )
        )
        locked = index == 1
        fixtures.append(
            Fixture(
                id=f"f{index}-1",
                division_id=f"d{index}",
                home_team_id=home_id,
                away_team_id=away_id,
                week_number=1,
                scheduled_date=week1,
                playing_venue_id="burnaby",
                original_scheduled_date=week1,
                locked=locked,
                manual=locked,
            )
        )
        fixtures.append(
            Fixture(
                id=f"f{index}-2",
                division_id=f"d{index}",
                home_team_id=away_id,
                away_team_id=home_id,
                week_number=2,
                scheduled_date=week2,
                playing_venue_id=away_venue_id,
                original_scheduled_date=week2,
                locked=locked,
                manual=locked,
            )
        )
    season = Season(
        id="s", name="S", divisions=tuple(divisions), venues=tuple(venues), first_fixture_date=week1
    )

    result = FixtureGenerator().regenerate_unlocked(
        season, tuple(fixtures), GenerationConfig(seed=5)
    )
    assert not result.success
    assert result.fixtures == ()
    assert result.diagnostics


# ---------------------------------------------------------------------------
# _suggest_dates: suggestions must pass full validation, not a heuristic proxy
# ---------------------------------------------------------------------------


def _clashing_date(fixtures: list, target) -> date:
    return next(
        fixture.scheduled_date
        for fixture in fixtures
        if fixture.id != target.id
        and target.home_team_id in (fixture.home_team_id, fixture.away_team_id)
        and fixture.scheduled_date != target.scheduled_date
    )


def test_suggested_dates_pass_full_schedule_validation() -> None:
    season, fixtures = generated_schedule()
    service = SeasonService(repository=None)
    target = fixtures[0]
    desired_date = _clashing_date(fixtures, target)

    suggestions = service._suggest_dates(season, fixtures, target, desired_date)
    assert suggestions
    assert len(suggestions) <= 3

    others = tuple(fixture for fixture in fixtures if fixture.id != target.id)
    for iso_date in suggestions:
        moved = replace(
            target, scheduled_date=date.fromisoformat(iso_date), locked=True, manual=True
        )
        result = ScheduleValidator().validate(season, (*others, moved))
        assert result.is_valid, result.issues


def test_suggested_dates_exclude_superficially_free_dates_with_other_violations() -> None:
    """A date can be free of clashes/capacity issues for `target` alone and still be unusable,

    if it leaves some *other* hard-constraint violation in the complete schedule. A
    team-clash/capacity-only heuristic cannot see that; only running the real validator over
    the whole resulting schedule can.
    """
    season, fixtures = generated_schedule()
    service = SeasonService(repository=None)
    target = fixtures[0]
    other = fixtures[1]
    desired_date = _clashing_date(fixtures, target)

    # Corrupt an unrelated fixture into a self-fixture: a hard-constraint violation that has
    # nothing to do with `target`'s own team or venue, so it is invisible to a check that only
    # looks at `target`'s clashes/capacity -- but it invalidates every possible candidate date.
    corrupted = replace(other, away_team_id=other.home_team_id)
    corrupted_fixtures = [
        corrupted if fixture.id == other.id else fixture for fixture in fixtures
    ]

    assert service._suggest_dates(season, corrupted_fixtures, target, desired_date) == []


# ---------------------------------------------------------------------------
# API: move / lock / history / regenerate
# ---------------------------------------------------------------------------


@pytest.fixture
def app_client(tmp_path):
    db_path = tmp_path / "fixtures.db"
    app = create_app(f"sqlite:///{db_path}")
    return TestClient(app), db_path


def build_full_season(client: TestClient, team_names=None) -> dict:
    season = client.post(
        "/seasons",
        json={"league_name": "Test League", "name": "2026", "first_fixture_date": "2026-09-02"},
    ).json()
    season_id = season["id"]

    def make_venue(name: str, capacity: int = 1) -> str:
        return client.post(
            f"/seasons/{season_id}/venues", json={"name": name, "board_capacity": capacity}
        ).json()["id"]

    burnaby_id = make_venue("Burnaby Arms", 2)
    divisions = []
    for division_index, count in enumerate(DIVISION_TEAM_COUNTS, start=1):
        division = client.post(
            f"/seasons/{season_id}/divisions",
            json={"name": f"Division {division_index}", "position": division_index},
        ).json()
        team_ids = []
        for team_index in range(count):
            venue_id = (
                burnaby_id
                if division_index <= 3 and team_index == 0
                else make_venue(f"V{division_index}-{team_index}")
            )
            name = (
                team_names(division_index, team_index)
                if team_names
                else f"T{division_index}-{team_index}"
            )
            team = client.post(
                f"/seasons/{season_id}/teams",
                json={
                    "division_id": division["id"],
                    "name": name,
                    "position": team_index + 1,
                    "venue_id": venue_id,
                },
            ).json()
            team_ids.append(team["id"])
        divisions.append({"id": division["id"], "name": division["name"], "team_ids": team_ids})
    return {"season_id": season_id, "divisions": divisions, "burnaby_id": burnaby_id}


def _fixtures(client: TestClient, season_id: str) -> list[dict]:
    return client.get(f"/seasons/{season_id}/fixtures").json()


def test_successful_move_locks_fixture_and_records_history(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 51})
    target = _fixtures(client, season["season_id"])[0]
    new_date = "2030-01-02"

    response = client.post(
        f"/fixtures/{target['id']}/move",
        json={
            "new_date": new_date,
            "reason": "Postponed - waterlogged board",
            "actor": "league-secretary",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["scheduled_date"] == new_date
    assert body["original_scheduled_date"] == target["scheduled_date"]
    assert bool(body["locked"]) is True
    assert bool(body["manual"]) is True
    assert len(body["history"]) == 1
    entry = body["history"][0]
    assert entry["from_date"] == target["scheduled_date"]
    assert entry["to_date"] == new_date
    assert entry["reason"] == "Postponed - waterlogged board"
    assert entry["actor"] == "league-secretary"

    validation = client.post(f"/seasons/{season['season_id']}/validate").json()
    assert validation["is_valid"]


def test_second_move_appends_to_history_rather_than_overwriting(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 52})
    target = _fixtures(client, season["season_id"])[0]
    original_date = target["scheduled_date"]

    client.post(f"/fixtures/{target['id']}/move", json={"new_date": "2030-01-02"})
    second = client.post(
        f"/fixtures/{target['id']}/move",
        json={"new_date": "2030-02-06", "reason": "Second postponement"},
    )
    assert second.status_code == 200
    body = second.json()
    history = body["history"]
    assert len(history) == 2
    assert history[0]["to_date"] == "2030-01-02"
    assert history[1]["from_date"] == "2030-01-02"
    assert history[1]["to_date"] == "2030-02-06"
    assert body["original_scheduled_date"] == original_date


def test_move_conflict_returns_structured_error_with_suggestions(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 53})
    fixtures = _fixtures(client, season["season_id"])
    target = fixtures[0]
    clash_date = next(
        fixture["scheduled_date"]
        for fixture in fixtures
        if fixture["id"] != target["id"]
        and target["home_team_id"] in (fixture["home_team_id"], fixture["away_team_id"])
        and fixture["scheduled_date"] != target["scheduled_date"]
    )

    response = client.post(f"/fixtures/{target['id']}/move", json={"new_date": clash_date})
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["issues"]
    assert any(issue["code"] == "team_date_clash" for issue in detail["issues"])
    assert "suggested_dates" in detail
    assert detail["suggested_dates"]
    assert len(detail["suggested_dates"]) <= 3

    unchanged = next(
        fixture
        for fixture in _fixtures(client, season["season_id"])
        if fixture["id"] == target["id"]
    )
    assert unchanged == target

    # A suggestion is only useful if it is genuinely actionable: applying it for real must
    # succeed, and the complete resulting schedule must still validate.
    applied = client.post(
        f"/fixtures/{target['id']}/move", json={"new_date": detail["suggested_dates"][0]}
    )
    assert applied.status_code == 200
    assert client.post(f"/seasons/{season['season_id']}/validate").json()["is_valid"]


def test_move_conflict_due_to_shared_venue_capacity(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 61})
    burnaby_id = season["burnaby_id"]
    fixtures = _fixtures(client, season["season_id"])
    burnaby_fixtures = [
        fixture for fixture in fixtures if fixture["playing_venue_id"] == burnaby_id
    ]

    distinct_by_team: dict[str, dict] = {}
    for fixture in burnaby_fixtures:
        distinct_by_team.setdefault(fixture["home_team_id"], fixture)
    chosen = list(distinct_by_team.values())
    assert len(chosen) >= 3
    first, second, third = chosen[0], chosen[1], chosen[2]

    target_date = "2030-03-06"
    first_move = client.post(f"/fixtures/{first['id']}/move", json={"new_date": target_date})
    second_move = client.post(f"/fixtures/{second['id']}/move", json={"new_date": target_date})
    assert first_move.status_code == 200
    assert second_move.status_code == 200

    response = client.post(f"/fixtures/{third['id']}/move", json={"new_date": target_date})
    assert response.status_code == 409
    issues = response.json()["detail"]["issues"]
    assert any(issue["code"] == "venue_capacity" for issue in issues)


def test_move_missing_fixture_returns_404(app_client) -> None:
    client, _ = app_client
    response = client.post("/fixtures/does-not-exist/move", json={"new_date": "2030-01-01"})
    assert response.status_code == 404


def test_get_fixture_returns_detail_and_history(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 71})
    target = _fixtures(client, season["season_id"])[0]
    client.post(
        f"/fixtures/{target['id']}/move",
        json={"new_date": "2030-04-10", "reason": "Cup clash"},
    )

    detail = client.get(f"/fixtures/{target['id']}").json()
    assert detail["scheduled_date"] == "2030-04-10"
    assert len(detail["history"]) == 1
    assert detail["history"][0]["reason"] == "Cup clash"


def test_get_fixture_missing_returns_404(app_client) -> None:
    client, _ = app_client
    assert client.get("/fixtures/does-not-exist").status_code == 404


def test_move_onto_blocked_calendar_date_is_allowed(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(
        f"/seasons/{season['season_id']}/events",
        json={
            "name": "Cup Final",
            "start_date": "2030-07-03",
            "event_type": "competition",
            "blocks_initial_generation": True,
        },
    )
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 111})
    target = _fixtures(client, season["season_id"])[0]

    response = client.post(f"/fixtures/{target['id']}/move", json={"new_date": "2030-07-03"})
    assert response.status_code == 200
    assert response.json()["scheduled_date"] == "2030-07-03"


def test_regenerate_preserves_locked_fixtures_via_api(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 81})
    target = _fixtures(client, season["season_id"])[0]
    moved = client.post(
        f"/fixtures/{target['id']}/move",
        json={"new_date": "2030-05-08", "reason": "Ground closed"},
    ).json()

    result = client.post(f"/seasons/{season['season_id']}/regenerate", params={"seed": 999})
    assert result.status_code == 200
    body = result.json()
    assert body["success"]
    assert body["validation"]["is_valid"]

    after = {fixture["id"]: fixture for fixture in _fixtures(client, season["season_id"])}
    assert after[target["id"]]["scheduled_date"] == moved["scheduled_date"]
    assert bool(after[target["id"]]["locked"]) is True
    assert bool(after[target["id"]]["manual"]) is True

    history = client.get(f"/fixtures/{target['id']}").json()["history"]
    assert len(history) == 1
    assert history[0]["reason"] == "Ground closed"


def test_regenerate_without_existing_schedule_returns_conflict(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    response = client.post(f"/seasons/{season['season_id']}/regenerate")
    assert response.status_code == 409


def test_regenerate_missing_season_returns_404(app_client) -> None:
    client, _ = app_client
    assert client.post("/seasons/does-not-exist/regenerate").status_code == 404


def test_csv_export_reflects_moved_current_date_not_original(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 91})
    target = _fixtures(client, season["season_id"])[0]
    client.post(f"/fixtures/{target['id']}/move", json={"new_date": "2030-06-05"})

    text = client.get(f"/seasons/{season['season_id']}/fixtures.csv").text
    rows = {row["fixture_id"]: row for row in csv.DictReader(StringIO(text))}
    assert rows[target["id"]]["date"] == "2030-06-05"
