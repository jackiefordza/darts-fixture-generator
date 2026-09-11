"""Small SQLite repository with versioned schema initialisation."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path


class SQLiteRepository:
    """Database implementation; domain objects are assembled by application services."""

    def __init__(self, database_url: str) -> None:
        self.path = self._path(database_url)

    @staticmethod
    def _path(database_url: str) -> str:
        if database_url == "sqlite:///:memory:":
            return ":memory:"
        if not database_url.startswith("sqlite:///"):
            raise ValueError("Only sqlite:/// database URLs are supported")
        path = database_url.removeprefix("sqlite:///")
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        return path

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def migrate(self) -> None:
        """Apply schema version 1. Future migrations append versions to this method."""
        with self.connection() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)"
            )
            if conn.execute("SELECT 1 FROM schema_migrations WHERE version = 1").fetchone():
                return
            conn.executescript(
                """
                CREATE TABLE seasons (
                  id TEXT PRIMARY KEY, league_name TEXT NOT NULL, name TEXT NOT NULL,
                  first_fixture_date TEXT NOT NULL, cadence_days INTEGER NOT NULL DEFAULT 7,
                  generation_seed INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE divisions (
                  id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
                  name TEXT NOT NULL, position INTEGER NOT NULL, UNIQUE(season_id, position)
                );
                CREATE TABLE venues (
                  id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
                  name TEXT NOT NULL, board_capacity INTEGER NOT NULL CHECK(board_capacity > 0)
                );
                CREATE TABLE teams (
                  id TEXT PRIMARY KEY, division_id TEXT NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
                  name TEXT NOT NULL, position INTEGER NOT NULL, venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
                  UNIQUE(division_id, position)
                );
                CREATE TABLE calendar_events (
                  id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
                  name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT, event_type TEXT NOT NULL,
                  blocks_initial_generation INTEGER NOT NULL, appears_on_poster INTEGER NOT NULL
                );
                CREATE TABLE fixtures (
                  id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
                  division_id TEXT NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
                  week_number INTEGER NOT NULL, scheduled_date TEXT NOT NULL,
                  home_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
                  away_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
                  playing_venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
                  original_scheduled_date TEXT, locked INTEGER NOT NULL DEFAULT 0,
                  manual INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'scheduled'
                );
                CREATE INDEX fixtures_season_filter ON fixtures(season_id, division_id, week_number, scheduled_date);
                INSERT INTO schema_migrations(version) VALUES (1);
                """
            )

    @staticmethod
    def now() -> str:
        return datetime.now(UTC).isoformat()
