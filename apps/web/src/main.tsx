// Packages
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import GlobalStyles from '@mui/material/GlobalStyles'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
// App
import { App } from './App'
import { editorTokens } from './editorTokens'
import { createQueryClient } from './queryClient'
import { theme } from './theme'

const queryClient = createQueryClient()

createRoot( document.getElementById( 'root' )! ).render(
  <StrictMode>
    <ThemeProvider theme={ theme } defaultMode="system" noSsr>
      <CssBaseline enableColorScheme />
      <GlobalStyles styles={ editorTokens } />
      <QueryClientProvider client={ queryClient }>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
