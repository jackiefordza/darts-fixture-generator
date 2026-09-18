"""Phase 7 integration tests: a realistic four-division season end-to-end.

The dataset below is clearly-marked TEST/INTEGRATION DATA ONLY. Division and team names
are neutral placeholders ("Division 1 Team 1", ...) chosen to exercise the real structural
constraints this application must support for any league -- an even division alongside
three odd divisions with automatic Byes, and a shared venue whose board capacity is smaller
than the number of teams that call it home (the "Burnaby Arms" 2-board/3-team constraint
already used as a naming convention in the unit-level fixture-engine tests). None of this
is, or should be read as, real league membership or a real season configuration.

These tests exercise the domain layer directly (fast, structural assertions - TEST GROUPS
1-4 and 10) and the full HTTP + SQLite boundary (TEST GROUPS 5-9), matching the two ways
the rest of the suite already tests this codebase.
"""

from __future__ import annotations

import csv
import sqlite3
from datetime import date, timedelta
from io import StringIO

import pytest
from fastapi.testclient import TestClient

from app.domain import (
    CalendarEvent,
    CalendarEventType,
    Division,
    GenerationConfig,
    Season,
    Team,
    Venue,
)
from app.main import create_app
from app.persistence import SQLiteRepository
from app.scheduling import FixtureGenerator
from app.services.seasons import SeasonService
from app.validation import ScheduleValidator

# ---------------------------------------------------------------------------
# Realistic four-division test/integration dataset (structure only)
# ---------------------------------------------------------------------------

DIVISION_TEAM_COUNTS = (8, 7, 7, 7)  # Division 1 even; Divisions 2-4 odd -> automatic Bye
FIRST_FIXTURE_DATE = date(2026, 10, 14)  # a Wednesday, the normal fixture night
CADENCE_DAYS = 7
SHARED_VENUE_ID = "burnaby-arms"
SHARED_VENUE_NAME = "Burnaby Arms"
SHARED_VENUE_CAPACITY = 2
SHARED_VENUE_TEAM_IDS = {"d1t1", "d2t1", "d3t1"}  # 3 teams sharing a 2-board venue

# One single blocked Wednesday, and one break spanning two consecutive Wednesdays,
# both landing exactly on the normal weekly cadence so initial generation must skip them.
SINGLE_BLOCKED_DATE = date(2026, 11, 4)
CONSECUTIVE_BLOCKED_DATES = (date(2026, 12, 23), date(2026, 12, 30))


def realistic_calendar_events() -> tuple[CalendarEvent, ...]:
    return (
        CalendarEvent(
            id="evt-county-cup",
            name="County Cup Round 1",
            start_date=SINGLE_BLOCKED_DATE,
            event_type=CalendarEventType.COMPETITION,
            blocks_initial_generation=True,
        ),
        CalendarEvent(
            id="evt-christmas-break",
            name="Christmas and New Year Break",
            start_date=CONSECUTIVE_BLOCKED_DATES[0],
            end_date=CONSECUTIVE_BLOCKED_DATES[1],
            event_type=CalendarEventType.BREAK,
            blocks_initial_generation=True,
        ),
    )


def realistic_domain_season(*, events: tuple[CalendarEvent, ...] | None = None) -> Season:
    """Build the Phase 7 test/integration season as plain domain objects."""
    divisions = []
    venues = [Venue(SHARED_VENUE_ID, SHARED_VENUE_NAME, SHARED_VENUE_CAPACITY)]
    for division_index, count in enumerate(DIVISION_TEAM_COUNTS, start=1):
        teams = []
        for team_index in range(1, count + 1):
            team_id = f"d{division_index}t{team_index}"
            name = f"Division {division_index} Team {team_index}"
            if team_id in SHARED_VENUE_TEAM_IDS:
                venue_id = SHARED_VENUE_ID
            else:
                venue_id = f"v-{team_id}"
                venues.append(Venue(venue_id, f"{name} Venue", 1))
            teams.append(Team(team_id, name, venue_id))
        divisions.append(
            Division(f"d{division_index}", f"Division {division_index}", tuple(teams))
        )
    return Season(
        id="phase7-season",
        name="Phase 7 Integration Test Season",
        divisions=tuple(divisions),
        venues=tuple(venues),
        first_fixture_date=FIRST_FIXTURE_DATE,
        calendar_events=events if events is not None else realistic_calendar_events(),
    )


