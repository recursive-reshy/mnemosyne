// Shared
import type {
  Backfill,
  CreateGmailSourceBody,
  GmailMatch,
  GmailSource,
  PreviewGmailSourceResponse,
  UpdateGmailSourceBody,
} from '@mnemosyne/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Gmail
import { GmailAuthError } from '../gmail/auth.js'
import {
  countMatches,
  getMessage,
  listLabels,
  listMatchingIds,
} from '../gmail/gmail.client.js'
import { parseMessage } from '../gmail/parseMessage.js'
import type { ParsedMessage } from '../gmail/parseMessage.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import { findAccount } from '../repositories/gmailAccount.repository.js'
import {
  countInbox,
  dismissInboxForSource,
  findStoredMessageIds,
  insertMessageIfNew,
} from '../repositories/gmailMessages.repository.js'
import type { StoredGmailMessage } from '../repositories/gmailMessages.repository.js'
import {
  findSourceById,
  insertSource,
  listActiveSourcesByMatch,
  listDueSources,
  listSources as listStoredSources,
  markSourceDeleted,
  recordSourceCheck,
  updateSource as updateStoredSource,
} from '../repositories/gmailSources.repository.js'
import type { StoredGmailSource } from '../repositories/gmailSources.repository.js'
import { countPostingsForSource } from '../repositories/postings.repository.js'
// Services
import { queueNewsletterMessage } from './inbox.service.js'
import { assertActiveProfile } from './prompts.service.js'
import { getSettings } from './settings.service.js'

const DAY_MS = 86_400_000
const MARGIN_DAYS = 2
const LIST_MAX = 100
const MAX_NEW_NEWSLETTERS_PER_CHECK = 10
const BACKFILL_MAX = 200
const BACKFILL_DAYS: Record< Backfill, number | null > = {
  none: 0,
  '30d': 30,
  '90d': 90,
  all: null,
}

type MessageStatus = StoredGmailMessage[ 'status' ]

export const requireConnectedGmail = (): void => {
  if( config.gmail === null ) {
    throw new ConflictError( 'Gmail isn\'t configured' )
  }

  const account = findAccount()

  if( account === undefined ) {
    throw new ConflictError( 'Gmail isn\'t connected' )
  }

  if( account.status !== 'connected' ) {
    throw new ConflictError( 'Gmail needs to be reconnected' )
  }
}

export const marginStart = ( syncFrom: Date ): Date => {
  return new Date( syncFrom.getTime() - MARGIN_DAYS * DAY_MS )
}

export const toStoredMessage = (
  sourceId: string,
  parsed: ParsedMessage,
  status: MessageStatus,
  backfilled: boolean,
  addedAt: string,
): StoredGmailMessage => {
  return {
    id: crypto.randomUUID(),
    source_id: sourceId,
    message_id: parsed.messageId,
    subject: parsed.subject,
    sender: parsed.sender,
    sender_address: parsed.senderAddress,
    received_at: parsed.receivedAt,
    body_html: parsed.html,
    body_text: parsed.text,
    status,
    backfilled,
    attempts: 0,
    error: null,
    job_id: null,
    added_at: addedAt,
  }
}

// Emails run newest first. Each gets an added_at a millisecond earlier than the one before, so
// the inbox, which sorts on it, lists them newest first.
export const stampNewestFirst = (
  messages: { parsed: ParsedMessage, status: MessageStatus, backfilled: boolean }[],
  now: Date,
  sourceId: string,
): StoredGmailMessage[] => {
  return [ ...messages ]
    .sort( ( first, second ) => second.parsed.receivedAt.localeCompare( first.parsed.receivedAt ) )
    .map( ( { parsed, status, backfilled }, index ) => {
      const addedAt = new Date( now.getTime() - index ).toISOString()

      return toStoredMessage( sourceId, parsed, status, backfilled, addedAt )
    } )
}

const fetchParsed = async ( id: string, format: 'full' | 'metadata' ): Promise< ParsedMessage > => {
  return parseMessage( await getMessage( id, format ) )
}

const newestOf = ( messages: ParsedMessage[] ): ParsedMessage | null => {
  return messages.reduce< ParsedMessage | null >( ( newest, message ) => {
    return newest === null || message.receivedAt > newest.receivedAt ? message : newest
  }, null )
}

