# Backend development

The backend uses SQLite through `SQLiteRepository`. Set `FIXTURE_GENERATOR_DATABASE_URL` to a `sqlite:///` URL; its default is `sqlite:///fixture_generator.db` in the backend working directory.

Starting the application runs the versioned SQLite schema initialisation automatically. The current migration creates seasons, divisions, venues, teams, calendar events, and fixtures. Keep future schema changes as new migration versions in `app/persistence/sqlite.py` rather than changing existing deployed schema definitions.

```bash
cd backend
python -m pip install -r requirements.lock
FIXTURE_GENERATOR_DATABASE_URL=sqlite:///local.db uvicorn app.main:app --reload
pytest
ruff check .
```

Persistence is kept behind `SQLiteRepository`; `SeasonService` reconstructs domain objects and is the only layer that coordinates persistence with generation and independent validation. The scheduling engine itself remains usable without HTTP or SQLite.

## Canonical Generator CSV

`CanonicalCsvExporter` (`app/exporting/csv_exporter.py`) serialises validated fixture data into the canonical Generator CSV — the official, machine-usable export contract described in `docs/architecture.md`. It is the only supported fixture export format; there is no Chalkie-specific format, and Chalkie is an external consumer that does not define this contract. Any future Chalkie-side conversion is that application's own adapter concern, not this one's.

**Columns, in this exact order:**

1. `fixture_id` — the fixture's stable ID.
2. `season_id` — the owning season's ID.
3. `division_id` — the fixture's division ID.
4. `division` — the division's display name.
5. `week` — the league week number (a shared logical round, not an ISO calendar week).
6. `date` — the fixture's current scheduled date, ISO 8601 (`YYYY-MM-DD`).
7. `home_team_id` — the home team's ID.
8. `home_team` — the home team's display name.
9. `away_team_id` — the away team's ID.
10. `away_team` — the away team's display name.

The file is UTF-8 text with a header row, uses `csv.DictWriter`'s standard quoting/escaping (so team names containing commas, quotes, or non-ASCII characters round-trip correctly), and contains fixture data only — no poster colours, logos, layout, template, or Chalkie-specific fields.

**Row ordering** is deterministic: rows are sorted by `division_id`, then `week`, then `date`, then `fixture_id`, so repeated exports of the same stored schedule are byte-identical.

**Routes** (`app/main.py`), both `GET` and both returning `text/csv; charset=utf-8` with a `Content-Disposition: attachment` filename:

- `GET /seasons/{season_id}/fixtures.csv` — exports the complete season (all divisions).
- `GET /seasons/{season_id}/divisions/{division_id}/fixtures.csv` — exports one division only.

**Validation before export.** Both routes always call `SeasonService.export_csv`, which: loads the complete season, loads the complete stored schedule, and runs `ScheduleValidator` against that complete schedule — never against a stored validity flag, and never against just the requested division. Only if the complete schedule is valid does it then filter fixtures down to the requested division (when one was given) and hand them to the exporter. A division-specific export is therefore a filtered view of an already-validated complete schedule, not an independently generated or validated one. If the complete schedule is invalid, export is blocked (`409`, with a JSON body of `{"message": ..., "issues": [...]}` describing every validation issue) even if the requested single division would look valid in isolation.
