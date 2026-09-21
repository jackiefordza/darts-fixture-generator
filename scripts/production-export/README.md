# Production export scripts

Small, standalone tooling scripts used to produce publication-ready fixture
exports for a season: the complete-league CSV, one CSV per division, and the
A3 poster as PDF/PNG. They wrap the app's existing export paths as-is (the
CSV endpoints and the poster editor's own "Export PDF"/"Export PNG" buttons)
and add nothing new to the app itself.

Both scripts require the app's backend and frontend dev servers to already
be running.

## CSV exports

```bash
SEASON_ID=<season-uuid> python3 scripts/production-export/export_csvs.py <output_dir>
```

Optional: `BASE_URL` (default `http://localhost:8000`). Uses
`GET /seasons/{id}/fixtures.csv` and
`GET /seasons/{id}/divisions/{id}/fixtures.csv` verbatim.

## Poster PDF/PNG export

```bash
cd frontend
SEASON_ID=<season-uuid> node ../scripts/production-export/export_poster.js <output_dir>
```

Optional: `FRONTEND_URL` (default `http://localhost:5173`),
`PLAYWRIGHT_CHROMIUM_PATH` (to point at a pre-installed Chromium binary).
Run from a directory where `require('playwright')` resolves (e.g.
`frontend/`, which already declares it as a devDependency), or set
`NODE_PATH` to its `node_modules`.

The script drives a real browser against the running poster editor and
downloads the same files a user clicking "Export PDF"/"Export PNG" would
get -- there is no backend endpoint for this, since the poster is rendered
and exported entirely client-side.
