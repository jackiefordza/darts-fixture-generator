# Phase 10B — Implementation Notes

Resolves the three findings from `docs/Phase10A-Legacy-Compatibility-Audit.md`:
a missing per-team schedule view, unstable poster/CSV team numbering under
display reordering, and unlabelled Bye weeks in the poster's compact fixture
grid. The core pairing/generation algorithm, validator, calendar semantics,
venue-capacity model, manual rescheduling, and CSV format are all untouched.

## 1. Team View

**What**: a new page (`frontend/src/features/team-view/TeamViewPage.tsx`),
routed at `/seasons/:seasonId/team-view` and added to the main navigation,
alongside Schedule/Validation/Poster Editor.

**Why**: the old fixture creator had a dedicated Team View tab (pick a team,
see its full personal season). The current app's Schedule page only filters
by division/week/date — there was no way to see one team's whole season
without scanning a division's full fixture list by eye.

**How it gets its data**: it calls the exact same `getSchedule(seasonId)`
used by the Schedule page — one fetch, no new backend endpoint, no second
copy of the schedule stored anywhere. The team's fixtures are derived by
filtering that same array client-side (`home_team_id === id || away_team_id
=== id`), and Bye weeks are derived with the existing `computeByeTeams`
utility (already used by `ScheduleTable`), not a new implementation. A manual
move or a regeneration is reflected the moment the fixtures are refetched —
identical to how the Schedule page already behaves, since it's the same
fetch and the same refetch callback.

Each row shows week, current date, opponent, Home/Away, and — when
`original_scheduled_date` differs from `scheduled_date` — an amber
"Postponed - was `<original date>`" badge. Clicking a fixture row opens the
existing `FixtureDetailModal` (unchanged, reused verbatim), which gives full
rescheduling history and the move/postpone action directly from Team View.

**Tests**: `frontend/src/features/team-view/TeamViewPage.test.tsx` (6 tests)
covers: default team's fixtures render correctly; switching teams changes
the list; an odd-sized division's Bye week renders as an explicit row;
a postponed fixture is clearly labelled; clicking a row opens the fixture
detail modal; and `getSchedule` is called exactly once (no duplicate
dataset).

## 2. Stable team numbering

**The problem** (from the audit): the poster's compact fixture grid and
division roster list computed a team's displayed number as `1 + its index`
in `division.teams`, which is ordered by the freely-editable `position`
field. Reordering `position` — a legitimate display action, already exposed
as an editable field on `PATCH /teams/{id}` — would silently change what
number an *already-generated* fixture like "2v1" appeared to mean, with no
regeneration involved.

**Why not just stop reordering, or reuse `team.id`?** Reordering for display
is a real, sanctioned action (the team-update endpoint already allows
changing `position` independently of anything else), so it can't just be
disallowed. `team.id` is already the stable identity fixtures reference
internally, but it's a UUID — useless as the small integer a real poster
needs to show. The smallest correct fix is therefore a second, *immutable*
integer, decoupled from the display-order field.

**The change**: a new `number` column on `teams`
(`backend/app/persistence/sqlite.py`, migration version 3), set once at
creation to the team's initial `position`
(`backend/app/services/seasons.py::add`) and then permanently excluded from
the team-update allow-list (`SeasonService.update`'s `"team"` entry —
`{"name", "position", "venue_id"}`, deliberately with no `"number"`). This
isn't just a convention: since `TeamInput` (the same Pydantic model used for
both create and update) has no `number` field at all, a client can't even
submit one — it's silently absent from the request, the same as trying to
set `id`. `position` remains fully editable for display purposes and no
longer has any bearing on what a fixture means.

The domain layer used by the scheduler/validator
(`backend/app/domain/models.py::Team`) was **not** given a `number` field —
pairing and generation already operate purely on `team.id`, which was never
the problem, so nothing there needed to change. This keeps the fix entirely
in the persistence/API layer, matching the audit's instruction not to touch
the core algorithm.

On the frontend, `Team.number` was added to `frontend/src/api/types.ts`, and
both places that used to compute `1 + index` now read the backend's
`team.number` instead:
`frontend/src/features/poster/fixtureGridData.ts` (the compact grid's
`homeNumber`/`awayNumber`) and `frontend/src/features/poster/
PosterElementView.tsx` + `panels/DivisionPanel.tsx` (the division roster
list's "N." prefix and its edit-panel counterpart, which would otherwise
have shown a different number than the rendered poster). No numbering logic
was duplicated — both simply look up the same backend-supplied field.

CSV export (`backend/app/exporting/csv_exporter.py`) was never affected: the
canonical Generator CSV has no numeric team column at all, only names, so it
was never at risk from this and needed no change.

**A pre-existing, unrelated finding, not fixed here**: `PATCH /teams/{id}`
(and `/divisions/{id}`, `/venues/{id}`, `/events/{id}`) currently require the
*full* `TeamInput`/etc. payload even for a one-field change, because the same
Pydantic model is used for create and update without the
all-Optional-fields treatment `SeasonInput` already gets for its own PATCH
endpoint. A genuinely partial `PATCH /teams/{id}` (e.g. `{"name": "X"}`)
returns 422 today. This affects the existing team-rename UI in both
`TeamsPanel.tsx` and the poster's `DivisionPanel.tsx` (both already send
partial payloads and would 422 against a real backend). It predates this
phase, is not one of the three audit findings, and touches
division/venue/event updates too, not just teams — fixing it was left out
as out of scope rather than widening this change. The stable-numbering
regression tests below send full payloads to work around it, which is what
the current API actually requires.