const newestAmong = async ( heads: string[] ): Promise< ParsedMessage | null > => {
  const parsed: ParsedMessage[] = []

  for( const id of heads ) {
    parsed.push( await fetchParsed( id, 'metadata' ) )
  }

  return newestOf( parsed )
}

const normalizeQuery = ( query: string ): string => query.trim().replace( /\s+/g, ' ' )

const sharesMatch = ( first: GmailMatch, second: GmailMatch ): boolean => {
  if( first.kind === 'query' && second.kind === 'query' ) {
    return normalizeQuery( first.query ) === normalizeQuery( second.query )
  }

  if( first.kind === 'labels' && second.kind === 'labels' ) {
    return first.label_ids.some( ( id ) => second.label_ids.includes( id ) )
  }

  return false
}

const findOverlaps = (
  match: GmailMatch,
  excludeId?: string,
): PreviewGmailSourceResponse[ 'overlaps' ] => {
  return listActiveSourcesByMatch()
    .filter( ( source ) => source.id !== excludeId && sharesMatch( match, source.match ) )
    .map( ( { id, name } ) => ( { id, name } ) )
}

// The names are a convenience: when Gmail can't give them, the list shows the ids instead.
const loadLabelNames = async ( sources: StoredGmailSource[] ): Promise< Map< string, string > > => {
  if( !sources.some( ( { match } ) => match.kind === 'labels' ) ) {
    return new Map()
  }

  try {
    return new Map( ( await listLabels() ).map( ( { id, name } ) => [ id, name ] ) )
  } catch{
    return new Map()
  }
}

const toPublicSource = ( source: StoredGmailSource, names: Map< string, string > ): GmailSource => {
  return {
    id: source.id,
    name: source.name,
    match: source.match,
    label_names: source.match.kind === 'labels'
      ? source.match.label_ids.map( ( id ) => names.get( id ) ?? id )
      : [],
    destination: source.destination,
    profile_id: source.profile_id,
    auto_summarize: source.auto_summarize,
    enabled: source.enabled,
    sync_from: source.sync_from,
    last_checked_at: source.last_checked_at,
    last_error: source.last_error,
    last_skipped_count: source.last_skipped_count,
    inbox_count: countInbox( source.id ),
    postings_count: countPostingsForSource( source.id ),
    created_at: source.created_at,
  }
}

export const presentSources = async ( sources: StoredGmailSource[] ): Promise< GmailSource[] > => {
  const names = await loadLabelNames( sources )

  return sources.map( ( source ) => toPublicSource( source, names ) )
}

export const presentSource = async ( source: StoredGmailSource ): Promise< GmailSource > => {
  const [ presented ] = await presentSources( [ source ] )

  return presented
}

export const requireActiveSource = ( id: string ): StoredGmailSource => {
  const source = findSourceById( id )

  if( source === undefined || source.deleted_at !== null ) {
    throw new NotFoundError( 'Gmail source not found' )
  }

  return source
}

export const listGmailSources = async (): Promise< GmailSource[] > => {
  return presentSources( listStoredSources() )
}

// A lost connection reaches a route as a conflict, so the web app can say so.
const asConflict = async < T >( run: () => Promise< T > ): Promise< T > => {
  try {
    return await run()
  } catch( error ) {
    throw error instanceof GmailAuthError ? new ConflictError( error.message ) : error
  }
}

export const previewSource = async (
  match: GmailMatch,
  excludeId?: string,
): Promise< PreviewGmailSourceResponse > => {
  requireConnectedGmail()

  const { count, capped, heads } = await asConflict( () => countMatches( match ) )
  const newest = await asConflict( () => newestAmong( heads ) )

  return {
    count,
    count_capped: capped,
    newest: newest === null
      ? null
      : { subject: newest.subject, from: newest.sender, received_at: newest.receivedAt },
    overlaps: findOverlaps( match, excludeId ),
  }
}

interface Collected {
  parsed: ParsedMessage
  status: MessageStatus
  backfilled: boolean
}

