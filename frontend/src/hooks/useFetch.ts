import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/http'

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

interface FetchState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Fetches data on mount and whenever `deps` change, guarding against setting state
 * from a stale in-flight request (e.g. the season switching mid-request).
 */
export function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[]): FetchState<T> & { refetch: () => void } {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: true, error: null })
  const requestId = useRef(0)

  const load = useCallback(() => {
    const id = ++requestId.current
    setState((previous) => ({ data: previous.data, loading: true, error: null }))
    fetcher().then(
      (data) => {
        if (id === requestId.current) setState({ data, loading: false, error: null })
      },
      (error: unknown) => {
        if (id === requestId.current) setState({ data: null, loading: false, error: messageFor(error) })
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    load()
  }, [load])

  return { ...state, refetch: load }
}
