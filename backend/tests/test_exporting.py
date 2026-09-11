"""Tests for the canonical Generator CSV exporter and its HTTP export routes."""

from __future__ import annotations

import csv
import sqlite3
from datetime import date
from io import StringIO

import pytest
from fastapi.testclient import TestClient

from app.exporting import CANONICAL_COLUMNS, CanonicalCsvExporter
from app.main import create_app

DIVISION_TEAM_COUNTS = (4, 5, 6, 7)


def _row(
    fixture_id: str,
    division_id: str,
    division: str,
    week: int,
    iso_date: str,
    home_id: str,
    home: str,
    away_id: str,
    away: str,
    season_id: str = "s1",
) -> dict:
    return {
        "fixture_id": fixture_id,
        "season_id": season_id,
        "division_id": division_id,
        "division": division,
        "week": week,
        "date": iso_date,
        "home_team_id": home_id,
        "home_team": home,
        "away_team_id": away_id,
        "away_team": away,
    }


# ---------------------------------------------------------------------------
# CanonicalCsvExporter unit tests
# ---------------------------------------------------------------------------


def test_canonical_columns_are_exact_and_ordered() -> None:
    assert CANONICAL_COLUMNS == (
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
    )


def test_export_header_matches_canonical_columns() -> None:
    csv_text = CanonicalCsvExporter().export([])
    assert csv_text.splitlines()[0] == ",".join(CANONICAL_COLUMNS)


def test_export_orders_rows_by_division_week_date_fixture_id() -> None:
    rows = [
        _row("f2", "d2", "Division 2", 1, "2026-09-02", "t1", "A", "t2", "B"),
        _row("f1b", "d1", "Division 1", 2, "2026-09-02", "t1", "A", "t2", "B"),
        _row("f1a", "d1", "Division 1", 1, "2026-09-09", "t1", "A", "t2", "B"),
        _row("f1c", "d1", "Division 1", 1, "2026-09-02", "t3", "C", "t4", "D"),
    ]
    csv_text = CanonicalCsvExporter().export(rows)
    ids = [line.split(",")[0] for line in csv_text.splitlines()[1:]]
    assert ids == ["f1c", "f1a", "f1b", "f2"]


def test_export_quotes_commas_and_preserves_utf8() -> None:
    rows = [
        _row(
            "f1",
            "d1",
            "Division 1",
            1,
            "2026-09-02",
            "t1",
            "Smith, Jones & Co",
            "t2",
            "Café Örebro FC",
        )
    ]
    csv_text = CanonicalCsvExporter().export(rows)
    parsed = list(csv.reader(StringIO(csv_text)))
    assert parsed[0] == list(CANONICAL_COLUMNS)
    assert parsed[1][CANONICAL_COLUMNS.index("home_team")] == "Smith, Jones & Co"
    assert parsed[1][CANONICAL_COLUMNS.index("away_team")] == "Café Örebro FC"


# ---------------------------------------------------------------------------
# API-level export tests
# ---------------------------------------------------------------------------


@pytest.fixture
def app_client(tmp_path):
    db_path = tmp_path / "fixtures.db"
    app = create_app(f"sqlite:///{db_path}")
    return TestClient(app), db_path


def build_full_season(client: TestClient, team_names=None) -> dict:
    """Create a valid four-division season (shared Burnaby-Arms capacity included)."""
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
    return {"season_id": season_id, "divisions": divisions}


def _delete_fixture(db_path, fixture_id: str) -> None:
    connection = sqlite3.connect(db_path)
    connection.execute("DELETE FROM fixtures WHERE id = ?", (fixture_id,))
    connection.commit()
    connection.close()


def test_full_season_export_contains_all_divisions_and_headers(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    generated = client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 7})
    assert generated.json()["success"]

    export = client.get(f"/seasons/{season['season_id']}/fixtures.csv")
    assert export.status_code == 200
    assert export.headers["content-type"] == "text/csv; charset=utf-8"
    assert (
        f'filename="season-{season["season_id"]}-fixtures.csv"'
        in export.headers["content-disposition"]
    )

    rows = list(csv.DictReader(StringIO(export.text)))
    assert list(rows[0].keys()) == list(CANONICAL_COLUMNS)
    assert {row["division_id"] for row in rows} == {d["id"] for d in season["divisions"]}
    expected_total = sum(count * (count - 1) for count in DIVISION_TEAM_COUNTS)
    assert len(rows) == expected_total


