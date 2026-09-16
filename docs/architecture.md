# Fixture Generator Architecture

## Purpose and boundaries

Fixture Generator is a standalone application for creating, reviewing, managing, validating, and exporting a darts-league season for exactly four divisions. A user configures a season, its four divisions and teams, the league fixture calendar and calendar events; the application then produces a complete, validated season schedule across all divisions.

The application has no dependency on Chalkie. Its domain model, generator, validator, persistence, and standard CSV must not use Chalkie identifiers, schemas, services, or import conventions. The generator's standard CSV is the canonical fixture-data contract. A future Chalkie CSV conversion belongs at an isolated adapter boundary (preferably on Chalkie's side), so a change in Chalkie's format never requires a change to the fixture engine.

The poster/editor is an output and presentation layer over validated fixture data. It is not a source of fixture data and must not change a schedule.

## Confirmed season model

Each season contains exactly four divisions, each with its own teams. Divisions can have different team counts. Teams have stable internal IDs; any displayed team number is generated only for compact poster notation and must not be used in fixture logic.

The user supplies the first actual league-match date. A league week is a numbered logical round shared by all four divisions, beginning with Week 1 on that date. Fixture dates are explicit calendar data; Wednesday is the expected normal fixture night, not an inferred rule. There is no season-end-date input: generation continues through eligible dates until all required fixtures are scheduled. The presentation night is a calendar event only and never determines when fixtures must finish.

A break does not consume a league week number. For example, a Christmas break between Week 7 and Week 8 leaves the next match opportunity as Week 8. A smaller division can have fewer real fixtures in a shared league week, but it must remain aligned to that same week; venue pressure must not cause one division to drift to another league round.

```text
League 1 ── * Season 1 ── 4 Division 1 ── * Team
                  │              │
                  │              └── * Fixture ── home Team / away Team
                  │                       ├── Fixture Week
                  │                       └── playing Venue
                  │
                  ├── * Fixture Week
                  ├── * Calendar Event
                  ├── * Generation Run
                  └── rules (separate from fixture data)

Venue 1 ── * Team (time-effective home-venue assignment)
Venue 1 ── * Fixture (playing venue)
Season 1 ── * Poster layout selected from a design-only Poster Template
```

### Core concepts

- **League** is the long-lived competition organisation and the scope for league-wide settings, venues, logo, and seasons.
- **Season** owns its four divisions, calendar, fixture weeks, fixtures, rules reference/content, and generation runs.
- **Division** is the scope for its teams, opponent-pair requirements, display team ordering/numbers, name, and poster sponsor/logo slot.
- **Team** belongs to one division for the initial product. Its home-venue assignment is time-effective, supporting a future venue change without rewriting history.
- **Venue** is a physical playing location with a board capacity: the maximum simultaneous home fixtures it can host on a date. Capacity is counted in fixtures, across all divisions.
- **Fixture Week** records an explicit league-week number and actual fixture date. It represents a shared league round, not an ISO calendar week.
- **Calendar Event** is a named date or date range with an event type, an initial-generation blocking flag, and a poster-visibility flag.
- **Fixture** is the stable match record, retaining its round/week, current scheduled date, original scheduled date, venue, lock state, provenance, and rescheduling history.
- **Generation Run** is an immutable, reproducible record of a generation or regeneration request and its diagnostics/results.
- **Poster Template** contains only reusable design information. It has no season-specific teams, fixtures, dates, or other season data.

## Calendar and events

The calendar is explicit data rather than a calculation such as “every Wednesday.” The user specifies the first league week/date and calendar events. Events support:

- name;
- start date and optional end date;
- event type;
- whether it blocks initial league-fixture generation; and
- whether it appears on the poster.

Initial event types include competitions, tournaments, Team K.O. dates, and breaks; the model is extensible to other future types. Competition, tournament, Team K.O., and break dates block initial league fixture generation. A team being knocked out does not turn an event date into a normal league-fixture date. Such dates may subsequently be used for manually arranged postponements or make-up fixtures, subject to validation. Breaks need not appear on a poster.

Future bank holidays, specific unavailable dates, team availability, venue closures, and venue availability should use this same event/availability abstraction rather than isolated special-case fields.

