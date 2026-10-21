// React
import type { ReactElement } from 'react'
// Packages
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { InitialEntry, Location } from 'react-router'
// Testing Library
import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
// App
import { createQueryClient } from '#src/queryClient'
import { routes } from '#src/routes'
import { theme } from '#src/theme'

interface RouterRender extends RenderResult {
  queryClient: QueryClient
  location: () => Location
}

// Renders the app's real routes in a memory data router, as main.tsx does in the browser.
export const renderWithRouter = ( path: InitialEntry = '/' ): RouterRender => {
  const queryClient = createQueryClient()
  const router = createMemoryRouter( routes, { initialEntries: [ path ] } )
  const ui: ReactElement = (
    <ThemeProvider theme={ theme } defaultMode="system" noSsr>
      <QueryClientProvider client={ queryClient }>
        <RouterProvider router={ router } />
      </QueryClientProvider>
    </ThemeProvider>
  )

  return {
    ...render( ui ),
    queryClient,
    location: () => router.state.location,
  }
}
