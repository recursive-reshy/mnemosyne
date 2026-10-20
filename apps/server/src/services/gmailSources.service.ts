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
  insertMessageIfNew,
} from '../repositories/gmailMessages.repository.js'
import type { StoredGmailMessage } from '../repositories/gmailMessages.repository.js'
import {
  findSourceById,
  insertSource,
  listActiveSourcesByMatch,
  listSources as listStoredSources,
  markSourceDeleted,
  updateSource as updateStoredSource,
} from '../repositories/gmailSources.repository.js'
import type { StoredGmailSource } from '../repositories/gmailSources.repository.js'
import { countPostingsForSource } from '../repositories/postings.repository.js'
// Services
import { assertActiveProfile } from './prompts.service.js'

const DAY_MS = 86_400_000
const MARGIN_DAYS = 2
const MARGIN_MAX = 100
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

export const previewSource = async (
  match: GmailMatch,
  excludeId?: string,
): Promise< PreviewGmailSourceResponse > => {
  requireConnectedGmail()

  const { count, capped, heads } = await countMatches( match )
  const newest = await newestAmong( heads )

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
      { after: marginStart( now ), max: MARGIN_MAX },
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

export const createSource = async ( body: CreateGmailSourceBody ): Promise< GmailSource > => {
  requireConnectedGmail()

  if( body.profile_id !== undefined ) {
    assertActiveProfile( body.profile_id )
  }

  const now = new Date()
  const collected = await collectStarting( body, now )
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

  inTransaction( () => {
    insertSource( source )
    stampNewestFirst( collected, now, source.id ).forEach( insertMessageIfNew )
  } )

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