// What a new source starts with. Emails from the last two days are always accounted for, because
// every check looks that far back (ADR 0035): the ones that don't go to the inbox are stored as
// skipped, so the first check doesn't collect them.
const collectStarting = async (
  body: CreateGmailSourceBody,
  now: Date,
): Promise< Collected[] > => {
  const collected: Collected[] = []
  const margin = async ( except: string | null ): Promise< void > => {
    const { ids } = await listMatchingIds(
      body.match,
      { after: marginStart( now ), max: LIST_MAX },
    )

    for( const id of [ ...new Set( ids ) ].filter( ( found ) => found !== except ) ) {
      collected.push( {
        parsed: await fetchParsed( id, 'metadata' ),
        status: 'skipped',
        backfilled: false,
      } )
    }
  }

  if( body.destination === 'jobs' ) {
    await margin( null )

    return collected
  }

  const days = BACKFILL_DAYS[ body.backfill ?? 'none' ]

  if( days === 0 ) {
    const { heads } = await listMatchingIds( body.match, { max: 1 } )
    const newest = heads.length > 1 ? await newestAmong( heads ) : null
    const newestId = newest?.messageId ?? heads[ 0 ] ?? null

    if( newestId !== null ) {
      collected.push( {
        parsed: await fetchParsed( newestId, 'full' ),
        status: 'inbox',
        backfilled: false,
      } )
    }

    await margin( newestId )

    return collected
  }

  const after = days === null ? undefined : new Date( now.getTime() - days * DAY_MS )
  const { ids } = await listMatchingIds( body.match, { after, max: BACKFILL_MAX } )

  for( const id of [ ...new Set( ids ) ].slice( 0, BACKFILL_MAX ) ) {
    collected.push( { parsed: await fetchParsed( id, 'full' ), status: 'inbox', backfilled: true } )
  }

  return collected
}

// The emails of an automatic newsletter source skip the inbox. One that can't be queued stays
// there instead. A backfill is never queued, so it costs nothing until it is picked from the inbox.
const queueAutomatically = async (
  source: StoredGmailSource,
  rows: StoredGmailMessage[],
): Promise< void > => {
  if( source.destination !== 'newsletter' || !source.auto_summarize ) {
    return
  }

  const waiting = rows.filter( ( { status, backfilled } ) => status === 'inbox' && !backfilled )

  for( const row of waiting ) {
    try {
      await queueNewsletterMessage( source, row )
    } catch( error ) {
      console.error( `Could not queue "${ row.subject }" from ${ source.name }`, error )
    }
  }
}

export const createSource = async ( body: CreateGmailSourceBody ): Promise< GmailSource > => {
  // Job-alert intake is deferred (ADR 0041); stored jobs sources are still read.
  if( body.destination === 'jobs' ) {
    throw new ValidationError( 'Freelance jobs sources aren\'t available yet' )
  }

  requireConnectedGmail()

  if( body.profile_id !== undefined ) {
    assertActiveProfile( body.profile_id )
  }

  const now = new Date()
  const collected = await asConflict( () => collectStarting( body, now ) )
  const source: StoredGmailSource = {
    id: crypto.randomUUID(),
    name: body.name,
    match: body.match,
    destination: body.destination,
    profile_id: body.profile_id ?? null,
    enabled: true,
    auto_summarize: body.auto_summarize ?? false,
    sync_from: now.toISOString(),
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: now.toISOString(),
    deleted_at: null,
  }

  const rows = stampNewestFirst( collected, now, source.id )

  inTransaction( () => {
    insertSource( source )
    rows.forEach( insertMessageIfNew )
  } )

  await queueAutomatically( source, rows )

  return presentSource( source )
}

export const updateSource = async (
  id: string,
  body: UpdateGmailSourceBody,
): Promise< GmailSource > => {
  const source = requireActiveSource( id )

  if( source.destination === 'jobs'
    && ( body.profile_id !== undefined || body.auto_summarize !== undefined ) ) {
    throw new ValidationError( 'Profile and Summarize automatically apply to newsletters only' )
  }

  if( typeof body.profile_id === 'string' ) {
    assertActiveProfile( body.profile_id )
  }

  const changes: Partial< Omit< StoredGmailSource, 'id' > > = {}

  if( body.name !== undefined ) {
    changes.name = body.name
  }

  if( body.match !== undefined ) {
    changes.match = body.match
  }

  if( body.profile_id !== undefined ) {
    changes.profile_id = body.profile_id
  }

  if( body.enabled !== undefined ) {
    changes.enabled = body.enabled
  }

  if( body.auto_summarize !== undefined ) {
    changes.auto_summarize = body.auto_summarize
  }

  const updated = updateStoredSource( id, changes )

  if( updated === undefined ) {
    throw new NotFoundError( 'Gmail source not found' )
  }

  return presentSource( updated )
}