def rounds_per_half(team_count: int) -> int:
    return team_count - 1 if team_count % 2 == 0 else team_count


TOTAL_WEEKS = 2 * rounds_per_half(DIVISION_TEAM_COUNTS[0])
assert TOTAL_WEEKS == 2 * rounds_per_half(7) == 14, "sanity check on the chosen dataset shape"


# ---------------------------------------------------------------------------
# TEST GROUP 1 - complete generation
# ---------------------------------------------------------------------------


def test_complete_four_division_season_generates_correctly() -> None:
    season = realistic_domain_season()
    result = FixtureGenerator().generate(season, GenerationConfig(seed=2026))

    assert result.success, result.diagnostics
    assert result.validation.is_valid, result.validation.issues

    divisions_seen = {fixture.division_id for fixture in result.fixtures}
    assert divisions_seen == {division.id for division in season.divisions}

    for division, count in zip(season.divisions, DIVISION_TEAM_COUNTS, strict=True):
        division_fixtures = [f for f in result.fixtures if f.division_id == division.id]
        assert len(division_fixtures) == count * (count - 1)

        team_ids = {team.id for team in division.teams}
        first_half = [f for f in division_fixtures if f.week_number <= rounds_per_half(count)]
        pairs_first_half = [frozenset((f.home_team_id, f.away_team_id)) for f in first_half]
        assert len(pairs_first_half) == len(set(pairs_first_half)), "no duplicate pairing in a half"
        expected_pairs = {frozenset(p) for p in _combinations(team_ids)}
        assert set(pairs_first_half) == expected_pairs

        all_pairs = [frozenset((f.home_team_id, f.away_team_id)) for f in division_fixtures]
        for pair in expected_pairs:
            assert all_pairs.count(pair) == 2, "every pairing occurs exactly twice overall"

    assert max(f.week_number for f in result.fixtures) == TOTAL_WEEKS

    appearances: set[tuple[str, date]] = set()
    for fixture in result.fixtures:
        for team_id in (fixture.home_team_id, fixture.away_team_id):
            key = (team_id, fixture.scheduled_date)
            assert key not in appearances, "a team must never play twice on the same date"
            appearances.add(key)


def _combinations(team_ids: set[str]) -> list[tuple[str, str]]:
    ordered = sorted(team_ids)
    return [(a, b) for i, a in enumerate(ordered) for b in ordered[i + 1 :]]


def test_odd_divisions_each_real_team_gets_the_correct_number_of_byes() -> None:
    season = realistic_domain_season()
    result = FixtureGenerator().generate(season, GenerationConfig(seed=2026))
    assert result.success

    for division, count in zip(season.divisions, DIVISION_TEAM_COUNTS, strict=True):
        if count % 2 == 0:
            continue
        rounds = rounds_per_half(count)
        for team in division.teams:
            played_weeks = {
                f.week_number
                for f in result.fixtures
                if f.division_id == division.id
                and team.id in (f.home_team_id, f.away_team_id)
            }
            missed = set(range(1, 2 * rounds + 1)) - played_weeks
            assert len(missed) == 2, "one Bye in each half for every real team"
            first_half_miss = [week for week in missed if week <= rounds]
            second_half_miss = [week for week in missed if week > rounds]
            assert len(first_half_miss) == 1
            assert len(second_half_miss) == 1
            assert second_half_miss[0] == first_half_miss[0] + rounds


# ---------------------------------------------------------------------------
# TEST GROUP 2 - home/away mirror
# ---------------------------------------------------------------------------


def test_second_half_is_an_exact_home_away_mirror_of_the_first() -> None:
    season = realistic_domain_season()
    result = FixtureGenerator().generate(season, GenerationConfig(seed=4242))
    assert result.success

    for division, count in zip(season.divisions, DIVISION_TEAM_COUNTS, strict=True):
        rounds = rounds_per_half(count)
        division_fixtures = [f for f in result.fixtures if f.division_id == division.id]
        first_half = [f for f in division_fixtures if f.week_number <= rounds]
        second_half = [f for f in division_fixtures if f.week_number > rounds]
        assert len(first_half) == len(second_half)

        mirrored_ids: set[str] = set()
        for fixture in first_half:
            mirrors = [
                candidate
                for candidate in second_half
                if candidate.week_number == fixture.week_number + rounds
                and candidate.home_team_id == fixture.away_team_id
                and candidate.away_team_id == fixture.home_team_id
            ]
            assert len(mirrors) == 1, "each first-half fixture has exactly one mirror"
            mirror = mirrors[0]
            assert mirror.id not in mirrored_ids, "mirror mapping must be one-to-one"
            mirrored_ids.add(mirror.id)
        assert mirrored_ids == {f.id for f in second_half}, "every second-half fixture is used"


