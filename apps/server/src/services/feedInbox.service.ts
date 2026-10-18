// Shared
import { detectSourceType } from '@mnemosyne/shared'
import type {
  FeedItem,
  Job,
  SummarizeFeedItemsBody,
  SummarizeFeedItemsResponse,
} from '@mnemosyne/shared'
// Errors
import { ConflictError, ValidationError } from '../errors.js'
// Repositories
import {
  findItemsByIds,
  listInbox as listInboxRows,
  setItemStatus,
} from '../repositories/feedItems.repository.js'
import type { StoredFeedItem } from '../repositories/feedItems.repository.js'
import { findFeedById } from '../repositories/feeds.repository.js'
import type { StoredFeed } from '../repositories/feeds.repository.js'
// Sources
import { articleFromText } from '../sources/text.js'
// Services
import { queueJob } from './jobs.service.js'
import { assertKnownModel } from './models.service.js'
import { assertActiveProfile } from './prompts.service.js'

interface Choices {
  model?: string | undefined
  profile_id?: string | undefined
}

// A feed's profile may have been deleted since it was chosen; the default takes over then.
const feedProfile = ( feed: StoredFeed ): string | undefined => {
  if( feed.profile_id === null ) {
    return undefined
  }

  try {
    assertActiveProfile( feed.profile_id )

    return feed.profile_id
  } catch( error ) {
    if( error instanceof ValidationError ) {
      return undefined
    }

    throw error
  }
}

export const queueFeedItem = async (
  feed: StoredFeed,
  item: StoredFeedItem,
  choices: Choices = {},
): Promise< Job > => {
  const profile = choices.profile_id ?? feedProfile( feed )
  const body = {
    url: item.link,
    ...choices.model === undefined ? {} : { model: choices.model },
    ...profile === undefined ? {} : { profile_id: profile },
  }
  const isFullText = item.content_markdown !== null && detectSourceType( item.link ) === 'article'
  const document = isFullText
    ? articleFromText( {
      url: item.link,
      text: item.content_markdown ?? '',
      title: item.title,
      origin: 'feed',
      author: item.author,
      site: feed.name,
      published: item.published_at?.slice( 0, 10 ) ?? null,
    } )
    : undefined

  const extra = { feed_id: feed.id, ...document === undefined ? {} : { document } }
  const job = await queueJob( body, extra )

  setItemStatus( [ item.id ], 'queued', job.id )

  return job
}

export const listInbox = (): FeedItem[] => {
  return listInboxRows().map( ( item ) => ( {
    id: item.id,
    feed_id: item.feed_id,
    feed_name: item.feed_name,
    title: item.title,
    link: item.link,
    published_at: item.published_at,
    source_type: detectSourceType( item.link ),
    added_at: item.added_at,
  } ) )
}

export const summarizeItems = async (
  { ids, model, profile_id }: SummarizeFeedItemsBody,
): Promise< SummarizeFeedItemsResponse > => {
  const unique = [ ...new Set( ids ) ]
  const found = findItemsByIds( unique )
  const inbox = new Map(
    found.filter( ( { status } ) => status === 'inbox' ).map( ( item ) => [ item.id, item ] ),
  )
  const bad = unique.filter( ( id ) => !inbox.has( id ) )

  if( bad.length > 0 ) {
    throw new ConflictError( `Not in the inbox: ${ bad.join( ', ' ) }` )
  }

  if( model !== undefined ) {
    await assertKnownModel( model )
  }

  if( profile_id !== undefined ) {
    assertActiveProfile( profile_id )
  }

  const jobs: Job[] = []

  for( const id of unique ) {
    const item = inbox.get( id )
    const feed = item === undefined ? undefined : findFeedById( item.feed_id )

    if( item !== undefined && feed !== undefined ) {
      jobs.push( await queueFeedItem( feed, item, { model, profile_id } ) )
    }
  }

  return { jobs }
}

export const dismissItems = ( ids: string[] ): void => {
  const inbox = findItemsByIds( ids ).filter( ( { status } ) => status === 'inbox' )

  setItemStatus( inbox.map( ( { id } ) => id ), 'dismissed' )
}
