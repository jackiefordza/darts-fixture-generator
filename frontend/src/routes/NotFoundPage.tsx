import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="page-center">
      <div className="card">
        <h1>Page not found</h1>
        <p className="muted">The page you're looking for doesn't exist.</p>
        <Link to="/">Back to seasons</Link>
      </div>
    </div>
  )
}