# ---------------------------------------------------------------------------
# TEST GROUP 3 - venue capacity (the Burnaby Arms 2-board/3-team constraint)
# ---------------------------------------------------------------------------


def test_shared_two_board_venue_never_exceeds_capacity_across_divisions() -> None:
    season = realistic_domain_season()
    result = FixtureGenerator().generate(season, GenerationConfig(seed=99))
    assert result.success

    by_date: dict[date, list] = {}
    for fixture in result.fixtures:
        if fixture.playing_venue_id == SHARED_VENUE_ID:
            by_date.setdefault(fixture.scheduled_date, []).append(fixture)

    assert by_date, "the shared venue should host fixtures across the season"
    for scheduled_date, hosted in by_date.items():
        assert len(hosted) <= SHARED_VENUE_CAPACITY, (
            f"{SHARED_VENUE_NAME} exceeded its {SHARED_VENUE_CAPACITY}-board capacity "
            f"on {scheduled_date}"
        )

    # With 3 teams sharing a 2-board venue, capacity pressure must actually bite at least
    # once: some date has both boards full (two of the three teams home simultaneously),
    # proving the third team was forced away rather than the constraint going untested.
    dates_at_full_capacity = [
        d for d, hosted in by_date.items() if len(hosted) == SHARED_VENUE_CAPACITY
    ]
    assert dates_at_full_capacity, "capacity pressure should occur at least once in a full season"


def test_impossible_venue_configuration_is_diagnosed_not_silently_generated() -> None:
    """Two boards cannot possibly host three home teams from the same tiny division setup
    every week when there is nowhere else for the overflow to go: three 2-team divisions
    forced entirely onto one single-board venue on both sides of every fixture."""
    single_board = Venue("only-venue", "Only Venue", 1)
    divisions = []
    for index in range(1, 4):
        home_id, away_id = f"h{index}", f"a{index}"
        divisions.append(
            Division(
                f"d{index}",
                f"Division {index}",
                (
                    Team(home_id, home_id, single_board.id),
                    Team(away_id, away_id, single_board.id),
                ),
            )
        )
    season = Season(
        id="impossible",
        name="Impossible",
        divisions=tuple(divisions),
        venues=(single_board,),
        first_fixture_date=FIRST_FIXTURE_DATE,
    )
    result = FixtureGenerator().generate(season, GenerationConfig(seed=1, max_pairing_attempts=5))
    assert not result.success
    assert result.fixtures == ()
    assert result.diagnostics
    assert any(result.diagnostics)


# ---------------------------------------------------------------------------
# TEST GROUP 4 - blackout / competition dates
# ---------------------------------------------------------------------------


def test_blocked_dates_single_and_consecutive_are_skipped_and_weeks_stay_correct() -> None:
    season = realistic_domain_season()
    result = FixtureGenerator().generate(season, GenerationConfig(seed=555))
    assert result.success

    used_dates = {fixture.scheduled_date for fixture in result.fixtures}
    assert SINGLE_BLOCKED_DATE not in used_dates
    for blocked in CONSECUTIVE_BLOCKED_DATES:
        assert blocked not in used_dates

    week_dates = {fixture.week_number: fixture.scheduled_date for fixture in result.fixtures}
    assert set(week_dates) == set(range(1, TOTAL_WEEKS + 1)), "week numbering stays contiguous"
    ordered_dates = [week_dates[week] for week in sorted(week_dates)]
    assert ordered_dates == sorted(ordered_dates), "dates strictly increase with week number"
    assert len(ordered_dates) == len(set(ordered_dates)), "each league week has its own date"

    # The first three weeks are unaffected; the County Cup date is skipped for week 4.
    assert week_dates[1] == FIRST_FIXTURE_DATE
    assert week_dates[2] == FIRST_FIXTURE_DATE + timedelta(days=7)
    assert week_dates[3] == FIRST_FIXTURE_DATE + timedelta(days=14)
    assert week_dates[4] != SINGLE_BLOCKED_DATE


