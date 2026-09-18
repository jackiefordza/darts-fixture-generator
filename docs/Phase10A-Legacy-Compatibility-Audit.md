# Phase 10A — Legacy vs Current Fixture Engine Compatibility Audit

**Status: read-only audit. No production code, tests, or schema were modified in this phase.**

**Update (Phase 10B):** all three findings below have since been resolved. See
`docs/Phase10B-Implementation-Notes.md` for the implementation. In summary:
Team View was added (Section 8/14/16); team numbering was made stable via a
new immutable `number` column decoupled from the freely-editable `position`
field (Section 10/18); and the poster's compact fixture grid now labels Bye
weeks explicitly for odd-sized divisions (Section 4/14/18). The mixed-
division-size rough edge (Section 8) was intentionally left as documented,
per Phase 10B's scope.

**Source of the old creator**: the full HTML/CSS/JS source of the previously-used fixture creator, as pasted into this session (the same source already used earlier in this session's poster-rebuild phase and recovered from that turn — no new attachment file was found on disk for this task, so this audit works from that identical, already-fully-read copy). It is treated as executable specification, not a visual reference: every claim about "old behaviour" below is a direct reading of `generateSchedule()`, `assignNumbersGlobally()`, the static `matrix`, `getTeamData()`, and the poster-population code in that file, cross-checked by actually running that file in a real browser earlier in this session.

**Current implementation audited**: `claude/keen-ptolemy-04l3e9` branch, specifically `backend/app/scheduling/pairing.py`, `backend/app/scheduling/generator.py`, `backend/app/validation/validator.py`, `backend/app/domain/models.py`, `backend/app/services/seasons.py`, `backend/app/persistence/sqlite.py`, `backend/app/exporting/csv_exporter.py`, and the frontend's `utils/schedule.ts`, `features/schedule/*`, `features/poster/fixtureGridData.ts`, `features/poster/competitionsMerge.ts`.

---

## 1. Executive summary

**Yes — the new fixture engine preserves every important real-world invariant of the old fixture creator** (round-robin correctness, 7/7 home/away balance, second-half mirroring, bye fairness, calendar-slot semantics for blocked dates, the real Burnaby Arms 2-board/3-team constraint), while deliberately generalising or replacing the mechanisms that produced them. Concretely verified with a fixed seed (`20261014`, the real season's own recorded generation seed) against the old creator's actual 8-team Division 1 roster and the old creator's own known first-week matrix (`2v1, 3v8, 4v7, 5v6`).

Two things are **not** preserved and are not obviously covered by an equivalent current feature:

- **No per-team "my fixtures" view or export.** The old creator's dedicated Team View tab (pick a team, see its full personal chronological schedule with home/away, venue, and an explicit "BYE WEEK" line, with competitions optionally interleaved) has no current equivalent — the schedule page filters by division/week/date only, and CSV export is whole-season or per-division only, never per-team (Section 8, Section 14).
- **Poster fixture grid never labels a bye.** For an odd-sized division, the compact grid simply shows one fewer match that week with no "Bye" marker, whereas the *schedule page* (not the poster) does show an explicit "Team — Bye" row. This one is minor and only matters for odd team counts, which the real season doesn't currently use (Section 6, Section 14).

One further point is architecturally sound today but has a latent rough edge that only appears if divisions are ever unequal in size (never true for the real season, which is 4×8): a smaller division simply has zero fixtures in the calendar weeks the largest division needs beyond the smaller one's own round count (Section 8).

Nothing found here requires undoing any of the new system's deliberate improvements (seeded randomised generation, arbitrary division sizes, real venue-board-capacity modelling, persistence, manual rescheduling with audit history, regeneration of only unlocked fixtures, independent validation, canonical CSV). No fixes are implemented in this phase, per the brief.

---

## 2. Old creator behaviour (read directly from source)

- **`matrix`** (lines ~560–568 of the recovered source): a hardcoded 7-round pairing template for 8 numbered slots, e.g. round 1 = `{h:2,a:1}, {h:3,a:8}, {h:4,a:7}, {h:5,a:6}`. This is the *only* pairing structure the tool ever produces — it is not derived algorithmically, it is typed-in data.
- **`assignNumbersGlobally()`**: a backtracking CSP solver that decides which real team occupies which of the 8 numbered slots per division, so that no two teams sharing a venue are ever both "home" (per the fixed matrix's home/away pattern) on more than `venueBoardCounts[venue]` of the matrix's own home-weeks. Unfilled slots (fewer than 8 real teams) get a literal `{name:"Bye"}` placeholder team baked into the roster.
- **`generateSchedule()`**: walks the calendar day-by-day from `start-date` at a fixed weekly cadence. On each date it checks `specialDatesList` for a match; if found, it pushes a `{type:'special', ...}` entry into `combinedSchedule` **without incrementing `weekCount`**, and moves to the next date. Otherwise it pushes a `{type:'league', roundNum: weekCount+1, ...}` entry built from `matrix[weekCount % 7]`, with home/away reversed once `weekCount >= 7` (second half), and increments `weekCount`. It stops once `weekCount` reaches 14 (always 14, since the tool is hardcoded to 8 teams / 7-team-plus-bye per division).
- **`getTeamData()`**: reads the setup form's team/venue text inputs in DOM order into a `[{name, venue}]` array per division — this raw order is the *input* to `assignNumbersGlobally`, not the output numbering itself.
- **Team numbering**: entirely internal to `assignNumbersGlobally`; a team's number is whatever the CSP solver assigns to satisfy venue constraints, and is recomputed from scratch every time "Generate Full Schedule" is pressed. It is never exposed as something the user sets directly.
- **Detailed team schedules**: `renderTeamView()` — pick a team from a dropdown, get every week from `globalCombinedSchedule` where that team appears, printing opponent, `(Home - venue)`/`(Away)`, and an explicit "BYE WEEK" line when the opponent resolves to the `"Bye"` placeholder team. A checkbox includes/excludes special dates.
- **Poster fixture matrix**: purely schematic — 7 physical columns, each showing two stacked week/date labels (week *N* and week *N+7*) over one shared header, and a 4-row body that reprints the **same** `matrix[week][row]` numbers for every column regardless of which real week it is (it works only because the pairing structure never varies week-to-week in shape, only in who holds which number).
- **Competitions/special dates**: `specialDatesList` entries are simple `{name, date}` pairs with no date range; a multi-week break (e.g. Christmas) needs one entry per blocked week.
- **Venue constraints**: `venueBoardCounts` is a per-venue integer used *only* inside `assignNumbersGlobally`'s CSP search — there is no independent, general-purpose capacity check separate from the number-assignment mechanism.
- **No persistence, no manual rescheduling, no regeneration, no locking, no independent post-hoc validation** — the tool holds one in-memory schedule at a time (auto-saved wholesale to `localStorage`), and any change means pressing "Generate Full Schedule" again from scratch.

---

## 3. Current implementation behaviour (read directly from source)

- **`RoundRobinPairingGenerator.generate()`** (`pairing.py`): the standard *circle method*, but the team-id list is `random.shuffle`d before rotating, so the pairing structure itself is randomised per seed rather than fixed. Odd team counts get a `__BYE__` placeholder appended before shuffling, so the bye rotates through the circle method exactly like a real "team."
- **`FixtureGenerator.generate()`** (`generator.py`): computes `total_weeks = max(rounds_per_half(d) for d in divisions) * 2`, builds the calendar via `_league_dates()` (skip any date where a `blocks_initial_generation` calendar event applies, otherwise assign the next week number — advancing the actual date either way), builds one pairing per division, derives home/away via a **capacity-aware backtracking search** (`_orient`) against real `Venue.board_capacity`, and validates the *entire* resulting schedule with an independent `ScheduleValidator` before accepting it — retrying with a fresh shuffle up to `max_pairing_attempts` (default 100) if no capacity-feasible orientation exists.
- **Home/away is a genuine free choice per pair**, decided only by venue-capacity feasibility (with random tie-breaking), not by any notion of "the first-listed team is home." The *invariant* preserved is that each pair's second leg always reverses whichever team was home in the first leg (`_fixtures_from_orientations`), guaranteeing the same 7/7-style balance old had — but *which* specific team is designated home in the first leg of a given pairing is not derived from team order at all.
- **`regenerate_unlocked()`**: re-derives home/away only for pairs where *both* legs are still unlocked, using the existing locked/manual fixtures' actual venue usage as the starting capacity state, then re-validates the complete combined schedule. A full `generate()` is explicitly blocked (`ConflictError`) once any fixture is locked or manual (`SeasonService.generate`), forcing the safer `regenerate` path.
- **`ScheduleValidator`**: fully independent of the generator's internal state — re-derives everything from the stored `Fixture` rows: unique IDs, no self-fixtures, teams belong to their division, home team's venue matches, no date blocked (unless the fixture is itself `manual`), no team double-booked on a date, no venue over capacity, every non-manual fixture in a week shares that week's date, every pair meets exactly once per half and exactly mirrored in the second half, and team appearance counts match the required bye behaviour.
- **Team "numbering"**: `Team` (`domain/models.py`) has no number field at all — schema-level, teams have only `id`, `name`, `home_venue_id`. The **only** number that exists anywhere is `teams.position`, a plain user-orderable integer column (`persistence/sqlite.py`) used purely to sort a division's team list for display; it plays no role whatsoever in `pairing.py` or `generator.py`, which operate solely on team `id`.
- **Poster fixture grid numbering** (`fixtureGridData.ts`): `homeNumber`/`awayNumber` are computed at *render time* as `1 + index in division.teams` — i.e., directly from the *current* `position` ordering, not fixed at generation time.
- **Manual rescheduling** (`SeasonService.move_fixture`): moves one fixture, sets `locked=1, manual=1`, appends a `RescheduleEntry` (`from_date`, `to_date`, `reason`, `actor`, `changed_at`) to `fixture_reschedules`, and validates the *complete* resulting schedule before persisting anything; a conflicting move is rejected with up to 3 suggested conflict-free alternative dates (`_suggest_dates`), found by scanning outward day-by-day and validating each candidate with the same real validator.
- **Bye surfacing in the UI**: `utils/schedule.ts`'s `computeByeTeams()` derives, purely from the fixtures already returned by the API, which teams in a division have no fixture in a week the division otherwise played, and `ScheduleTable.tsx` renders an explicit `"TeamName — Bye"` row for it.
- **CSV export** (`csv_exporter.py`): fixed canonical columns (`fixture_id, season_id, division_id, division, week, date, home_team_id, home_team, away_team_id, away_team`), deterministic sort by `(division_id, week, date, fixture_id)`. No team-number column exists at all.

---

## 4. Behaviour-by-behaviour comparison

| Behaviour | Old creator | Current system | Classification |
|---|---|---|---|
| Round-robin correctness | Fixed matrix, hand-verified valid once | Circle method, algorithmically guaranteed + independently re-validated every time | **A** (invariant preserved, mechanism improved) |
| Total rounds for 8 teams | Always 14 (7/half) | 14 (7/half) — confirmed by direct test | **A** |
| Specific week-by-week pairing order | `2v1, 3v8, 4v7, 5v6, …` (fixed) | Different every seed; same seed as the real season's own recorded seed produces `4v8, 5v2, 3v1, 6v7, …` | **B** (see Section 6) |
| Second-half mirror (home/away reversed) | Yes, by construction of the matrix | Yes — confirmed programmatically for all 28 pairs | **A** |
| Home/away 7/7 balance (8 teams) | Yes | Yes — confirmed programmatically for all 8 teams | **A** |
| Odd-division bye, fairness | Fixed empty numbered slot; fairness emerges because the number rotates through the matrix | Explicit `__BYE__` slot inside the circle method; every team gets exactly 1 bye/half — confirmed programmatically for a 7-team division | **A** (invariant preserved, mechanism replaced) |
| Calendar-slot semantics for a blocked date | Date is skipped for league play, still advances the calendar, no week number wasted on it | Identical — confirmed by direct test (blocked date never appears as any fixture's date; the next available date becomes the next week) | **A** |
| Multi-week breaks | One manual date entry per blocked week | One `CalendarEvent` with `start_date`/`end_date` covers a whole range | **B** |
| Coupling of "blocks generation" and "shows on poster" | Always coupled (any special date does both) | Decoupled: `blocks_initial_generation` and `appears_on_poster` are independent flags | **B** |
| Division sizes | Fixed at 8 (UI field literally read-only) | Arbitrary per division; validated only for `>= 2` teams | **B** |
| Unequal division sizes sharing one calendar | Not possible (all divisions always 8) | Possible; a smaller division has zero fixtures in the calendar weeks only a larger division needs — confirmed by direct test (6-team + 8-team divisions) | **New capability, rough edge** — see Section 8 |
| Team numbering | Assigned internally by the scheduler to satisfy venue constraints; opaque, not user-editable, recomputed every generation | Plain user-orderable `position` column; has no effect on generation at all; poster grid recomputes the number shown from *current* position | **B**, with a real open question — see Section 10 |
| Venue/board capacity | Only as a side-effect of the number-assignment CSP, tied to the fixed matrix's home-week pattern | A first-class, independently validated constraint (`board_capacity`), decoupled from any numbering scheme | **B** |
| Manual postponement | Not supported (no persistence) | Full support with locking, audit history, and revalidation of the complete schedule | **B** |
| Regeneration preserving manual moves | Not supported | Full support (`regenerate_unlocked`) | **B** |
| Independent post-hoc validation | Not supported (correctness is only as good as the fixed matrix + solver, never re-checked) | Full independent `ScheduleValidator`, run after every generate/regenerate/move | **B** |
| Canonical CSV export | Not supported | Full support, deterministic, Chalkie-independent | **B** |
| Per-team personal schedule view/export | Yes — dedicated Team View tab | **No equivalent** — schedule page filters by division/week/date only; CSV is whole-season or per-division only | **C** |
| Explicit bye indicator on the poster's compact grid | Effectively yes (cross-reference the roster's "N. Bye" entry) | No — a bye week's cell just has one fewer match, no marker | **C** (minor) |

---

## 5. Concrete 8-team comparison

Old creator's actual Division 1 preset roster was used verbatim (numbers = old's own numbering):

1. Con Club A · 2. Marston Club A · 3. Burnaby A · 4. Oakley Doaklies · 5. Meltis · 6. The Bluebell · 7. Legends Bar · 8. Fox & Hounds

Run directly against the current `FixtureGenerator` (pure in-memory, no DB) with the real season's own recorded seed, **20261014**, and each team on its own dedicated venue (so venue capacity was never a constraint, isolating the pairing-structure comparison):

**Current generator, week 1–7 (first half):**
```
Week 1: 4v8, 5v2, 3v1, 6v7
Week 2: 6v1, 2v3, 5v8, 7v4
Week 3: 4v6, 3v8, 1v2, 7v5
Week 4: 4v1, 5v6, 3v7, 8v2
Week 5: 3v6, 2v7, 1v8, 5v4
Week 6: 5v1, 3v4, 2v6, 7v8
Week 7: 8v6, 2v4, 7v1, 3v5
```

**Old creator's known matrix, week 1–7:**
```
Week 1: 2v1, 3v8, 4v7, 5v6
Week 2: 3v4, 2v5, 8v6, 1v7
Week 3: 6v2, 7v8, 4v1, 5v3
Week 4: 7v5, 8v4, 2v3, 1v6
Week 5: 3v1, 5v8, 6v7, 4v2
Week 6: 5v4, 8v1, 2v7, 3v6
Week 7: 7v3, 8v2, 6v4, 1v5
```

**Results:**
- Total weeks: **14 vs 14** (match).
- Fixtures in the division: **56 vs 56** across a full 4-division season (14 per division either way).
- First half covers all 28 unique pairs exactly once: **True** (both, verified programmatically for the current system).
- Second half is the exact home/away mirror of the first half for every pair: **True** (verified programmatically).
- Home/away balance: every team **7 home / 7 away** (verified programmatically).
- **Pairing order/content**: completely different, week for week, from week 1 onward. No overlap in which specific teams meet in which specific week, nor in which team is designated home.

**Classification of the ordering difference (per the audit's own A/B/C/D taxonomy, Section 2 of the brief):** **B — a consequence of the old fixed-matrix implementation.** Nothing in the old creator's rules text, UI, or code ties any specific pairing (e.g. "team 2 must meet team 1 in week 1") to a real league requirement — the matrix is simply one arbitrary valid round-robin schedule that a developer typed in once. The current system's shuffled circle method produces a *different* arbitrary-but-equally-valid round-robin schedule per seed, satisfying every invariant that actually matters (each pair once per half, mirrored, balanced). There is no evidence supporting classification A (genuine requirement), and while it could theoretically be offered as an optional "legacy" compatibility mode (classification D), nothing in the source suggests any real-world need for that specific ordering to be reproduced.

---

## 6. Calendar comparison

Directly tested: a `CalendarEvent` with `blocks_initial_generation=True` placed on what would otherwise be week 3's date (`2026-10-28`, 14 days after a `2026-10-14` start).

```
Blocked date was: 2026-10-28 (would have been week 3 unblocked)
Actual week -> date mapping (first 5 weeks):
  week 1: 2026-10-14
  week 2: 2026-10-21
  week 3: 2026-11-04
  week 4: 2026-11-11
  week 5: 2026-11-18
Blocked date 2026-10-28 appears as ANY fixture's scheduled_date: False
Week 3's actual date is the NEXT cadence slot after the block (2026-11-04): True
```

This is **exactly** the old creator's semantic: the blocked date consumes its own calendar slot (the loop still advances the current date by one cadence step for it) without ever being assigned a league week number, and the next real league week simply lands on the following cadence date. **Classification A — preserved precisely,** and now backed by an independent validator (`blocked_date` issue code) that would catch any future regression of this specific behaviour, which the old creator had no equivalent safeguard for.

The one behavioural improvement here (already covered in Section 4) is decoupling "blocks generation" from "shows on the poster," and supporting a date *range* in one `CalendarEvent` instead of one entry per blocked week.

---

## 7. Division-size comparison

- **8 teams**: full match to old on every invariant (Section 5).
- **7 teams (odd)**: directly tested using the old creator's own actual Division 2 preset (a genuine historical 7-team division: The Anchor, Fox and Duck, North End Club A, Con Club B, The Swan, North End B, Con Club C).
  - 14 rounds used (7/half), 42 total fixtures (`2×(7−1)×7/2 = 42`) — matches the expected double round-robin-with-bye size.
  - Every team gets **exactly 2 byes** (1 per half) — confirmed for all 7 teams by direct enumeration.
  - The bye rotates through a different team every week, exactly matching the old creator's effective fairness (whichever real team was matched against the old matrix's un-filled number that week).
- **Other odd/even counts**: the generator and validator are written generically (`_rounds_per_half`, `_check_division` in the validator) with no special-casing beyond even/odd parity, so there's no reason to expect a different outcome for, say, 6 or 10 teams; this wasn't separately fixture-tested beyond the mixed-size case in Section 8, since the mechanism is identical regardless of count.

**Classification: A** for the fairness/correctness invariant itself (preserved, differently implemented); **B** for the capability to use division sizes other than 8 at all (the old creator's "Teams per Division" field is hard-locked to 8 in its own UI).

---

## 8. Multi-division comparison

- **Four divisions, equal size (the real season's actual shape — 4×8)**: all four divisions share the same `total_weeks` (14) and the same calendar dates per week; the real, currently-stored 2026/27 schedule was re-queried live and shows all 224 fixtures (`4 × 56`) correctly aligned to a shared 14-week calendar with zero drift between divisions.
- **Four divisions, unequal size (8-team + 6-team + two 8-team fillers, directly tested)**:
  ```
  8-team division weeks used: 1-14
  6-team division weeks used: 1-10 (5 rounds/half x2)
  6-team division has NO fixtures at all in weeks 11-14
  ```
  This is not a crash or a validator failure (the run succeeded and validated cleanly) — it's a real, previously-impossible-in-old scenario: a smaller division simply has *nothing* scheduled in the calendar weeks that only the largest division needs. Old could never hit this because every division was always exactly 8 teams.

**Classification: B for the capability itself (unequal sizes are a deliberate generalisation old never had, so there's nothing to "regress" against); the empty-weeks behaviour is a legitimate open product question** (Section 18) rather than a bug — nothing currently surfaces to a user *why* a division has nothing that week, and this doesn't affect the real season today (uniform 4×8).

---

## 9. Home/away comparison

- **7/7 balance for 8 teams**: preserved, confirmed both in the isolated 8-team test (Section 5) and structurally guaranteed by `_fixtures_from_orientations` always reversing home/away between a pair's two legs.
- **"Is the first-listed team home?"**: **not preserved, and never was a real requirement.** In the old matrix, whichever number appears first in each `{h, a}` object is arbitrarily "home" — an artifact of how the object was typed, not a rule (nothing in the old rules text specifies who "should" be home in a given pairing). The current system decides home/away purely by venue-capacity feasibility via backtracking search, with random tie-breaking when either choice is feasible. The important invariant — balance and correct mirroring — is what's preserved, not the specific assignment mechanism.
- **Second-half reversal**: preserved and independently validated (`second_half_mirror` issue code), confirmed programmatically for every pair in the 8-team test.

**Classification: A** for the balance/mirror invariants; **B** for the specific home/away *decision* mechanism (properly generalised into a real constraint-satisfaction problem instead of an artifact of matrix authorship).

---

## 10. Team numbering comparison

- **Old**: numbers are assigned by the generation algorithm itself, purely to satisfy venue-sharing constraints under the fixed matrix; opaque to the user; recomputed from scratch on every "Generate Full Schedule."
- **Current**: numbers (`position`) are a simple, user-controlled, persisted ordering field with **zero influence on fixture generation** — the scheduler operates exclusively on team `id`.
- **Stability**: this is the one place worth flagging carefully. Because `fixtureGridData.ts` computes the poster's compact-grid `homeNumber`/`awayNumber` from the team's *current* `position` at render time (not something fixed at generation time and stored per-fixture), **reordering teams in Setup after a schedule has already been generated (or printed/distributed) will silently change what number the poster grid shows for those same, unchanged fixtures.** A league admin who reorders teams alphabetically for tidiness after generating — without regenerating anything — would get a poster whose compact grid no longer matches an already-printed/shared version.
- **CSV export**: not affected at all — the canonical CSV never includes a numeric team column, only `home_team`/`away_team` names, so this specific risk doesn't reach the CSV.
- **Division team list on the poster**: also not at risk in the sense of showing wrong information (it always reflects current names/order faithfully) — the risk is purely about *consistency of the same number across two exports taken at different times*.

**Classification: B** for the architecture (correctly separating presentation ordering from generation logic is a real improvement over old's opaque internal numbering) **with an open product question flagged in Section 18** about whether the compact grid's numbering should be pinned at generation time instead of recomputed live.

---

## 11. Team-specific schedules comparison

- **Data completeness**: every fixture a team is involved in is retrievable via the schedule API (division/week/date filters, or unfiltered); no fixture is duplicated (unique fixture IDs, independently validated) or omitted; postponed fixtures correctly show their *current* `scheduled_date` while retaining `original_scheduled_date` and full `rescheduling_history` (confirmed live against the real season's one manually-postponed fixture, week 1, `2026-10-14 → 2026-10-15`).
- **Bye visibility**: `computeByeTeams()` + `ScheduleTable`'s `"TeamName — Bye"` row is a real, working equivalent to old's "BYE WEEK" line, derived correctly and only from weeks the team's own division actually played (confirmed by reading `utils/schedule.ts` — it keys strictly off `(week, division)` pairs that have fixtures, so it can't misfire in the mixed-division-size scenario from Section 8).
- **What's genuinely missing**: a *dedicated, single-team view* — pick one team, see just their fixtures end to end in one place, the way old's Team View tab did. Today a real user must either read the whole division's fixture list and mentally filter for their team's name, or use a division-scoped CSV and do the same in a spreadsheet. There is no "select team" control anywhere in the current frontend (`ScheduleFilters.tsx` offers only division/week/date), and no per-team CSV/export path (`ExportButtons.tsx` offers only whole-season or per-division).

**Classification: A** for data completeness/correctness; **C** for the missing dedicated per-team view (see Section 16).

---

## 12. Venue constraint comparison

Directly re-verified against the real, currently-stored 2026/27 season (not a synthetic test): all 3 Burnaby Arms teams (A/B/C) share one venue with `board_capacity = 2`.

```
total fixtures: 224
Burnaby Arms capacity violations (>2 home fixtures same date): 0
```

Sampled home-fixture counts per date at that venue never exceed 2. This confirms the real, historically-important constraint holds in the live application today, not just in a unit test.

As required by the brief: this is confirmed to be **an additional constraint layered on top of the round-robin/calendar model, not a replacement for it** — `_orient()` (Section 3) runs entirely *after* the pairing structure and calendar dates are already fixed; it only ever chooses *which* team is home for a pairing that's already going to happen in a given week, never which teams play or when. Old achieved a similar practical effect only as a side-effect of its number-assignment CSP being tied to the fixed matrix's home-week pattern — current does it as an explicit, general, independently-validated `board_capacity` check with no tie to any numbering scheme at all.

**Classification: B** (a real generalisation; nothing about it altered the underlying round-robin/calendar behaviour it sits on top of).

---

## 13. Manual rescheduling / regeneration comparison

The old creator has no equivalent functionality at all (no persistence beyond a single `localStorage` blob of the whole form). Everything in this section is a deliberate, additive capability, not a regression of anything:

- **Move a fixture** (`move_fixture`): re-validates the *complete* resulting schedule (not just the moved fixture) before persisting anything; on conflict, returns up to 3 real, independently-validated alternative dates rather than silently succeeding or failing with no help.
- **Locking**: a moved fixture becomes `locked=1, manual=1` automatically; a full regenerate (`generate`) is explicitly blocked once any locked/manual fixture exists (`ConflictError` in `SeasonService.generate`), forcing the safer `regenerate_unlocked` path.
- **Regeneration of unlocked fixtures**: re-derives home/away only for pairs where *both* legs are still unlocked, seeded with the fixed fixtures' actual venue usage so shared capacity stays respected; re-validates the complete combined schedule before accepting it.
- **Audit history**: every move appends a `RescheduleEntry` (`from_date`, `to_date`, `reason`, `actor`, `changed_at`) to a dedicated `fixture_reschedules` table, queryable per fixture.
- **Live re-verification**: the real season currently has exactly 1 locked/manual fixture (from earlier acceptance testing), and its `original_scheduled_date` (`2026-10-14`) and current `scheduled_date` (`2026-10-15`) are both correctly retained, matching the documented behaviour precisely.

**Classification: B**, unambiguously — there is nothing to compare against in the old creator, and nothing here should be softened to imitate a tool that never had these safeguards.

---

## 14. Poster/content comparison

(Building on the detailed old-vs-current poster comparison already carried out in this session's Phase 10 poster-rebuild and poster-refinement work — summarised here specifically for fixture-engine-adjacent content, not visual styling.)

| Content | Old | Current | Note |
|---|---|---|---|
| League title / season title | Yes | Yes | Match |
| Division names | Yes | Yes | Match |
| Team names | Yes | Yes | Match |
| Team numbers on poster | Yes (baked into the static matrix's numbering) | Yes (`fixtureGridData.ts`, live-computed from `position`) | See Section 10's stability caveat |
| Sponsor/logo handling | One main league sponsor + one sponsor per division, URL or uploaded image, adjustable size/offset | One league logo + one sponsor logo per division, uploaded image, `object-fit: contain` at any aspect ratio (verified this session with photo/wide/square/transparent/missing logos) | Current lacks manual per-logo size/offset sliders old had; otherwise equivalent |
| Fixture matrix | Static/schematic, 7 columns, doesn't reflect real postponements | Fully data-driven, 14 columns (one per actual date), correctly reflects postponed fixtures' current dates | Deliberate improvement — old's matrix would have been *wrong* the moment a real postponement happened, since it always reprints the same generic numbers regardless of week |
| Competitions/special dates | Manual entries, dotted-leader list | `CalendarEvent`s flagged `appears_on_poster`, merged with poster-only entries, dotted-leader list | Match in spirit; current is data-driven from the same calendar used for scheduling instead of a separate list |
| Rules | Free text, always shown | Free text, always shown, content-aware section height (this session's refinement) | Match |
| Detailed/team schedules | Two extra tabs (Detailed View, Team View) exist alongside the poster | No poster equivalent (poster was never meant to carry this — old's *setup app* carried it, not the poster) — but there's also no non-poster equivalent (Section 11) | See Section 11/16 |
| Explicit bye marker on the fixture grid | Effectively yes (cross-reference "N. Bye" in the roster) | No | Category C, minor (Section 4) |

Nothing in the fixture-engine-relevant poster content has been lost that the poster itself is responsible for; the one real gap (per-team schedule) belongs to the *application*, not the poster specifically, and was never a poster feature in the old tool either — it lived in the setup app's own tabs.

---

## 15. Test results

All read-only; nothing modified.

- **Backend**: `pytest` — **81 passed**. `ruff check .` — **clean**.
- **Frontend**: `vitest run` — **99 passed** (19 files). `eslint .` — **clean**.
- **Targeted comparison scripts** (temporary, scratch-only, never touched the repository or database):
  - 8-team old-roster comparison against the real season's own recorded seed (`20261014`) — round counts, pair coverage, mirror correctness, and home/away balance all confirmed programmatically true.
  - 7-team odd-division bye behaviour (old's actual historical Division 2 roster) — round count, fixture count, and exactly-2-byes-per-team all confirmed programmatically true.
  - Blocked-calendar-date semantics — confirmed the blocked date is never assigned to any fixture and the next week lands on the next cadence date.
  - Mixed division sizes (8 + 6 teams) — confirmed the smaller division's schedule correctly stops at its own round count with no fixtures (and no error) in the extra weeks the larger division needs.
  - Live re-verification against the real, currently-running 2026/27 season (read-only `GET` requests only): 224 fixtures total, zero Burnaby Arms venue-capacity violations, exactly one correctly-recorded manual/locked postponement.

---

## 16. Confirmed regressions

- **No dedicated per-team schedule view or export.** Old's Team View tab (pick a team, see every fixture in personal chronological order with home/away/venue and an explicit BYE WEEK line, competitions optionally included) has no current equivalent anywhere in the frontend or CSV export. This is the only finding in this audit that clearly represents *lost, real-world-used functionality* rather than a deliberate architectural trade-off.
  **Resolved in Phase 10B**: added `frontend/src/features/team-view/TeamViewPage.tsx`, reusing the existing schedule fetch, `computeByeTeams`, and `FixtureDetailModal` — no new backend endpoint, no separate dataset. See `docs/Phase10B-Implementation-Notes.md` §1.

Nothing else found rises to the level of "regression" — every other difference is either a preserved invariant (implemented differently) or a deliberate, reasoned improvement.

---

## 17. Deliberate improvements (confirmed, not to be undone)

- Seeded, randomised round-robin generation (vs. a single hardcoded matrix).
- Arbitrary division sizes, including sizes old could never support (anything other than 8).
- Real venue board-capacity modelling as an independent, general constraint (vs. a side-effect of a fixed-matrix numbering trick).
- Persistence (seasons, fixtures, and full audit history survive beyond one browser tab's `localStorage`).
- Manual fixture rescheduling with locking, full audit trail, and conflict-aware alternative-date suggestions.
- Regeneration that surgically preserves locked/manual fixtures instead of requiring a full from-scratch regenerate.
- A fully independent `ScheduleValidator`, re-run after every mutation, checking facts the old tool simply had no mechanism to re-check once generated.
- Canonical, deterministic CSV export decoupled from any specific downstream consumer.
- Decoupling "blocks generation" from "shows on poster" for calendar events, and native date-range support for multi-week breaks.

---

## 18. Open product decisions

1. ~~Should the poster's compact fixture-grid team numbers be pinned at generation time...~~
   **Resolved in Phase 10B**: added an immutable `teams.number` column, set once at creation and excluded from the team-update allow-list, so `position` can be freely reordered for display without ever changing what an existing fixture's number means. See `docs/Phase10B-Implementation-Notes.md` §2.
2. **What should happen, if anything, when divisions have unequal sizes and the calendar's later weeks belong only to the largest division?** Today a smaller division simply has no fixtures in those weeks — correct and non-crashing, but nothing currently explains this to a user looking at, say, "week 13" for a division that stopped at week 10. Only matters if a future season is configured with unequal division sizes; the real 2026/27 season (uniform 4×8) never hits this. (Section 8) **Left open** — out of Phase 10B's scope.
3. ~~Should the poster's compact fixture grid explicitly mark a bye week...~~
   **Resolved in Phase 10B**: odd-sized divisions now show an explicit, rotating "`N` BYE" cell; even-sized divisions (including the real season's) are provably unaffected. See `docs/Phase10B-Implementation-Notes.md` §3.
4. ~~Is a dedicated per-team schedule view/export worth adding...~~
   **Resolved in Phase 10B**: added as a new page (Team View), not a Schedule-page filter; CSV export was not extended with a per-team option (not requested). See `docs/Phase10B-Implementation-Notes.md` §1.

---

## 19. Recommended next implementation steps

None required to reach parity on anything that matters for the real 2026/27 season as currently configured (uniform 4×8 divisions, no odd-sized division, no team reordering planned after generation). If and when work resumes:

1. Treat item 4 above (per-team view) as the only genuine backlog item from this audit — it's real, real-world-used functionality with no current substitute, independent of any architectural trade-off.
2. Decide item 1 (numbering stability) as a product question before it causes a real confusing moment for a league admin — this is cheap to reason about now and expensive to explain after a printed poster goes stale.
3. Leave items 2 and 3 as documented, deliberately-deferred edge cases unless/until a real season actually needs an odd or unequal-sized division.
4. Do not alter the pairing/generation algorithm to imitate the old creator's specific week-by-week ordering — Section 5's evidence shows that ordering was never a real requirement, only an artifact of how the old tool happened to be written.

**No changes were made to any production code, test, or schema in this phase**, per the brief.