@pytest.mark.parametrize("division_index", [0, 1, 2, 3])
def test_division_export_filters_to_one_division(app_client, division_index: int) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 11})
    division = season["divisions"][division_index]

    response = client.get(
        f"/seasons/{season['season_id']}/divisions/{division['id']}/fixtures.csv"
    )
    assert response.status_code == 200
    rows = list(csv.DictReader(StringIO(response.text)))
    assert rows
    assert {row["division_id"] for row in rows} == {division["id"]}
    count = DIVISION_TEAM_COUNTS[division_index]
    assert len(rows) == count * (count - 1)


def test_division_export_is_subset_of_complete_export(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 5})
    full_rows = list(
        csv.DictReader(StringIO(client.get(f"/seasons/{season['season_id']}/fixtures.csv").text))
    )
    division = season["divisions"][2]  # Division 3
    division_rows = list(
        csv.DictReader(
            StringIO(
                client.get(
                    f"/seasons/{season['season_id']}/divisions/{division['id']}/fixtures.csv"
                ).text
            )
        )
    )

    full_ids = {row["fixture_id"] for row in full_rows}
    division_ids = {row["fixture_id"] for row in division_rows}
    assert division_ids <= full_ids
    assert division_ids == {
        row["fixture_id"] for row in full_rows if row["division_id"] == division["id"]
    }


def test_export_is_deterministic_and_correctly_ordered(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 3})
    first = client.get(f"/seasons/{season['season_id']}/fixtures.csv").text
    second = client.get(f"/seasons/{season['season_id']}/fixtures.csv").text
    assert first == second

    rows = list(csv.DictReader(StringIO(first)))
    keys = [(row["division_id"], int(row["week"]), row["date"], row["fixture_id"]) for row in rows]
    assert keys == sorted(keys)


def test_export_preserves_comma_and_non_ascii_team_names(app_client) -> None:
    client, _ = app_client

    def naming(division_index: int, team_index: int) -> str:
        if division_index == 1 and team_index == 0:
            return "Smith, Jones & Co"
        if division_index == 1 and team_index == 1:
            return "Café Örebro FC"
        return f"T{division_index}-{team_index}"

    season = build_full_season(client, team_names=naming)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 9})
    text = client.get(f"/seasons/{season['season_id']}/fixtures.csv").text
    rows = list(csv.DictReader(StringIO(text)))
    names = {row["home_team"] for row in rows} | {row["away_team"] for row in rows}
    assert "Smith, Jones & Co" in names
    assert "Café Örebro FC" in names


def test_export_dates_are_iso_formatted(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 13})
    rows = list(
        csv.DictReader(StringIO(client.get(f"/seasons/{season['season_id']}/fixtures.csv").text))
    )
    assert rows
    for row in rows:
        assert date.fromisoformat(row["date"]).isoformat() == row["date"]


def test_export_missing_season_returns_404(app_client) -> None:
    client, _ = app_client
    response = client.get("/seasons/does-not-exist/fixtures.csv")
    assert response.status_code == 404


def test_export_missing_division_returns_404(app_client) -> None:
    client, _ = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 21})
    response = client.get(
        f"/seasons/{season['season_id']}/divisions/does-not-exist/fixtures.csv"
    )
    assert response.status_code == 404


def test_invalid_schedule_blocks_full_export(app_client) -> None:
    client, db_path = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 31})
    rows = list(
        csv.DictReader(StringIO(client.get(f"/seasons/{season['season_id']}/fixtures.csv").text))
    )
    _delete_fixture(db_path, rows[0]["fixture_id"])

    response = client.get(f"/seasons/{season['season_id']}/fixtures.csv")
    assert response.status_code == 409
    body = response.json()["detail"]
    assert body["issues"]
    assert any(
        issue["code"] in {"fixture_completeness", "first_half_coverage"}
        for issue in body["issues"]
    )


def test_division_export_validates_complete_schedule_first(app_client) -> None:
    """Corrupting Division 1 must still block a Division 3 export request."""
    client, db_path = app_client
    season = build_full_season(client)
    client.post(f"/seasons/{season['season_id']}/generate", params={"seed": 41})
    division_1_id = season["divisions"][0]["id"]
    division_3 = season["divisions"][2]
    rows = list(
        csv.DictReader(StringIO(client.get(f"/seasons/{season['season_id']}/fixtures.csv").text))
    )
    victim = next(row for row in rows if row["division_id"] == division_1_id)
    _delete_fixture(db_path, victim["fixture_id"])

    response = client.get(
        f"/seasons/{season['season_id']}/divisions/{division_3['id']}/fixtures.csv"
    )
    assert response.status_code == 409


def test_health_endpoint_ok(app_client) -> None:
    client, _ = app_client
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