def test_blocked_dates_do_not_become_accidental_league_weeks() -> None:
    season = realistic_domain_season()
    result = FixtureGenerator().generate(season, GenerationConfig(seed=555))
    assert result.success
    validation = ScheduleValidator().validate(season, result.fixtures)
    assert validation.is_valid
    assert not any(issue.code == "blocked_date" for issue in validation.issues)


# ---------------------------------------------------------------------------
# TEST GROUP 10 - reproducibility
# ---------------------------------------------------------------------------


def test_same_seed_is_reproducible_and_different_seed_can_differ() -> None:
    season = realistic_domain_season()
    generator = FixtureGenerator()

    first = generator.generate(season, GenerationConfig(seed=7000))
    repeated = generator.generate(season, GenerationConfig(seed=7000))
    different = generator.generate(season, GenerationConfig(seed=8000))

    def shape(result) -> list[tuple[str, int, str, str, str]]:
        return sorted(
            (f.division_id, f.week_number, f.home_team_id, f.away_team_id, f.id)
            for f in result.fixtures
        )

    assert first.success and repeated.success and different.success
    assert shape(first) == shape(repeated)
    assert shape(first) != shape(different)


# ---------------------------------------------------------------------------
# HTTP + SQLite integration helpers (TEST GROUPS 5-9)
# ---------------------------------------------------------------------------


@pytest.fixture
def app_client(tmp_path):
    db_path = tmp_path / "phase7.db"
    app = create_app(f"sqlite:///{db_path}")
    return TestClient(app), db_path


def build_realistic_season_via_client(client: TestClient) -> dict:
    season = client.post(
        "/seasons",
        json={
            "league_name": "Phase 7 Test League",
            "name": "2026/27 Integration Test Season",
            "first_fixture_date": FIRST_FIXTURE_DATE.isoformat(),
            "cadence_days": CADENCE_DAYS,
        },
    ).json()
    season_id = season["id"]

    burnaby_id = client.post(
        f"/seasons/{season_id}/venues",
        json={"name": SHARED_VENUE_NAME, "board_capacity": SHARED_VENUE_CAPACITY},
    ).json()["id"]

    for event in realistic_calendar_events():
        client.post(
            f"/seasons/{season_id}/events",
            json={
                "name": event.name,
                "start_date": event.start_date.isoformat(),
                "end_date": event.end_date.isoformat() if event.end_date else None,
                "event_type": event.event_type.value,
                "blocks_initial_generation": event.blocks_initial_generation,
            },
        )

    divisions = []
    for division_index, count in enumerate(DIVISION_TEAM_COUNTS, start=1):
        division = client.post(
            f"/seasons/{season_id}/divisions",
            json={"name": f"Division {division_index}", "position": division_index},
        ).json()
        team_ids = []
        for team_index in range(1, count + 1):
            team_key = f"d{division_index}t{team_index}"
            name = f"Division {division_index} Team {team_index}"
            if team_key in SHARED_VENUE_TEAM_IDS:
                venue_id = burnaby_id
            else:
                venue_id = client.post(
                    f"/seasons/{season_id}/venues",
                    json={"name": f"{name} Venue", "board_capacity": 1},
                ).json()["id"]
            team = client.post(
                f"/seasons/{season_id}/teams",
                json={
                    "division_id": division["id"],
                    "name": name,
                    "position": team_index,
                    "venue_id": venue_id,
                },
            ).json()
            team_ids.append(team["id"])
        divisions.append({"id": division["id"], "name": division["name"], "team_ids": team_ids})
    return {"season_id": season_id, "divisions": divisions, "burnaby_id": burnaby_id}


def _fixtures(client: TestClient, season_id: str) -> list[dict]:
    return client.get(f"/seasons/{season_id}/fixtures").json()


# ---------------------------------------------------------------------------
# TEST GROUP 5 - manual postponement
# ---------------------------------------------------------------------------


