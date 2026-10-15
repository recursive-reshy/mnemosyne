// Packages
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// App
import { App } from './App'

createRoot( document.getElementById( 'root' )! ).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
