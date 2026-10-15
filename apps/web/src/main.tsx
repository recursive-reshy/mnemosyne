// Packages
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// App
import { App } from './App'
import './global.css'

createRoot( document.getElementById( 'root' )! ).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
