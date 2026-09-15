import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { RootRedirect } from './routes/RootRedirect'
import { NotFoundPage } from './routes/NotFoundPage'
import { SeasonsHomePage } from './features/seasons/SeasonsHomePage'
import { SeasonLayout } from './components/layout/SeasonLayout'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { SetupPage } from './features/setup/SetupPage'
import { CalendarPage } from './features/calendar/CalendarPage'
import { SchedulePage } from './features/schedule/SchedulePage'
import { ValidationPage } from './features/validation/ValidationPage'
import { PosterEditorPage } from './features/poster/PosterEditorPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/seasons" element={<SeasonsHomePage />} />
        <Route path="/seasons/:seasonId" element={<SeasonLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="validation" element={<ValidationPage />} />
          <Route path="poster" element={<PosterEditorPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
