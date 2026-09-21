#!/usr/bin/env python3
"""Export the complete-league CSV and one CSV per division for a season.

Usage:
    SEASON_ID=<uuid> python3 export_csvs.py [output_dir]

Requires the backend to be running and reachable at BASE_URL (default
http://localhost:8000). Uses the app's existing CSV export endpoints
(GET /seasons/{id}/fixtures.csv and
GET /seasons/{id}/divisions/{id}/fixtures.csv) verbatim -- no new
endpoints, no direct database access.
"""
import json
import os
import sys
import urllib.request

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url) as resp:
        return resp.read()


def main() -> None:
    season_id = os.environ.get("SEASON_ID")
    if not season_id:
        sys.exit("SEASON_ID environment variable is required")
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)

    season = json.loads(fetch(f"{BASE_URL}/seasons/{season_id}"))

    complete_path = os.path.join(out_dir, "complete-league.csv")
    with open(complete_path, "wb") as f:
        f.write(fetch(f"{BASE_URL}/seasons/{season_id}/fixtures.csv"))
    print(f"Wrote {complete_path}")

    for division in season["divisions"]:
        name = division["name"].replace(" ", "-")
        dest = os.path.join(out_dir, f"{name}.csv")
        url = f"{BASE_URL}/seasons/{season_id}/divisions/{division['id']}/fixtures.csv"
        with open(dest, "wb") as f:
            f.write(fetch(url))
        print(f"Wrote {dest}")


if __name__ == "__main__":
    main()
