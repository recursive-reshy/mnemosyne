// Packages
import { Navigate } from 'react-router'
import type { RouteObject } from 'react-router'
// App
import { App } from './App'
import { HomePage } from './components/HomePage'
import { JobPage } from './components/JobPage'
import { MeleteToday } from './components/MeleteToday'
import { ModelsTab } from './components/ModelsTab'
import { PromptsTab } from './components/PromptsTab'
import { SettingsIndexRedirect } from './components/SettingsIndexRedirect'
import { SettingsLayout } from './components/SettingsLayout'
import { SourcesTab } from './components/SourcesTab'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'jobs/:id', element: <JobPage /> },
      { path: 'melete', element: <MeleteToday /> },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <SettingsIndexRedirect /> },
          { path: 'prompts', element: <PromptsTab /> },
          { path: 'prompts/:promptId', element: <PromptsTab /> },
          { path: 'models', element: <ModelsTab /> },
          { path: 'sources', element: <SourcesTab /> },
          { path: '*', element: <Navigate to="/settings/prompts" replace /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
