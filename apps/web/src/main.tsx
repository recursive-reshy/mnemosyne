// Packages
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
// App
import { App } from './App'
import { createQueryClient } from './queryClient'
import { theme } from './theme'

const queryClient = createQueryClient()

createRoot( document.getElementById( 'root' )! ).render(
  <StrictMode>
    <ThemeProvider theme={ theme } defaultMode="system" noSsr>
      <CssBaseline enableColorScheme />
      <QueryClientProvider client={ queryClient }>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
