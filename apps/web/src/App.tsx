// React
import type { ReactElement } from 'react'
// Packages
import { Navigate, Route, Routes } from 'react-router'
// App
import { AppShell } from './components/AppShell'
import { HomePage } from './components/HomePage'
import { JobPage } from './components/JobPage'
import { SettingsPage } from './components/SettingsPage'
import { useRemoveLegacyDrafts } from './hooks/useRemoveLegacyDrafts'

export function App(): ReactElement {
  useRemoveLegacyDrafts()

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={ <HomePage /> } />
        <Route path="/jobs/:id" element={ <JobPage /> } />
        <Route path="/settings" element={ <SettingsPage /> } />
        <Route path="*" element={ <Navigate to="/" replace /> } />
      </Routes>
    </AppShell>
  )
}
