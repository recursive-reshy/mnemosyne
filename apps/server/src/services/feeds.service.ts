// Shared
import type {
  CreateFeedBody,
  Feed,
  PreviewFeedResponse,
  UpdateFeedBody,
} from '@mnemosyne/shared'
// Errors
import { BadGatewayError, ConflictError, NotFoundError } from '../errors.js'
// Clients
import {
  HttpStatusError,
  RedirectError,
  TooLargeError,
  UnreachableError,
} from '../clients/http.client.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import {
  countInbox,
  dismissInboxForFeed,
  insertItemIfNew,
} from '../repositories/feedItems.repository.js'
import type { StoredFeedItem } from '../repositories/feedItems.repository.js'
import {
  findActiveFeedByFeedUrl,
  findFeedById,
  insertFeed,
  listDueFeeds,
  listFeeds as listStoredFeeds,
  markFeedDeleted,
  recordCheck,
  updateFeed as updateStoredFeed,
} from '../repositories/feeds.repository.js'
import type { StoredFeed } from '../repositories/feeds.repository.js'
// Sources
import {
  discoverFeed,
  fetchFeed,
  parseFeedXml,
  toFeedItem,
} from '../sources/feeds.js'
import type { FeedItemData, ParsedFeed } from '../sources/feeds.js'
// Services
import { queueFeedItem } from './inbox.service.js'
import { assertActiveProfile } from './prompts.service.js'
import { getFeedCheckInterval } from './settings.service.js'

const MAX_NEW_ITEMS_PER_CHECK = 10

// A site that can't be read is the site's problem, not a bad request.
const discover = async ( url: string ): ReturnType< typeof discoverFeed > => {
  try {
    return await discoverFeed( url )
  } catch( error ) {
    if( error instanceof UnreachableError || error instanceof HttpStatusError
      || error instanceof TooLargeError || error instanceof RedirectError ) {
      throw new BadGatewayError( error.message )
    }

    throw error
  }
}

const toPublicFeed = ( feed: StoredFeed ): Feed => {
  return {
    id: feed.id,
    url: feed.url,
    feed_url: feed.feed_url,
    name: feed.name,
    profile_id: feed.profile_id,
    enabled: feed.enabled,
    auto_summarize: feed.auto_summarize,
    last_checked_at: feed.last_checked_at,
    last_error: feed.last_error,
    last_skipped_count: feed.last_skipped_count,
    inbox_count: countInbox( feed.id ),
    created_at: feed.created_at,
  }
}

const requireActiveFeed = ( id: string ): StoredFeed => {
  const feed = findFeedById( id )

  if( feed === undefined || feed.deleted_at !== null ) {
    throw new NotFoundError( 'Feed not found' )
  }

  return feed
}

// The newest item by date; when none has a date, the first in feed order.
const newestIndex = ( items: FeedItemData[] ): number => {
  let best = 0

  items.forEach( ( item, index ) => {
    const date = item.published_at
    const bestDate = items[ best ]?.published_at ?? null

    if( date !== null && ( bestDate === null || date > bestDate ) ) {
      best = index
    }
  } )

  return best
}

const toStoredItem = (
  feedId: string,
  item: FeedItemData,
  status: StoredFeedItem[ 'status' ],
  now: string,
): StoredFeedItem => {
  return {
    id: crypto.randomUUID(),
    feed_id: feedId,
    item_key: item.item_key,
    title: item.title,
    link: item.link,
    published_at: item.published_at,
    author: item.author,
    content_markdown: status === 'inbox' ? item.content_markdown : null,
    status,
    job_id: null,
    added_at: now,
  }
}

// Items of an automatic feed skip the inbox. One that can't be queued stays there instead.
const queueAutomatically = async ( feed: StoredFeed, items: StoredFeedItem[] ): Promise< void > => {
  if( !feed.auto_summarize ) {
    return
  }

  for( const item of items ) {
    try {
      await queueFeedItem( feed, item )
    } catch( error ) {
      console.error( `Could not queue "${ item.title }" from ${ feed.name }`, error )
    }
  }
}

export const previewFeed = async ( url: string ): Promise< PreviewFeedResponse > => {
  const found = await discover( url )
  const items = found.items.map( toFeedItem )
  const latest = items[ newestIndex( items ) ]

  return {
    feed_url: found.feedUrl,
    title: found.title,
    latest_item: latest === undefined
      ? null
      : { title: latest.title, published_at: latest.published_at },
  }
}

export const listFeeds = (): Feed[] => listStoredFeeds().map( toPublicFeed )

