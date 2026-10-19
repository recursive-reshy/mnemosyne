// Packages
import { z } from 'zod'
// Shared
import { AlertEmailStatus } from '@mnemosyne/shared'
// Repositories
import { getDatabase } from './database.js'

export const GmailMessageStatus = z.enum( [
  'inbox',
  'dismissed',
  'queued',
  'skipped',
  'pending',
  'extracted',
  'no_jobs',
  'failed',
] )
export type GmailMessageStatus = z.infer< typeof GmailMessageStatus >

export const StoredGmailMessage = z.object( {
  id: z.string(),
  source_id: z.string(),
  message_id: z.string(),
  subject: z.string(),
  sender: z.string(),
  sender_address: z.string(),
  received_at: z.string(),
  body_html: z.string().nullable(),
  body_text: z.string().nullable(),
  status: GmailMessageStatus,
  backfilled: z.boolean(),
  attempts: z.number().int(),
  error: z.string().nullable(),
  job_id: z.string().nullable(),
  added_at: z.string(),
} )
export type StoredGmailMessage = z.infer< typeof StoredGmailMessage >

export type NewsletterInboxRow = StoredGmailMessage & { source_name: string }

export const StoredAlertEmail = z.object( {
  id: z.string(),
  source_id: z.string(),
  source_name: z.string(),
  message_id: z.string(),
  subject: z.string(),
  sender: z.string(),
  received_at: z.string(),
  status: AlertEmailStatus,
  postings_count: z.number().int(),
  attempts: z.number().int(),
  error: z.string().nullable(),
} )
export type StoredAlertEmail = z.infer< typeof StoredAlertEmail >

// Shared with the postings repository, which lists the emails a posting appeared in.
export const ALERT_EMAIL_SELECT = `SELECT gmail_messages.id, gmail_messages.source_id,
    gmail_sources.name AS source_name, gmail_messages.message_id, gmail_messages.subject,
    gmail_messages.sender, gmail_messages.received_at, gmail_messages.status,
    ( SELECT COUNT(*) FROM posting_sightings
      WHERE posting_sightings.gmail_message_row = gmail_messages.id ) AS postings_count,
    gmail_messages.attempts, gmail_messages.error
  FROM gmail_messages JOIN gmail_sources ON gmail_sources.id = gmail_messages.source_id`

const placeholders = ( ids: string[] ): string => ids.map( () => '?' ).join( ', ' )

const toStoredMessage = ( raw: unknown ): StoredGmailMessage => {
  const row = z.object( { backfilled: z.number() } ).loose().parse( raw )

  return StoredGmailMessage.parse( { ...row, backfilled: row.backfilled === 1 } )
}

export const insertMessageIfNew = ( message: StoredGmailMessage ): boolean => {
  const { changes } = getDatabase().prepare( `INSERT INTO gmail_messages (
      id, source_id, message_id, subject, sender, sender_address, received_at, body_html,
      body_text, status, backfilled, attempts, error, job_id, added_at
    ) VALUES (
      @id, @source_id, @message_id, @subject, @sender, @sender_address, @received_at,
      @body_html, @body_text, @status, @backfilled, @attempts, @error, @job_id, @added_at
    ) ON CONFLICT ( source_id, message_id ) DO NOTHING` )
    .run( { ...message, backfilled: message.backfilled ? 1 : 0 } )

  return changes > 0
}

export const findMessagesByIds = ( ids: string[] ): StoredGmailMessage[] => {
  if( ids.length === 0 ) {
    return []
  }

  return getDatabase()
    .prepare( `SELECT * FROM gmail_messages WHERE id IN ( ${ placeholders( ids ) } )
      ORDER BY rowid` )
    .all( ...ids )
    .map( toStoredMessage )
}

export const listNewsletterInbox = (): NewsletterInboxRow[] => {
  return getDatabase()
    .prepare( `SELECT gmail_messages.*, gmail_sources.name AS source_name
      FROM gmail_messages JOIN gmail_sources ON gmail_sources.id = gmail_messages.source_id
      WHERE gmail_messages.status = 'inbox' AND gmail_sources.destination = 'newsletter'
      ORDER BY gmail_messages.added_at DESC, gmail_messages.rowid DESC` )
    .all()
    .map( ( row ) => ( {
      ...toStoredMessage( row ),
      ...z.object( { source_name: z.string() } ).parse( row ),
    } ) )
}

export const setMessageStatus = (
  ids: string[],
  status: GmailMessageStatus,
  jobId: string | null = null,
): void => {
  if( ids.length === 0 ) {
    return
  }

  const clears = `? <> 'inbox' AND ( SELECT destination FROM gmail_sources
    WHERE gmail_sources.id = gmail_messages.source_id ) = 'newsletter'`

  getDatabase().prepare( `UPDATE gmail_messages SET status = ?, job_id = ?,
      body_html = CASE WHEN ${ clears } THEN NULL ELSE body_html END,
      body_text = CASE WHEN ${ clears } THEN NULL ELSE body_text END
    WHERE id IN ( ${ placeholders( ids ) } )` )
    .run( status, jobId, status, status, ...ids )
}

export const listPendingAlerts = ( sourceId: string, limit: number ): StoredGmailMessage[] => {
  return getDatabase()
    .prepare( `SELECT * FROM gmail_messages
      WHERE source_id = ? AND ( status = 'pending' OR ( status = 'failed' AND attempts < 3 ) )
      ORDER BY received_at, rowid LIMIT ?` )
    .all( sourceId, limit )
    .map( toStoredMessage )
}

export const recordAttempt = (
  id: string,
  result: { status: GmailMessageStatus, error: string | null },
): void => {
  getDatabase().prepare( `UPDATE gmail_messages SET status = @status, error = @error,
      attempts = attempts + 1 WHERE id = @id` ).run( { ...result, id } )
}

export const listAlertEmails = (
  { status, limit, offset }: { status?: AlertEmailStatus, limit: number, offset: number },
): { rows: StoredAlertEmail[], total: number } => {
  const db = getDatabase()
  const where = `WHERE gmail_sources.destination = 'jobs'
    AND gmail_messages.status IN ( 'pending', 'extracted', 'no_jobs', 'failed' )
    AND ( @status IS NULL OR gmail_messages.status = @status )`
  const params = { status: status ?? null }

  const { total } = z.object( { total: z.number() } ).parse(
    db.prepare( `SELECT COUNT(*) AS total FROM gmail_messages
      JOIN gmail_sources ON gmail_sources.id = gmail_messages.source_id ${ where }` )
      .get( params ),
  )

  const rows = z.array( StoredAlertEmail ).parse(
    db.prepare( `${ ALERT_EMAIL_SELECT } ${ where }
      ORDER BY gmail_messages.received_at DESC, gmail_messages.rowid DESC
      LIMIT @limit OFFSET @offset` ).all( { ...params, limit, offset } ),
  )

  return { rows, total }
}

export const countInbox = ( sourceId: string ): number => {
  const { count } = z.object( { count: z.number() } ).parse(
    getDatabase()
      .prepare( `SELECT COUNT(*) AS count FROM gmail_messages
        WHERE source_id = ? AND status = 'inbox'` )
      .get( sourceId ),
  )

  return count
}

export const dismissInboxForSource = ( sourceId: string ): void => {
  getDatabase().prepare( `UPDATE gmail_messages SET status = 'dismissed',
      body_html = NULL, body_text = NULL
    WHERE source_id = ? AND status = 'inbox'` ).run( sourceId )
}
