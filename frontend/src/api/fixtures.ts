import { apiDownload, apiGet, apiPost } from './http'
import type {
  Fixture,
  FixtureDetail,
  FixtureMoveInput,
  GenerationResult,
  RawFixture,
  ValidationResult,
} from './types'

function normalizeFixture(fixture: RawFixture): Fixture {
  return {
    ...fixture,
    locked: Boolean(fixture.locked),
    manual: Boolean(fixture.manual),
  }
}

export interface ScheduleFilter {
  division_id?: string
  week?: number
  fixture_date?: string
}

export async function getSchedule(
  seasonId: string,
  filter: ScheduleFilter = {},
): Promise<Fixture[]> {
  const params = new URLSearchParams()
  if (filter.division_id) params.set('division_id', filter.division_id)
  if (filter.week !== undefined) params.set('week', String(filter.week))
  if (filter.fixture_date) params.set('fixture_date', filter.fixture_date)
  const query = params.toString()
  const fixtures = await apiGet<RawFixture[]>(
    `/seasons/${seasonId}/fixtures${query ? `?${query}` : ''}`,
  )
  return fixtures.map(normalizeFixture)
}

export async function getFixture(fixtureId: string): Promise<FixtureDetail> {
  const fixture = await apiGet<RawFixture & { history: FixtureDetail['history'] }>(
    `/fixtures/${fixtureId}`,
  )
  return { ...normalizeFixture(fixture), history: fixture.history }
}

export async function generateSchedule(
  seasonId: string,
  seed?: number,
): Promise<GenerationResult> {
  const query = seed !== undefined ? `?seed=${seed}` : ''
  return apiPost<GenerationResult>(`/seasons/${seasonId}/generate${query}`)
}

export async function regenerateSchedule(
  seasonId: string,
  seed?: number,
): Promise<GenerationResult> {
  const query = seed !== undefined ? `?seed=${seed}` : ''
  return apiPost<GenerationResult>(`/seasons/${seasonId}/regenerate${query}`)
}

export async function validateSeason(seasonId: string): Promise<ValidationResult> {
  return apiPost<ValidationResult>(`/seasons/${seasonId}/validate`)
}

export async function moveFixture(
  fixtureId: string,
  input: FixtureMoveInput,
): Promise<FixtureDetail> {
  const fixture = await apiPost<RawFixture & { history: FixtureDetail['history'] }>(
    `/fixtures/${fixtureId}/move`,
    input,
  )
  return { ...normalizeFixture(fixture), history: fixture.history }
}

export async function downloadSeasonCsv(seasonId: string): Promise<void> {
  return apiDownload(`/seasons/${seasonId}/fixtures.csv`, `season-${seasonId}-fixtures.csv`)
}

export async function downloadDivisionCsv(seasonId: string, divisionId: string): Promise<void> {
  return apiDownload(
    `/seasons/${seasonId}/divisions/${divisionId}/fixtures.csv`,
    `season-${seasonId}-division-${divisionId}-fixtures.csv`,
  )
}