def test_manual_postponement_of_a_realistic_fixture(app_client) -> None:
    client, _ = app_client
    season = build_realistic_season_via_client(client)
    generated = client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 12345})
    assert generated.json()["success"]

    before = _fixtures(client, season["season_id"])
    target = before[0]
    new_date = "2030-01-02"

    response = client.post(
        f"/fixtures/{target['id']}/move",
        json={"new_date": new_date, "reason": "Postponed - hall unavailable", "actor": "secretary"},
    )
    assert response.status_code == 200
    moved = response.json()

    assert moved["id"] == target["id"]
    assert moved["home_team_id"] == target["home_team_id"]
    assert moved["away_team_id"] == target["away_team_id"]
    assert moved["week_number"] == target["week_number"]
    assert moved["original_scheduled_date"] == target["scheduled_date"]
    assert moved["scheduled_date"] == new_date
    assert bool(moved["locked"]) is True
    assert bool(moved["manual"]) is True
    assert len(moved["history"]) == 1
    assert moved["history"][0]["from_date"] == target["scheduled_date"]
    assert moved["history"][0]["to_date"] == new_date

    validation = client.post(f"/seasons/{season['season_id']}/validate").json()
    assert validation["is_valid"], validation["issues"]


# ---------------------------------------------------------------------------
# TEST GROUP 6 - conflicting postponement
# ---------------------------------------------------------------------------


def test_conflicting_postponement_is_rejected_with_structured_issues(app_client) -> None:
    client, _ = app_client
    season = build_realistic_season_via_client(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 23456})

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
    assert detail["suggested_dates"]

    unchanged = next(
        f for f in _fixtures(client, season["season_id"]) if f["id"] == target["id"]
    )
    assert unchanged == target, "a rejected move must not partially modify the fixture"

    others = [f for f in fixtures if f["id"] != target["id"]]
    for iso_date in detail["suggested_dates"]:
        for fixture in others:
            if fixture["scheduled_date"] == iso_date:
                assert target["home_team_id"] not in (
                    fixture["home_team_id"],
                    fixture["away_team_id"],
                )

    applied = client.post(
        f"/fixtures/{target['id']}/move", json={"new_date": detail["suggested_dates"][0]}
    )
    assert applied.status_code == 200
    assert client.post(f"/seasons/{season['season_id']}/validate").json()["is_valid"]


# ---------------------------------------------------------------------------
# TEST GROUP 7 - regenerate unlocked
# ---------------------------------------------------------------------------


def test_regenerate_preserves_locked_fixtures_and_keeps_realistic_schedule_valid(
    app_client,
) -> None:
    client, _ = app_client
    season = build_realistic_season_via_client(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 34567})

    fixtures = _fixtures(client, season["season_id"])
    to_lock = fixtures[:3]
    locked_after_move = []
    for index, fixture in enumerate(to_lock):
        moved = client.post(
            f"/fixtures/{fixture['id']}/move",
            json={"new_date": f"2030-0{index + 2}-15", "reason": "Manually rescheduled"},
        )
        assert moved.status_code == 200
        locked_after_move.append(moved.json())

    result = client.post(f"/seasons/{season['season_id']}/regenerate", params={"seed": 99999})
    assert result.status_code == 200
    body = result.json()
    assert body["success"], body["diagnostics"]
    assert body["validation"]["is_valid"], body["validation"]["issues"]

    after = {f["id"]: f for f in _fixtures(client, season["season_id"])}
    for locked in locked_after_move:
        current = after[locked["id"]]
        assert current["scheduled_date"] == locked["scheduled_date"]
        assert current["home_team_id"] == locked["home_team_id"]
        assert current["away_team_id"] == locked["away_team_id"]
        assert bool(current["locked"]) is True
        assert bool(current["manual"]) is True

    all_fixture_ids = [f["id"] for f in after.values()]
    assert len(all_fixture_ids) == len(set(all_fixture_ids)), "no duplicate fixtures introduced"

    final_validation = client.post(f"/seasons/{season['season_id']}/validate").json()
    assert final_validation["is_valid"], final_validation["issues"]

    burnaby_id = season["burnaby_id"]
    by_date: dict[str, int] = {}
    for fixture in after.values():
        if fixture["playing_venue_id"] == burnaby_id:
            by_date[fixture["scheduled_date"]] = by_date.get(fixture["scheduled_date"], 0) + 1
    assert all(count <= SHARED_VENUE_CAPACITY for count in by_date.values())


