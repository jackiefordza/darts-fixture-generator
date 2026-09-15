import { useCallback, useRef, useState } from 'react'
import { ApiError } from '../api/http'

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

interface ActionResult<Args extends unknown[], Result> {
  loading: boolean
  error: ApiError | string | null
  run: (...args: Args) => Promise<Result | undefined>
  reset: () => void
}

/**
 * Wraps an imperative API call (create/update/delete/move/generate/...) with
 * loading + error state, so callers can disable buttons and show failures inline
 * instead of swallowing them.
 */
export function useAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
): ActionResult<Args, Result> {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | string | null>(null)

  // Callers frequently pass a closure over local state (e.g. `() => addVenue(id, { name })`).
  // A ref keeps `run`'s identity stable across renders while always invoking the action from
  // the render that's currently mounted, instead of freezing the closure from the first render.
  const actionRef = useRef(action)
  actionRef.current = action

  const run = useCallback(async (...args: Args) => {
    setLoading(true)
    setError(null)
    try {
      const result = await actionRef.current(...args)
      setLoading(false)
      return result
    } catch (caught) {
      setLoading(false)
      setError(caught instanceof ApiError ? caught : messageFor(caught))
      return undefined
    }
  }, [])

  const reset = useCallback(() => setError(null), [])

  return { loading, error, run, reset }
}
