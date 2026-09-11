"""Season CRUD and generation orchestration, isolated from HTTP schemas."""

from __future__ import annotations

from dataclasses import asdict
from datetime import date, timedelta
from uuid import uuid4

from app.domain import (
    CalendarEvent,
    CalendarEventType,
    Division,
    Fixture,
    GenerationConfig,
    Season,
    Team,
    ValidationResult,
    Venue,
)
from app.exporting import CanonicalCsvExporter
from app.persistence import SQLiteRepository
from app.scheduling import FixtureGenerator
from app.validation import ScheduleValidator


class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


class ExportValidationError(Exception):
    """Raised when the stored schedule fails independent validation at export time."""

    def __init__(self, validation: ValidationResult) -> None:
        super().__init__("Schedule is not valid for export")
        self.validation = validation


class SeasonService:
    def __init__(self, repository: SQLiteRepository) -> None:
        self.repository = repository
        self.generator = FixtureGenerator()
        self.validator = ScheduleValidator()

    def create_season(
        self, league_name: str, name: str, first_fixture_date: date, cadence_days: int = 7
    ) -> dict:
        if not league_name or not name or cadence_days < 1:
            raise ValueError("League name, season name, and positive cadence are required")
        season_id, now = str(uuid4()), self.repository.now()
        with self.repository.connection() as conn:
            conn.execute(
                "INSERT INTO seasons VALUES (?, ?, ?, ?, ?, NULL, ?, ?)",
                (
                    season_id,
                    league_name,
                    name,
                    first_fixture_date.isoformat(),
                    cadence_days,
                    now,
                    now,
                ),
            )
        return self.get_season(season_id)

    def list_seasons(self) -> list[dict]:
        with self.repository.connection() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM seasons ORDER BY created_at")]

    def get_season(self, season_id: str) -> dict:
        with self.repository.connection() as conn:
            season = conn.execute("SELECT * FROM seasons WHERE id = ?", (season_id,)).fetchone()
            if not season:
                raise NotFoundError("Season not found")
            result = dict(season)
            for table in ("divisions", "venues", "calendar_events"):
                result[table] = [
                    dict(row)
                    for row in conn.execute(
                        f"SELECT * FROM {table} WHERE season_id = ? ORDER BY position"
                        if table == "divisions"
                        else f"SELECT * FROM {table} WHERE season_id = ?",
                        (season_id,),
                    )
                ]
            for division in result["divisions"]:
                division["teams"] = [
                    dict(row)
                    for row in conn.execute(
                        "SELECT * FROM teams WHERE division_id = ? ORDER BY position",
                        (division["id"],),
                    )
                ]
            return result

    def update_season(self, season_id: str, changes: dict) -> dict:
        allowed = {"league_name", "name", "first_fixture_date", "cadence_days"}
        updates = {
            key: value for key, value in changes.items() if key in allowed and value is not None
        }
        if not updates:
            return self.get_season(season_id)
        if "cadence_days" in updates and updates["cadence_days"] < 1:
            raise ValueError("cadence_days must be positive")
        if "first_fixture_date" in updates:
            updates["first_fixture_date"] = updates["first_fixture_date"].isoformat()
        updates["updated_at"] = self.repository.now()
        clause, values = ", ".join(f"{key} = ?" for key in updates), list(updates.values())
        with self.repository.connection() as conn:
            if (
                conn.execute(
                    f"UPDATE seasons SET {clause} WHERE id = ?", (*values, season_id)
                ).rowcount
                == 0
            ):
                raise NotFoundError("Season not found")
        return self.get_season(season_id)

    def add(self, kind: str, season_id: str, values: dict) -> dict:
        self.get_season(season_id)
        entity_id = values.get("id") or str(uuid4())
        with self.repository.connection() as conn:
            if kind == "division":
                conn.execute(
                    "INSERT INTO divisions VALUES (?, ?, ?, ?)",
                    (entity_id, season_id, values["name"], values["position"]),
                )
                return self._row(conn, "divisions", entity_id)
            if kind == "venue":
                conn.execute(
                    "INSERT INTO venues VALUES (?, ?, ?, ?)",
                    (entity_id, season_id, values["name"], values["board_capacity"]),
                )
                return self._row(conn, "venues", entity_id)
            if kind == "event":
                conn.execute(
                    "INSERT INTO calendar_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        entity_id,
                        season_id,
                        values["name"],
                        values["start_date"].isoformat(),
                        values.get("end_date").isoformat() if values.get("end_date") else None,
                        values["event_type"],
                        int(values["blocks_initial_generation"]),
                        int(values["appears_on_poster"]),
                    ),
                )
                return self._row(conn, "calendar_events", entity_id)
            if kind == "team":
                division = conn.execute(
                    "SELECT season_id FROM divisions WHERE id = ?", (values["division_id"],)
                ).fetchone()
                if not division or division["season_id"] != season_id:
                    raise NotFoundError("Division not found in season")
                venue = conn.execute(
                    "SELECT season_id FROM venues WHERE id = ?", (values["venue_id"],)
                ).fetchone()
                if not venue or venue["season_id"] != season_id:
                    raise NotFoundError("Venue not found in season")
                conn.execute(
                    "INSERT INTO teams VALUES (?, ?, ?, ?, ?)",
                    (
                        entity_id,
                        values["division_id"],
                        values["name"],
                        values["position"],
                        values["venue_id"],
                    ),
                )
                return self._row(conn, "teams", entity_id)
        raise ValueError("Unknown entity type")

    def update(self, kind: str, entity_id: str, values: dict) -> dict:
        table = {
            "division": "divisions",
            "venue": "venues",
            "event": "calendar_events",
            "team": "teams",
        }[kind]
        allowed = {
            "division": {"name", "position"},
            "venue": {"name", "board_capacity"},
            "event": {
                "name",
                "start_date",
                "end_date",
                "event_type",
                "blocks_initial_generation",
                "appears_on_poster",
            },
            "team": {"name", "position", "venue_id"},
        }[kind]
        updates = {
            key: value for key, value in values.items() if key in allowed and value is not None
        }
        if "start_date" in updates:
            updates["start_date"] = updates["start_date"].isoformat()
        if "end_date" in updates:
            updates["end_date"] = updates["end_date"].isoformat()
        for key in ("blocks_initial_generation", "appears_on_poster"):
            if key in updates:
                updates[key] = int(updates[key])
        if not updates:
            raise ValueError("No changes supplied")
        clause, parameters = ", ".join(f"{key} = ?" for key in updates), list(updates.values())
        with self.repository.connection() as conn:
            if (
                conn.execute(
                    f"UPDATE {table} SET {clause} WHERE id = ?", (*parameters, entity_id)
                ).rowcount
                == 0
            ):
                raise NotFoundError(f"{kind.title()} not found")
            return self._row(conn, table, entity_id)

    def delete(self, kind: str, entity_id: str) -> None:
        table = {
            "division": "divisions",
            "venue": "venues",
            "event": "calendar_events",
            "team": "teams",
        }[kind]
        with self.repository.connection() as conn:
            try:
                deleted = conn.execute(f"DELETE FROM {table} WHERE id = ?", (entity_id,)).rowcount
            except Exception as error:
                raise ConflictError("Resource is still referenced by teams or fixtures") from error
            if not deleted:
                raise NotFoundError(f"{kind.title()} not found")

    def generate(self, season_id: str, seed: int | None = None) -> dict:
        season = self._domain_season(season_id)
        result = self.generator.generate(
            season, GenerationConfig(seed=seed, fixture_cadence=self._cadence(season_id))
        )
        response = self._result(result)
        if not result.success:
            return response
        with self.repository.connection() as conn:
            locked = conn.execute(
                "SELECT 1 FROM fixtures WHERE season_id = ? AND (locked = 1 OR manual = 1)",
                (season_id,),
            ).fetchone()
            if locked:
                raise ConflictError(
                    "Cannot replace a schedule containing locked or manual fixtures"
                )
            conn.execute("DELETE FROM fixtures WHERE season_id = ?", (season_id,))
            conn.executemany(
                "INSERT INTO fixtures VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        fixture.id,
                        season_id,
                        fixture.division_id,
                        fixture.week_number,
                        fixture.scheduled_date.isoformat(),
                        fixture.home_team_id,
                        fixture.away_team_id,
                        fixture.playing_venue_id,
                        fixture.original_scheduled_date.isoformat()
                        if fixture.original_scheduled_date
                        else None,
                        int(fixture.locked),
                        int(fixture.manual),
                        "scheduled",
                    )
                    for fixture in result.fixtures
                ],
            )
            conn.execute(
                "UPDATE seasons SET generation_seed = ?, updated_at = ? WHERE id = ?",
                (result.seed, self.repository.now(), season_id),
            )
        return response

    def schedule(
        self,
        season_id: str,
        division_id: str | None = None,
        week: int | None = None,
        scheduled_date: date | None = None,
    ) -> list[dict]:
        self.get_season(season_id)
        query, args = "SELECT * FROM fixtures WHERE season_id = ?", [season_id]
        for field, value in (
            ("division_id", division_id),
            ("week_number", week),
            ("scheduled_date", scheduled_date.isoformat() if scheduled_date else None),
        ):
            if value is not None:
                query += f" AND {field} = ?"
                args.append(value)
        query += " ORDER BY week_number, division_id, id"
        with self.repository.connection() as conn:
            return [dict(row) for row in conn.execute(query, args)]

    def validate(self, season_id: str) -> dict:
        season = self._domain_season(season_id)
        validation = self.validator.validate(season, self._stored_fixtures(season_id))
        return {
            "is_valid": validation.is_valid,
            "issues": [asdict(issue) for issue in validation.issues],
        }

    def export_csv(self, season_id: str, division_id: str | None = None) -> str:
        """Export the canonical Generator CSV, always validating the complete schedule first.

        A division-scoped export is a filtered view of an already-validated complete
        schedule: the requested division is never generated or validated in isolation.
        """
        season = self._domain_season(season_id)
        if division_id is not None and division_id not in {
            division.id for division in season.divisions
        }:
            raise NotFoundError("Division not found in season")
        fixtures = self._stored_fixtures(season_id)
        validation = self.validator.validate(season, fixtures)
        if not validation.is_valid:
            raise ExportValidationError(validation)
        if division_id is not None:
            fixtures = [fixture for fixture in fixtures if fixture.division_id == division_id]
        return CanonicalCsvExporter().export(self._export_rows(season, fixtures))

    def _stored_fixtures(self, season_id: str) -> list[Fixture]:
        return [
            Fixture(
                id=row["id"],
                division_id=row["division_id"],
                home_team_id=row["home_team_id"],
                away_team_id=row["away_team_id"],
                week_number=row["week_number"],
                scheduled_date=date.fromisoformat(row["scheduled_date"]),
                playing_venue_id=row["playing_venue_id"],
                original_scheduled_date=date.fromisoformat(row["original_scheduled_date"])
                if row["original_scheduled_date"]
                else None,
                locked=bool(row["locked"]),
                manual=bool(row["manual"]),
            )
            for row in self.schedule(season_id)
        ]

    @staticmethod
    def _export_rows(season: Season, fixtures: list[Fixture]) -> list[dict]:
        division_names = {division.id: division.name for division in season.divisions}
        team_names = {
            team.id: team.name for division in season.divisions for team in division.teams
        }
        return [
            {
                "fixture_id": fixture.id,
                "season_id": season.id,
                "division_id": fixture.division_id,
                "division": division_names[fixture.division_id],
                "week": fixture.week_number,
                "date": fixture.scheduled_date.isoformat(),
                "home_team_id": fixture.home_team_id,
                "home_team": team_names[fixture.home_team_id],
                "away_team_id": fixture.away_team_id,
                "away_team": team_names[fixture.away_team_id],
            }
            for fixture in fixtures
        ]

    def _domain_season(self, season_id: str) -> Season:
        stored = self.get_season(season_id)
        divisions = tuple(
            Division(
                row["id"],
                row["name"],
                tuple(Team(team["id"], team["name"], team["venue_id"]) for team in row["teams"]),
            )
            for row in stored["divisions"]
        )
        venues = tuple(
            Venue(row["id"], row["name"], row["board_capacity"]) for row in stored["venues"]
        )
        events = tuple(
            CalendarEvent(
                row["id"],
                row["name"],
                date.fromisoformat(row["start_date"]),
                CalendarEventType(row["event_type"]),
                bool(row["blocks_initial_generation"]),
                date.fromisoformat(row["end_date"]) if row["end_date"] else None,
                bool(row["appears_on_poster"]),
            )
            for row in stored["calendar_events"]
        )
        return Season(
            season_id,
            stored["name"],
            divisions,
            venues,
            date.fromisoformat(stored["first_fixture_date"]),
            events,
        )

    def _cadence(self, season_id: str) -> timedelta:
        return timedelta(days=self.get_season(season_id)["cadence_days"])

    @staticmethod
    def _row(conn, table: str, entity_id: str) -> dict:
        return dict(conn.execute(f"SELECT * FROM {table} WHERE id = ?", (entity_id,)).fetchone())

    @staticmethod
    def _result(result) -> dict:
        return {
            "success": result.success,
            "seed": result.seed,
            "fixtures": [asdict(fixture) for fixture in result.fixtures],
            "validation": {
                "is_valid": result.validation.is_valid,
                "issues": [asdict(issue) for issue in result.validation.issues],
            },
            "diagnostics": list(result.diagnostics),
            "statistics": asdict(result.statistics) if result.statistics else None,
        }