# ---------------------------------------------------------------------------
# TEST GROUP 8 - persistence across a fresh repository/service boundary
# ---------------------------------------------------------------------------


def test_full_season_survives_a_persistence_boundary_restart(tmp_path) -> None:
    db_path = tmp_path / "phase7-persistence.db"
    repository = SQLiteRepository(f"sqlite:///{db_path}")
    repository.migrate()
    service = SeasonService(repository)

    season = service.create_season(
        "Phase 7 Test League",
        "2026/27 Integration Test Season",
        FIRST_FIXTURE_DATE,
        cadence_days=CADENCE_DAYS,
    )
    season_id = season["id"]
    burnaby = service.add(
        "venue", season_id, {"name": SHARED_VENUE_NAME, "board_capacity": SHARED_VENUE_CAPACITY}
    )
    for event in realistic_calendar_events():
        service.add(
            "event",
            season_id,
            {
                "name": event.name,
                "start_date": event.start_date,
                "end_date": event.end_date,
                "event_type": event.event_type,
                "blocks_initial_generation": event.blocks_initial_generation,
                "appears_on_poster": False,
            },
        )
    for division_index, count in enumerate(DIVISION_TEAM_COUNTS, start=1):
        division = service.add(
            "division",
            season_id,
            {"name": f"Division {division_index}", "position": division_index},
        )
        for team_index in range(1, count + 1):
            team_key = f"d{division_index}t{team_index}"
            name = f"Division {division_index} Team {team_index}"
            venue = (
                burnaby
                if team_key in SHARED_VENUE_TEAM_IDS
                else service.add(
                    "venue", season_id, {"name": f"{name} Venue", "board_capacity": 1}
                )
            )
            service.add(
                "team",
                season_id,
                {
                    "division_id": division["id"],
                    "name": name,
                    "position": team_index,
                    "venue_id": venue["id"],
                },
            )

    generated = service.generate(season_id, seed=13579)
    assert generated["success"]
    moved = service.move_fixture(
        generated["fixtures"][0]["id"], date(2030, 1, 2), reason="Ground closed", actor="secretary"
    )

    before_fixtures = service._stored_fixtures(season_id)
    before_validation = service.validate(season_id)
    before_season = service.get_season(season_id)

    # Simulate a process restart: brand-new repository and service objects over the same file.
    restarted_repository = SQLiteRepository(f"sqlite:///{db_path}")
    restarted_repository.migrate()
    restarted_service = SeasonService(restarted_repository)

    after_season = restarted_service.get_season(season_id)
    after_fixtures = restarted_service._stored_fixtures(season_id)
    after_validation = restarted_service.validate(season_id)

    assert after_season["generation_seed"] == before_season["generation_seed"] == 13579
    assert len(after_season["divisions"]) == 4
    assert len(after_season["calendar_events"]) == 2
    assert len(after_season["venues"]) == len(before_season["venues"])

    assert {f.id for f in after_fixtures} == {f.id for f in before_fixtures}
    restarted_moved = next(f for f in after_fixtures if f.id == moved["id"])
    assert restarted_moved.scheduled_date == date(2030, 1, 2)
    assert restarted_moved.locked and restarted_moved.manual
    assert len(restarted_moved.rescheduling_history) == 1
    assert restarted_moved.rescheduling_history[0].reason == "Ground closed"

    assert after_validation == before_validation


# ---------------------------------------------------------------------------
# TEST GROUP 9 - CSV contract
# ---------------------------------------------------------------------------


def test_realistic_season_csv_exports_match_the_canonical_contract(app_client) -> None:
    client, _ = app_client
    season = build_realistic_season_via_client(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 45678})

    full_text = client.get(f"/seasons/{season['season_id']}/fixtures.csv").text
    full_rows = list(csv.DictReader(StringIO(full_text)))
    assert list(full_rows[0].keys()) == [
        "fixture_id",
        "season_id",
        "division_id",
        "division",
        "week",
        "date",
        "home_team_id",
        "home_team",
        "away_team_id",
        "away_team",
    ]
    expected_total = sum(count * (count - 1) for count in DIVISION_TEAM_COUNTS)
    assert len(full_rows) == expected_total
    assert {row["division_id"] for row in full_rows} == {d["id"] for d in season["divisions"]}

    keys = [
        (row["division_id"], int(row["week"]), row["date"], row["fixture_id"]) for row in full_rows
    ]
    assert keys == sorted(keys)

    for division_index, division in enumerate(season["divisions"]):
        response = client.get(
            f"/seasons/{season['season_id']}/divisions/{division['id']}/fixtures.csv"
        )
        assert response.status_code == 200
        rows = list(csv.DictReader(StringIO(response.text)))
        count = DIVISION_TEAM_COUNTS[division_index]
        assert len(rows) == count * (count - 1)
        assert {row["division_id"] for row in rows} == {division["id"]}