## Scheduling architecture

Scheduling has two deliberately separate stages:

1. **Pairing generation** creates the division-level double round-robin structure, including home/away legs and Bye slots, but no dates or venues.
2. **Timetable scheduling** assigns the shared league weeks/dates and home venues while considering all four divisions together, calendar availability, locked fixtures, and venue capacity.

The initial fixture format is a double round robin. Every pair of real teams meets exactly once in the first half. The second half mirrors the first half in the same round order with home and away reversed. The first-listed team is the home team.

For an odd number of teams, the pairing stage adds a dummy Bye slot to the round-robin structure. A real team encounters that slot once in each half; it has no opponent in that week, but the Bye remains a game week for the division. If balancing requires multiple Bye positions, the application does so automatically without configuration. Byes are not real fixtures and must not be treated as teams in persisted fixture logic.

Generation randomises the round-robin structure itself, rather than merely shuffling a fixed pattern's resulting fixtures. A stored random seed (or equivalent reproducibility information) allows a selected result to be recreated. With identical immutable inputs, algorithm/solver versions, solver settings, and seed, results must be deterministic.

The scheduler exposes a narrow boundary: an immutable scheduling request and either a proposed schedule with diagnostics or an explicit infeasibility result. Persistence and HTTP concerns remain outside the scheduler. OR-Tools CP-SAT is the anticipated timetable solver, but is not currently an implementation dependency.

## Constraints and diagnostics

Hard constraints are never relaxed:

- Every required real-team pairing occurs exactly once in each half.
- The second half exactly mirrors the first half with home/away reversed and corresponding order.
- A team cannot play itself or more than once on the same date.
- Bye slots are handled correctly.
- Initial generation respects all blocking competition, tournament, Team K.O., and break dates.
- Shared venue board capacity is respected on every date across all four divisions.
- No neutral venue is invented to resolve capacity pressure.
- Locked fixtures retain their committed assignment during regeneration.
- All divisions remain aligned to the same league week/round.

For example, Burnaby Arms has three teams and two boards, so no more than two Burnaby Arms teams may be at home on the same fixture date; the remaining team must be away where necessary. This is a capacity constraint, not a reason to split divisions across rounds.

Soft preferences rank otherwise valid schedules and may be relaxed: reasonable home/away balance, balanced Bye distribution, avoidance of excessive consecutive home/away runs, avoidance of unusually long gaps, and sensible overall distribution. Hard constraints always take precedence. When a valid result trades off preferences, diagnostics should make that clear. When no valid result exists, the generator must return useful, inspectable diagnostics (for example, conflicting locked fixtures, unavailable/blocking dates, or capacity limits), rather than silently producing an invalid schedule.

## Manual changes, postponements, and regeneration

Users can move or adjust fixtures after generation. A manually moved fixture becomes locked. Regeneration keeps locked fixtures untouched and considers only explicitly selected unlocked fixtures; locked fixtures are fixed inputs to the solver.

Manual actions must be validated. A conflicting proposed change must neither be silently accepted nor silently destroy another fixture. The application should flag the conflict and, where practical, suggest an alternative and explain the reason. The resulting whole schedule remains independently validatable.

Fixtures retain their identity across changes. Each records its original scheduled date, current scheduled date, and audit/history entries for later reschedules (including before/after values, actor/time where available, and reason/notes). The originally published poster is not regenerated or resent after a postponement; the live/current fixture view and standard CSV show the current/final date.

## Independent validation

Validation is an independently callable domain service, separate from generation. It accepts generated or manually changed schedules plus the relevant season configuration and returns structured findings with severity, machine-readable code, affected entities/dates, and useful explanation.

It must detect at least missing or duplicate required pairings, invalid half mirroring, self-fixtures, teams playing twice on a date, incorrect Bye handling, blocked dates during initial generation, venue-capacity conflicts, and violations by locked/manual fixtures. It should report soft-preference concerns without treating them as invalid. The scheduler may validate candidate output, but must not be the only route to validation.

## Rules

League rules are intentionally separate from fixture data. Users can import/add rules at any point, edit them later, store them independently, and optionally include them in a poster. The substantive league rules remain to be supplied; no unprovided rule may be embedded in scheduling policy.

