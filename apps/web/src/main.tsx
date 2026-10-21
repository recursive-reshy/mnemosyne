// Packages
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
// App
import { createQueryClient } from './queryClient'
import { routes } from './routes'
import { theme } from './theme'

const queryClient = createQueryClient()
const router = createBrowserRouter( routes )

createRoot( document.getElementById( 'root' )! ).render(
  <StrictMode>
    <ThemeProvider theme={ theme } defaultMode="system" noSsr>
      <CssBaseline enableColorScheme />
      <QueryClientProvider client={ queryClient }>
        <RouterProvider router={ router } />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