export const createFeed = async ( body: CreateFeedBody ): Promise< Feed > => {
  if( body.profile_id !== undefined ) {
    assertActiveProfile( body.profile_id )
  }

  const found = await discover( body.url )

  if( findActiveFeedByFeedUrl( found.feedUrl ) !== undefined ) {
    throw new ConflictError( 'This feed was already added' )
  }

  const now = new Date().toISOString()
  const items = found.items.map( toFeedItem )
  const newest = newestIndex( items )
  const feed: StoredFeed = {
    id: crypto.randomUUID(),
    url: body.url,
    feed_url: found.feedUrl,
    name: body.name ?? ( found.title === '' ? found.feedUrl : found.title ),
    profile_id: body.profile_id ?? null,
    enabled: true,
    auto_summarize: body.auto_summarize ?? false,
    etag: found.etag,
    last_modified: found.lastModified,
    last_checked_at: now,
    last_error: null,
    last_skipped_count: 0,
    created_at: now,
    deleted_at: null,
  }

  const stored = items.map( ( item, index ) => {
    return toStoredItem( feed.id, item, index === newest ? 'inbox' : 'baseline', now )
  } )

  inTransaction( () => {
    insertFeed( feed )
    stored.forEach( insertItemIfNew )
  } )

  await queueAutomatically( feed, stored.filter( ( { status } ) => status === 'inbox' ) )

  return toPublicFeed( feed )
}

export const updateFeed = ( id: string, body: UpdateFeedBody ): Feed => {
  requireActiveFeed( id )

  if( typeof body.profile_id === 'string' ) {
    assertActiveProfile( body.profile_id )
  }

  const changes: Partial< Omit< StoredFeed, 'id' > > = {}

  if( body.name !== undefined ) {
    changes.name = body.name
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

  const updated = updateStoredFeed( id, changes )

  if( updated === undefined ) {
    throw new NotFoundError( 'Feed not found' )
  }

  return toPublicFeed( updated )
}

export const deleteFeed = (
  id: string,
  { removeInboxItems }: { removeInboxItems: boolean },
): void => {
  requireActiveFeed( id )

  inTransaction( () => {
    if( removeInboxItems ) {
      dismissInboxForFeed( id )
    }

    markFeedDeleted( id, new Date().toISOString() )
  } )
}

interface Fetched {
  parsed: ParsedFeed | null
  check: Pick< StoredFeed, 'etag' | 'last_modified' >
}

const fetchAndParse = async ( feed: StoredFeed ): Promise< Fetched > => {
  const response = await fetchFeed( feed.feed_url, {
    etag: feed.etag ?? undefined,
    lastModified: feed.last_modified ?? undefined,
  } )
  const check = {
    etag: response.etag ?? feed.etag,
    last_modified: response.lastModified ?? feed.last_modified,
  }

  if( response.status === 304 ) {
    return { parsed: null, check }
  }

  return {
    parsed: parseFeedXml( response.body ),
    check: { etag: response.etag, last_modified: response.lastModified },
  }
}

export const checkFeed = async ( id: string ): Promise< Feed > => {
  const feed = requireActiveFeed( id )

  if( !feed.enabled ) {
    throw new ConflictError( 'This feed is turned off' )
  }

  const now = new Date().toISOString()
  let outcome: Fetched

  try {
    outcome = await fetchAndParse( feed )
  } catch( error ) {
    recordCheck( id, {
      etag: feed.etag,
      last_modified: feed.last_modified,
      last_checked_at: now,
      last_error: error instanceof Error ? error.message : 'Unknown error',
      last_skipped_count: feed.last_skipped_count,
    } )

    return toPublicFeed( requireActiveFeed( id ) )
  }

  let skipped = feed.last_skipped_count
  const added: StoredFeedItem[] = []

  if( outcome.parsed !== null ) {
    const items = outcome.parsed.items.map( toFeedItem )

    skipped = inTransaction( () => {
      let inbox = 0
      let overflow = 0

      // Items run newest first. Each gets an added_at a millisecond earlier than the one before,
      // so the inbox, which sorts on it, lists them in feed order.
      items.forEach( ( item, index ) => {
        const status = inbox < MAX_NEW_ITEMS_PER_CHECK ? 'inbox' : 'skipped'
        const addedAt = new Date( Date.parse( now ) - index ).toISOString()

        const stored = toStoredItem( id, item, status, addedAt )

        if( insertItemIfNew( stored ) ) {
          inbox += status === 'inbox' ? 1 : 0
          overflow += status === 'skipped' ? 1 : 0
          added.push( stored )
        }
      } )

      return overflow
    } )
  }

  recordCheck( id, {
    ...outcome.check,
    last_checked_at: now,
    last_error: null,
    last_skipped_count: skipped,
  } )

  await queueAutomatically( feed, added.filter( ( { status } ) => status === 'inbox' ) )

  return toPublicFeed( requireActiveFeed( id ) )
}

export const checkAllFeeds = async (): Promise< Feed[] > => {
  const checked: Feed[] = []

  for( const feed of listStoredFeeds().filter( ( { enabled } ) => enabled ) ) {
    checked.push( await checkFeed( feed.id ) )
  }

  return checked
}

export const checkDueFeeds = async (): Promise< number > => {
  const due = listDueFeeds(
    new Date().toISOString(),
    getFeedCheckInterval(),
  )
  let checked = 0

  for( const feed of due ) {
    try {
      await checkFeed( feed.id )
      checked += 1
    } catch( error ) {
      console.error( `Checking feed ${ feed.name } failed`, error )
    }
  }

  return checked
}