## CSV and adapter boundary

The standard Generator CSV is the official, machine-usable contract for the current/final schedule. It is not a presentation format. It includes fixture ID, division, league-week number, current fixture date, home team, away team, and other genuinely necessary machine fields. It must not include poster colours, logos, layouts, or other presentation data.

Exports are designed as:

1. Standard Generator CSV.
2. A separate Chalkie CSV adapter/export, if needed later.

Both consume validated generic fixture data. Exporting does not mutate fixture state or perform scheduling.

## Poster/editor output layer

The later poster editor uses validated schedule data. Its initial direction is an A3 portrait master with all four divisions on one page, compact fixture-grid notation such as `2v1`, division names as the main headings, a freely movable/resizable league-wide logo, and independently movable/resizable division sponsor logos. Displayed team numbers map to each division's displayed team list.

The editor supports editable league name, season title, colours, fonts, background, team display names/order; drag/resize of main sections and logos; preview; snap-to-grid/alignment; undo/redo; saved layouts/templates; and PDF/PNG export. It deliberately excludes per-element locking and must remain a simple editor rather than a full publishing application. A4 and other sizes can later use scaling/reflow of the A3 design rather than cropping it.

**PDF/PNG export** (`frontend/src/features/poster/posterExport.ts`) renders the poster editor's own layout/element components off-screen at true 300 DPI (`html2canvas`) and either downloads that raster directly as a PNG or embeds it, losslessly compressed, into a true 297x420mm PDF page (`jsPDF`) - there is no second, independent poster renderer, and no server-side rendering step. Export always uses the current in-memory poster layout and the season's current (not original) fixture dates; the editor only reaches an export-capable state once the backend validator has confirmed the season's schedule, so an invalid schedule can never be exported. See the doc comment on `renderPosterCanvas` for why an SVG-`<foreignObject>`-based capture library was tried first and rejected (it silently rasterises as blank in this stack), and `docs/backend.md`-style detail is intentionally kept in that module's comments rather than duplicated here.

Multiple templates can be saved and duplicated. A season can select an existing template or a blank/default one. Template duplication creates a modifiable copy without altering its original, and templates contain design data only—not fixtures, teams, dates, or other season-specific content.

## Reproducibility and audit

Each Generation Run captures its ID/timestamps, exact input/configuration snapshot, pairing and scheduling algorithm versions, solver name/version/parameters, random seed, scope of eligible dates/divisions/unlocked fixtures, status, objective/preference diagnostics, and resulting fixture changes. This makes a result reproducible, explainable, and comparable after later software changes.

## Proposed project structure

The current foundation can evolve towards the following shape without implementing these modules now:

```text
backend/
  app/
    api/                 # FastAPI routes, schemas, dependencies
    domain/              # Entities, value objects, domain contracts
    scheduling/          # Pairing, timetabling, constraint policies
    validation/          # Independent validation and diagnostics
    persistence/         # Repository contracts and later implementations
    exporting/           # Standard CSV and isolated external adapters
    poster/              # Validated-schedule presentation read model/templates
    services/            # Application use cases
    main.py
  tests/
    unit/
    integration/

frontend/
  src/
    api/                 # Typed API client boundary
    features/            # Feature-oriented screens/state
    components/          # Shared presentation components
    routes/
    types/
```

The API coordinates application services; it does not contain scheduling or validation rules. Domain and scheduler code should not depend on FastAPI, React, storage, Chalkie, CSV formats, or poster output.

## Technology direction and current scope

The foundation uses Python 3.12, FastAPI, React, TypeScript, Vite, pytest, Ruff, GitHub Actions, and GitHub Codespaces. The fixture engine, UI, poster editor, database, CSV exporter, and Chalkie adapter are explicitly not implemented by this documentation change.

## Remaining decisions

Requirements discovery intentionally leaves only implementation-detail decisions open, including the exact generic CSV field set/order, persistence/database selection, validation/audit actor-retention details, solver scoring weights for the confirmed soft preferences, and detailed rules content once supplied by the league. These must be set without changing the confirmed product and architectural boundaries above.