export const deleteSource = (
  id: string,
  { removeInboxItems }: { removeInboxItems: boolean },
): void => {
  requireActiveSource( id )

  inTransaction( () => {
    if( removeInboxItems ) {
      dismissInboxForSource( id )
    }

    markSourceDeleted( id, new Date().toISOString() )
  } )
}

const withoutBodies = ( parsed: ParsedMessage ): ParsedMessage => {
  return { ...parsed, html: null, text: null }
}

const readNewMessages = async (
  source: StoredGmailSource,
): Promise< { messages: ParsedMessage[], missingLabelIds: string[], failure: string | null } > => {
  const messages: ParsedMessage[] = []
  let missingLabelIds: string[] = []

  try {
    const found = await listMatchingIds(
      source.match,
      { after: marginStart( new Date( source.sync_from ) ), max: LIST_MAX },
    )
    const ids = [ ...new Set( found.ids ) ]
    const stored = findStoredMessageIds( source.id, ids )

    missingLabelIds = found.missingLabelIds

    for( const id of ids.filter( ( found ) => !stored.has( found ) ) ) {
      messages.push( await fetchParsed( id, 'full' ) )
    }

    return { messages, missingLabelIds, failure: null }
  } catch( error ) {
    // The account is no longer usable: end the pass, don't blame this source.
    if( error instanceof GmailAuthError ) {
      throw error
    }

    // What was read before the failure is kept; the rest is picked up by a later check.
    return {
      messages,
      missingLabelIds,
      failure: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Returns the rows this check added, for what follows a check (extraction, task 9.3).
const runCheck = async ( source: StoredGmailSource ): Promise< StoredGmailMessage[] > => {
  const now = new Date()
  const { messages, missingLabelIds, failure } = await readNewMessages( source )
  const newest = [ ...messages ]
    .sort( ( first, second ) => second.receivedAt.localeCompare( first.receivedAt ) )
  const collected: Collected[] = newest.map( ( parsed, index ) => {
    if( source.destination === 'jobs' ) {
      return { parsed, status: 'pending', backfilled: false }
    }

    return index < MAX_NEW_NEWSLETTERS_PER_CHECK
      ? { parsed, status: 'inbox', backfilled: false }
      : { parsed: withoutBodies( parsed ), status: 'skipped', backfilled: false }
  } )
  const overflow = collected.filter( ( { status } ) => status === 'skipped' ).length
  const added: StoredGmailMessage[] = []

  inTransaction( () => {
    stampNewestFirst( collected, now, source.id ).forEach( ( row ) => {
      if( insertMessageIfNew( row ) ) {
        added.push( row )
      }
    } )

    recordSourceCheck( source.id, {
      last_checked_at: now.toISOString(),
      last_error: failure ?? ( missingLabelIds.length === 0
        ? null
        : `Label not found in Gmail: ${ missingLabelIds.join( ', ' ) }` ),
      last_skipped_count: source.destination === 'newsletter' && messages.length > 0
        ? overflow
        : source.last_skipped_count,
    } )
  } )

  await queueAutomatically( source, added )

  return added
}

export const checkSource = async ( id: string ): Promise< GmailSource > => {
  const source = requireActiveSource( id )

  if( !source.enabled ) {
    throw new ConflictError( 'This source is turned off' )
  }

  requireConnectedGmail()
  await asConflict( () => runCheck( source ) )

  return presentSource( requireActiveSource( id ) )
}

export const checkAllSources = async (): Promise< GmailSource[] > => {
  requireConnectedGmail()

  for( const source of listStoredSources().filter( ( { enabled } ) => enabled ) ) {
    await asConflict( () => runCheck( source ) )
  }

  return listGmailSources()
}

export const checkDueSources = async (): Promise< number > => {
  if( config.gmail === null || findAccount()?.status !== 'connected' ) {
    return 0
  }

  const due = listDueSources(
    new Date().toISOString(),
    getSettings().feed_check_interval_minutes,
  )
  let checked = 0

  for( const source of due ) {
    try {
      await runCheck( source )
      checked += 1
    } catch( error ) {
      if( error instanceof GmailAuthError ) {
        console.warn( 'Gmail sources paused: Google no longer accepts the stored access' )
        break
      }

      console.error( `Checking Gmail source ${ source.name } failed`, error )
    }
  }

  return checked
}
