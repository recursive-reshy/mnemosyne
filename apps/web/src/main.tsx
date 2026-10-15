// Packages
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
// App
import { App } from './App'
import { createQueryClient } from './queryClient'
import './global.css'

const queryClient = createQueryClient()

createRoot( document.getElementById( 'root' )! ).render(
  <StrictMode>
    <QueryClientProvider client={ queryClient }>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
