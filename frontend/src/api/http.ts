import type { ValidationIssue } from './types'

/**
 * Every request goes through the Vite dev-server proxy at /api (see vite.config.ts),
 * which forwards to the FastAPI backend. This avoids needing CORS configuration on
 * the backend for local development.
 */
const API_BASE = '/api'

export class ApiError extends Error {
  status: number
  issues: ValidationIssue[]
  suggestedDates: string[]

  constructor(
    status: number,
    message: string,
    issues: ValidationIssue[] = [],
    suggestedDates: string[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.issues = issues
    this.suggestedDates = suggestedDates
  }
}

interface ErrorDetail {
  message?: string
  issues?: ValidationIssue[]
  suggested_dates?: string[]
}

async function parseErrorBody(response: Response): Promise<ApiError> {
  let detail: string | ErrorDetail | undefined
  try {
    const body = (await response.json()) as { detail?: string | ErrorDetail }
    detail = body.detail
  } catch {
    // Response body wasn't JSON (or was empty) - fall through to a generic message.
  }

  if (typeof detail === 'string') {
    return new ApiError(response.status, detail)
  }
  if (detail && typeof detail === 'object') {
    return new ApiError(
      response.status,
      detail.message ?? `Request failed with status ${response.status}`,
      detail.issues ?? [],
      detail.suggested_dates ?? [],
    )
  }
  return new ApiError(response.status, `Request failed with status ${response.status}`)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    throw await parseErrorBody(response)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' })
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function apiDelete(path: string): Promise<void> {
  await request<void>(path, { method: 'DELETE' })
}

/** Downloads a CSV export and saves it via the browser, reusing the same error handling. */
export async function apiDownload(path: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) {
    throw await parseErrorBody(response)
  }
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^"]+)"?/.exec(disposition)
  const filename = match?.[1] ?? fallbackFilename

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
