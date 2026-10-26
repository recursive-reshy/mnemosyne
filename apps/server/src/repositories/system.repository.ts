// Lifecycle
import { statusesWhere } from '../jobs/lifecycle.js'
// Repositories
import { getDatabase } from './database.js'
import { SELECT_FEED, toOwnedFeed } from './feedRows.js'
import type { OwnedFeed } from './feedRows.js'
import { SELECT_SOURCE, toOwnedSource } from './gmailSourceRows.js'
import type { OwnedGmailSource } from './gmailSourceRows.js'
import { SELECT_JOB, marks, toOwnedJob } from './jobRows.js'
import type { OwnedJob } from './jobRows.js'

// The only queries without a user (ADR 0062): the loops that serve every user. Each row says
// whose it is. Task 5.4 gives them eligibility and round-robin; until then they take the oldest.

export const findNextRunnableJob = (): OwnedJob | undefined => {
  const statuses = statusesWhere( 'runnable' )
  const row = getDatabase()
    .prepare( `${ SELECT_JOB } WHERE jobs.status IN ( ${ marks( statuses ) } )
      ORDER BY jobs.rowid LIMIT 1` )
    .get( ...statuses )

  return row === undefined ? undefined : toOwnedJob( row )
}

export const markInterruptedJobs = ( message: string, now: string ): number => {
  const statuses = statusesWhere( 'onRestart', 'failed' )
  const { changes } = getDatabase()
    .prepare( `UPDATE jobs SET status = 'failed', error = ?, updated_at = ?
      WHERE status IN ( ${ marks( statuses ) } )` )
    .run( message, now, ...statuses )

  return changes
}

export const markInterruptedLinkingJobs = (
  message: string,
  now: string,
  expiresAt: string,
): number => {
  const statuses = statusesWhere( 'onRestart', 'ready_for_review' )
  const { changes } = getDatabase()
    .prepare( `UPDATE jobs SET status = 'ready_for_review', link_state = 'failed',
        link_error = ?, expires_at = ?, updated_at = ?
      WHERE status IN ( ${ marks( statuses ) } )` )
    .run( message, expiresAt, now, ...statuses )

  return changes
}

export const findExpiredJobs = ( now: string ): OwnedJob[] => {
  const statuses = statusesWhere( 'expires' )

  return getDatabase()
    .prepare( `${ SELECT_JOB }
      WHERE jobs.status IN ( ${ marks( statuses ) } )
        AND jobs.expires_at IS NOT NULL AND jobs.expires_at <= ?` )
    .all( ...statuses, now )
    .map( toOwnedJob )
}

const cutoffFor = ( now: string, intervalMinutes: number ): string => {
  return new Date( new Date( now ).getTime() - intervalMinutes * 60_000 ).toISOString()
}

export const listDueFeeds = ( now: string, intervalMinutes: number ): OwnedFeed[] => {
  return getDatabase()
    .prepare( `${ SELECT_FEED }
      WHERE feeds.enabled = 1 AND feeds.deleted_at IS NULL
        AND ( h.last_checked_at IS NULL OR h.last_checked_at <= ? )
      ORDER BY h.last_checked_at IS NOT NULL, h.last_checked_at, feeds.rowid` )
    .all( cutoffFor( now, intervalMinutes ) )
    .map( toOwnedFeed )
}

// Only sources whose owner has a connected Gmail account; the others wait until they reconnect
export const listDueGmailSources = (
  now: string,
  intervalMinutes: number,
): OwnedGmailSource[] => {
  return getDatabase()
    .prepare( `${ SELECT_SOURCE }
      JOIN gmail_account ON gmail_account.user_id = gmail_sources.user_id
        AND gmail_account.status = 'connected'
      WHERE gmail_sources.enabled = 1 AND gmail_sources.deleted_at IS NULL
        AND ( h.last_checked_at IS NULL OR h.last_checked_at <= ? )
      ORDER BY h.last_checked_at IS NOT NULL, h.last_checked_at, gmail_sources.rowid` )
    .all( cutoffFor( now, intervalMinutes ) )
    .map( toOwnedSource )
}
