// Packages
import { Navigate } from 'react-router'
import type { RouteObject } from 'react-router'
// App
import { App } from './App'
import { HomePage } from './components/HomePage'
import { JobPage } from './components/JobPage'
import { SettingsPage } from './components/SettingsPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'jobs/:id', element: <JobPage /> },
      { path: 'settings/*', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
