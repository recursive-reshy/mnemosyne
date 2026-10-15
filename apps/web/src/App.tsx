// React
import type { ReactElement } from 'react'
// Packages
import { Navigate, Route, Routes } from 'react-router'
// App
import styles from './App.module.css'
import { HomePage } from './components/HomePage'
import { JobPage } from './components/JobPage'

export function App(): ReactElement {
  return (
    <main className={ styles.page }>
      <header className={ styles.header }>
        <h1 className={ styles.heading }>Mnemosyne</h1>
      </header>
      <div className={ styles.card }>
        <Routes>
          <Route path="/" element={ <HomePage /> } />
          <Route path="/jobs/:id" element={ <JobPage /> } />
          <Route path="*" element={ <Navigate to="/" replace /> } />
        </Routes>
      </div>
    </main>
  )
}
