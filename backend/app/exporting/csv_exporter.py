"""Canonical Generator CSV serialisation, independent of persistence and HTTP."""

from __future__ import annotations

import csv
from collections.abc import Iterable, Mapping
from io import StringIO

CANONICAL_COLUMNS = (
    "fixture_id", "season_id", "division_id", "division", "week", "date",
    "home_team_id", "home_team", "away_team_id", "away_team",
)


class CanonicalCsvExporter:
    """Serialise fixture rows into the canonical, Chalkie-independent Generator CSV."""

    def export(self, rows: Iterable[Mapping[str, object]]) -> str:
        output = StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=CANONICAL_COLUMNS, lineterminator="\n")
        writer.writeheader()
        for row in sorted(rows, key=self._sort_key):
            writer.writerow({column: row[column] for column in CANONICAL_COLUMNS})
        return output.getvalue()

    @staticmethod
    def _sort_key(row: Mapping[str, object]) -> tuple[str, int, str, str]:
        return (
            str(row["division_id"]),
            int(row["week"]),
            str(row["date"]),
            str(row["fixture_id"]),
        )
