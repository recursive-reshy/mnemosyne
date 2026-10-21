// React
import type { ReactElement } from 'react'
// Packages
import { Navigate, useLocation } from 'react-router'

// The server's Gmail OAuth callback returns to /settings?gmail=…; that notice lives on Sources.
export function SettingsIndexRedirect(): ReactElement {
  const { search } = useLocation()
  const hasGmailNotice = new URLSearchParams( search ).has( 'gmail' )

  return (
    <Navigate
      replace
      to={ hasGmailNotice ? { pathname: '/settings/sources', search } : '/settings/prompts' }
    />
  )
}
