import { ApiError } from '../../api/http'

/** Shows an action/form-level failure, including structured validation issues when present. */
export function InlineError({ error }: { error: ApiError | string | null }) {
  if (!error) return null
  const message = typeof error === 'string' ? error : error.message
  const issues = error instanceof ApiError ? error.issues : []

  return (
    <div className="inline-error" role="alert">
      <p>{message}</p>
      {issues.length > 0 && (
        <ul>
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