**Tests**: `backend/tests/test_realistic_season_integration.py` — two new
tests. `test_reordering_the_displayed_team_list_does_not_change_team_numbers`
generates a season, records every team's `number`, reorders two teams'
`position` (via a temporary out-of-range value to satisfy the
`UNIQUE(division_id, position)` constraint mid-swap, exactly as a real
reorder UI would need to), and confirms: the reorder genuinely happened,
every `number` is unchanged, the generated fixtures are byte-for-byte
identical, the poster-grid number mapping for those fixtures is unchanged,
and the CSV export is unchanged. `test_team_number_is_not_an_updatable_field`
confirms a client-supplied `number` in an update request is silently
ignored. Frontend: `fixtureGridData.test.ts` gained a dedicated reorder-
stability test (teams re-sorted in the array but `number` fields intact —
grid output unchanged) alongside updating the existing assertions to the
now-stable-number-driven values.

## 3. Bye labelling in the poster fixture grid

**What**: `buildFixtureGrid` (`frontend/src/features/poster/
fixtureGridData.ts`) now returns a discriminated union per cell entry —
`GridFixtureCell` (`{ type: 'fixture', id, homeNumber, awayNumber }`, as
before) or the new `GridByeCell` (`{ type: 'bye', id, teamNumber }`). For an
odd-sized division only, if a week's own fixtures don't cover every team in
that division, the missing team gets a synthetic `GridByeCell` appended to
that week's cell — never a new `Fixture`, never persisted, never exported.
`PosterElementView.tsx`'s fixture-grid renderer shows it as "`N` BYE" in a
slightly muted, italic style (`.poster-grid-bye` in `styles.css`) alongside
the normal "`A`v`B`" lines.

**Guard against affecting even-sized divisions**: the bye check is gated on
`division.teams.length % 2 === 1` before it ever runs — for any even-sized
division (including all four of the real 2026/27 season's 8-team divisions)
the code path that could add a bye cell is never entered, regardless of how
many fixtures a given week's cell happens to contain. Verified two ways:
a dedicated test with a 4-team division and an incomplete week (only one of
two matches present) confirms no bye is added; and the real, currently-
running 2026/27 season's poster was re-exported and its fixture grid
region is pixel-for-pixel the same as before this change (still plain
"`A`v`B`" lines, 14 columns, no bye markers).

**Verified with a real odd-sized division**: built a scratch season (not
the real one) via the API — 4 divisions, one with 7 teams (odd) and three
8-team fillers, each team on its own dedicated venue — generated its
schedule, and exported its poster. Division 1's grid correctly shows an
italic "`N` BYE" line in every week, rotating through all 7 teams across
the 14 weeks in the same pattern the schedule page's existing `Team — Bye`
row would show for the same team/week. Divisions 2-4 (8 teams) show no
bye markers. The CSV export for the same scratch season contains no "BYE"
text anywhere — byes remain a simple absence of a row, matching the old
tool's actual data model and requiring no CSV change.

**Tests**: `fixtureGridData.test.ts` gained
`"adds an explicit Bye cell for the team an odd-sized division's own
fixtures show sat out"` and `"never adds a Bye cell for an even-sized
division"`, plus the existing test-shape updates needed for the new
discriminated union (`type: 'fixture'` added to prior `toEqual` assertions).

## Tests performed (full run)

- Backend: `pytest` — 83 passed (81 existing + 2 new). `ruff check .` —
  clean.
- Frontend: `vitest run` — 108 passed (99 existing + 1 reorder-stability +
  6 Team View + 2 Bye). `eslint .` — clean. `npm run build` — succeeds.
- Targeted, real-browser verification (Playwright against the real,
  running 2026/27 season and a scratch odd-division season): Team View
  renders real data correctly for multiple teams; the real season's one
  manually-postponed fixture shows its "Postponed - was ..." badge
  correctly in Team View; clicking a Team View row opens the real
  `FixtureDetailModal`; the real season's poster fixture grid is
  unaffected by the Bye change; a genuine 7-team division's poster grid
  shows correct, rotating Bye markers; that scratch season's CSV export
  has no Bye-related content. No console errors beyond the pre-existing
  harmless favicon 404 in any of these checks.
- Backend migration safety: `test_migrate_is_idempotent_on_a_clean_database`
  and `test_migrate_upgrades_an_existing_phase1_database_without_losing_data`
  updated to expect migration version 3 alongside 1 and 2 (a real, intended
  new migration, not a weakened assertion) and re-verified passing.

## Remaining limitations

- The pre-existing partial-PATCH limitation on `/teams/{id}` (and other
  entity update routes) described above is unresolved — it predates this
  phase and affects more than team numbering, so fixing it was left out
  as a separate, unrelated concern.
- Team View has no CSV/print export of its own; it's a read/navigate view
  (with fixture-detail actions available via the reused modal), matching
  what was actually requested — a per-team export path was flagged only as
  an open question in the audit, not a requirement here.
- No UI currently exists to change a team's `position` (drag-reorder,
  sort buttons, etc.) — the audit's concern was about the *data model*
  being safe if and when such a UI is added, which is now the case; there
  was no request in this phase to build that UI.