def test_postponed_fixture_exports_its_current_date_not_original(app_client) -> None:
    client, _ = app_client
    season = build_realistic_season_via_client(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 56789})
    target = _fixtures(client, season["season_id"])[0]
    client.post(f"/fixtures/{target['id']}/move", json={"new_date": "2030-06-05"})

    text = client.get(f"/seasons/{season['season_id']}/fixtures.csv").text
    rows = {row["fixture_id"]: row for row in csv.DictReader(StringIO(text))}
    assert rows[target["id"]]["date"] == "2030-06-05"
    assert rows[target["id"]]["date"] != target["scheduled_date"]


# ---------------------------------------------------------------------------
# TEST GROUP 11 - stable team numbering survives display reordering
#
# `position` is the team's freely-editable display order; `number` (added in
# migration 3) is the separate, immutable identity a generated fixture like
# "2v1" or the poster's compact grid actually means by "2". The team-update
# endpoint's allow-list deliberately excludes `number`, so this is enforced by
# the API surface itself, not just by convention - these tests confirm that
# end to end: generate, reorder for display, and check nothing that depends on
# team identity moved.
#
# Note: `PATCH /teams/{id}` currently requires the full `TeamInput` payload
# (division_id, name, position, venue_id) even though `SeasonService.update`
# only applies an allow-listed subset - a pre-existing inconsistency in the
# team/division/venue/event update routes, unrelated to this fix, so these
# tests send the full payload rather than widen scope to fix it (see
# docs/Phase10B-Implementation-Notes.md).
# ---------------------------------------------------------------------------


def test_reordering_the_displayed_team_list_does_not_change_team_numbers(app_client) -> None:
    client, _ = app_client
    season = build_realistic_season_via_client(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 67890})

    division_id = season["divisions"][0]["id"]
    season_before = client.get(f"/seasons/{season['season_id']}").json()
    division_before = next(d for d in season_before["divisions"] if d["id"] == division_id)
    numbers_before = {team["id"]: team["number"] for team in division_before["teams"]}
    positions_before = {team["id"]: team["position"] for team in division_before["teams"]}
    fixtures_before = _fixtures(client, season["season_id"])

    # A genuine "reorder the displayed team list" action: swap two teams' display
    # positions (e.g. an admin re-sorting the setup screen), touching only `position`.
    team_a, team_b = division_before["teams"][0], division_before["teams"][1]

    def set_position(team: dict, new_position: int):
        return client.patch(
            f"/teams/{team['id']}",
            json={
                "division_id": team["division_id"],
                "name": team["name"],
                "position": new_position,
                "venue_id": team["venue_id"],
            },
        )

    # `UNIQUE(division_id, position)` means a direct swap collides mid-flight, so free up
    # team_a's slot via a temporary out-of-range position first, exactly as a real reorder
    # UI would need to.
    resp_temp = set_position(team_a, 9999)
    resp_b = set_position(team_b, team_a["position"])
    resp_a = set_position(team_a, team_b["position"])
    assert resp_temp.status_code == 200
    assert resp_b.status_code == 200
    assert resp_a.status_code == 200

    season_after = client.get(f"/seasons/{season['season_id']}").json()
    division_after = next(d for d in season_after["divisions"] if d["id"] == division_id)
    numbers_after = {team["id"]: team["number"] for team in division_after["teams"]}
    positions_after = {team["id"]: team["position"] for team in division_after["teams"]}

    # The reorder genuinely happened...
    assert positions_after[team_a["id"]] == team_b["position"]
    assert positions_after[team_b["id"]] == team_a["position"]
    assert positions_after != positions_before
    # ...but every team's stable number is completely untouched by it.
    assert numbers_after == numbers_before

    # Fixtures already generated reference teams by ID, never by a live-computed
    # number, so they are byte-for-byte identical after a pure display reorder.
    fixtures_after = _fixtures(client, season["season_id"])
    assert fixtures_after == fixtures_before

    # The poster's compact grid derives its numbers the same way this test does
    # (team.number, looked up by ID) - confirm the mapping used for that grid is
    # unaffected, i.e. fixture "home_team_id" still resolves to the same number
    # it would have before the reorder (scoped to the reordered division; `numbers_*`
    # only covers its teams).
    reordered_division_fixtures = [f for f in fixtures_after if f["division_id"] == division_id]
    assert reordered_division_fixtures, "the reordered division should still have fixtures"
    for fixture in reordered_division_fixtures:
        assert numbers_after[fixture["home_team_id"]] == numbers_before[fixture["home_team_id"]]
        assert numbers_after[fixture["away_team_id"]] == numbers_before[fixture["away_team_id"]]

    # CSV export never included a numeric team column and remains unaffected either way.
    csv_before = client.get(f"/seasons/{season['season_id']}/fixtures.csv").text
    resp_temp2 = set_position(team_a, 9998)
    resp_d = set_position(team_b, team_b["position"])
    resp_c = set_position(team_a, team_a["position"])
    assert resp_temp2.status_code == 200
    assert resp_d.status_code == 200
    assert resp_c.status_code == 200
    csv_after = client.get(f"/seasons/{season['season_id']}/fixtures.csv").text
    assert csv_after == csv_before


def test_team_number_is_not_an_updatable_field(app_client) -> None:
    """`TeamInput` (used for both create and update) has no `number` field at all, so a
    client attempting to set one has it silently dropped before it ever reaches the
    allow-listed `SeasonService.update` - the same field simply isn't part of the
    request schema, the same as `id` would be."""
    client, _ = app_client
    season = build_realistic_season_via_client(client)
    team = client.get(f"/seasons/{season['season_id']}").json()["divisions"][0]["teams"][0]

    response = client.patch(
        f"/teams/{team['id']}",
        json={
            "division_id": team["division_id"],
            "name": team["name"],
            "position": team["position"],
            "venue_id": team["venue_id"],
            "number": 999,
        },
    )
    assert response.status_code == 200
    assert response.json()["number"] == team["number"]
    assert response.json()["number"] != 999


# ---------------------------------------------------------------------------
# Migration safety
# ---------------------------------------------------------------------------


def test_migrate_is_idempotent_on_a_clean_database(tmp_path) -> None:
    db_path = tmp_path / "clean.db"
    repository = SQLiteRepository(f"sqlite:///{db_path}")
    repository.migrate()
    repository.migrate()  # must not raise or duplicate schema objects
    with repository.connection() as conn:
        versions = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}
        table_names = {
            row["name"]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
    expected_tables = {
        "seasons",
        "divisions",
        "venues",
        "teams",
        "calendar_events",
        "fixtures",
        "fixture_reschedules",
    }
    assert versions == {1, 2, 3}
    assert expected_tables <= table_names


def test_migrate_upgrades_an_existing_phase1_database_without_losing_data(tmp_path) -> None:
    """Simulate a database created before the version-2 (reschedule history) migration
    existed, with real season data already in it, and confirm migrate() brings it up to
    date in place without touching the pre-existing rows."""
    db_path = tmp_path / "legacy.db"
    repository = SQLiteRepository(f"sqlite:///{db_path}")
    repository.migrate()
    service = SeasonService(repository)
    season = service.create_season("Legacy League", "Legacy Season", date(2026, 9, 2))

    # Roll the database back to look like a version-1-only deployment.
    connection = sqlite3.connect(db_path)
    connection.execute("DELETE FROM schema_migrations WHERE version = 2")
    connection.execute("DROP TABLE fixture_reschedules")
    connection.commit()
    connection.close()

    reopened_repository = SQLiteRepository(f"sqlite:///{db_path}")
    reopened_repository.migrate()

    with reopened_repository.connection() as conn:
        versions = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}
        table_names = {
            row["name"]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        preserved = conn.execute(
            "SELECT * FROM seasons WHERE id = ?", (season["id"],)
        ).fetchone()
    assert versions == {1, 2, 3}
    assert "fixture_reschedules" in table_names
    assert preserved is not None
    assert preserved["name"] == "Legacy Season"
