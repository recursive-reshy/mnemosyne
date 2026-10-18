// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Errors
import { ConflictError, ValidationError } from '../errors.js'
// Repositories
import { clearJobs, findJobById } from '../repositories/jobStore.repository.js'
import { insertFeed } from '../repositories/feeds.repository.js'
import { findItemsByIds, insertItemIfNew } from '../repositories/feedItems.repository.js'
import type { StoredFeedItem } from '../repositories/feedItems.repository.js'
// Services
import { dismissItems, listInbox, summarizeItems } from './feedInbox.service.js'
import { listJobs } from './jobs.service.js'
import { assertKnownModel } from './models.service.js'
import {
  createProfile,
  deleteProfile,
  listProfiles,
} from './prompts.service.js'

vi.mock( './models.service.js' )

const assertKnownModelMock = vi.mocked( assertKnownModel )

const NOW = new Date( '2026-10-18T12:00:00.000Z' )
const feedId = crypto.randomUUID()
const longText = `# Full text\n\n${ 'Words from the feed. '.repeat( 40 ) }`

const addFeed = ( id = feedId, profileId: string | null = null, name = 'A blog' ): void => {
  insertFeed( {
    id,
    url: 'https://blog.example.com',
    feed_url: `https://blog.example.com/${ id }.xml`,
    name,
    profile_id: profileId,
    enabled: true,
    auto_summarize: false,
    etag: null,
    last_modified: null,
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: NOW.toISOString(),
    deleted_at: null,
  } )
}

const addItem = ( overrides: Partial< StoredFeedItem > = {} ): StoredFeedItem => {
  const id = overrides.id ?? crypto.randomUUID()
  const item: StoredFeedItem = {
    id,
    feed_id: feedId,
    item_key: `key-${ id }`,
    title: 'A post',
    link: 'https://blog.example.com/posts/a',
    published_at: '2026-10-15T09:00:00.000Z',
    author: 'Ada',
    content_markdown: null,
    status: 'inbox',
    job_id: null,
    added_at: NOW.toISOString(),
    ...overrides,
  }

  insertItemIfNew( item )

  return item
}

const status = ( id: string ): string | undefined => findItemsByIds( [ id ] )[ 0 ]?.status

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( NOW )
  clearJobs()
  assertKnownModelMock.mockReset()
  assertKnownModelMock.mockResolvedValue( undefined )
  addFeed()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'listInbox', () => {
  it( 'lists inbox items as feed items with the feed name and a source type', () => {
    const article = addItem( { title: 'Post', added_at: '2026-10-18T11:00:00.000Z' } )
    const video = addItem( {
      title: 'Video',
      link: 'https://www.youtube.com/watch?v=abc',
      added_at: '2026-10-18T11:30:00.000Z',
    } )
    addItem( { status: 'dismissed' } )

    expect( listInbox() ).toEqual( [
      {
        id: video.id,
        feed_id: feedId,
        feed_name: 'A blog',
        title: 'Video',
        link: 'https://www.youtube.com/watch?v=abc',
        published_at: '2026-10-15T09:00:00.000Z',
        source_type: 'video',
        added_at: '2026-10-18T11:30:00.000Z',
      },
      expect.objectContaining( { id: article.id, source_type: 'article' } ),
    ] )
  } )
} )

describe( 'summarizeItems', () => {
  it( 'queues an article item for fetching and marks it queued with its job', async () => {
    const item = addItem()

    const [ job ] = ( await summarizeItems( { ids: [ item.id ] } ) ).jobs

    expect( job ).toMatchObject( {
      url: item.link,
      status: 'queued',
      source_type: 'article',
      feed_id: feedId,
      feed_name: 'A blog',
      prompt_profile_id: null,
      summary_model: null,
    } )
    expect( findItemsByIds( [ item.id ] )[ 0 ] ).toMatchObject( {
      status: 'queued',
      job_id: job?.id,
    } )
  } )

  it( 'queues a video item for download', async () => {
    const item = addItem( { link: 'https://www.youtube.com/watch?v=abc' } )

    const { jobs } = await summarizeItems( { ids: [ item.id ] } )

    expect( jobs[ 0 ] ).toMatchObject( { status: 'queued', source_type: 'video' } )
  } )

  it( 'turns an item with full text into a job that is already summarizing', async () => {
    const item = addItem( { content_markdown: longText, title: 'Full post', author: 'Ada' } )

    const { jobs } = await summarizeItems( { ids: [ item.id ] } )

    expect( jobs[ 0 ] ).toMatchObject( { status: 'summarizing', title: 'Full post' } )
    expect( findJobById( jobs[ 0 ]?.id ?? '' )?.source_document ).toEqual( {
      kind: 'article',
      meta: {
        title: 'Full post',
        source: item.link,
        author: 'Ada',
        site: 'A blog',
        published: '2026-10-15',
        fetched_at: NOW.toISOString(),
        origin: 'feed',
      },
      markdown: longText.trim(),
    } )
    expect( findItemsByIds( [ item.id ] )[ 0 ]?.content_markdown ).toBeNull()
  } )

  it( 'handles several items at once, in the order given', async () => {
    const one = addItem( { title: 'One' } )
    const two = addItem( { title: 'Two', link: 'https://www.youtube.com/watch?v=b' } )

    const { jobs } = await summarizeItems( { ids: [ two.id, one.id ] } )

    expect( jobs.map( ( { url } ) => url ) ).toEqual( [ two.link, one.link ] )
    expect( [ status( one.id ), status( two.id ) ] ).toEqual( [ 'queued', 'queued' ] )
  } )

  describe( 'profile and model', () => {
    const profiles = () => {
      const other = createProfile( { name: 'Feed profile', guidance: 'Be brief.' } )

      return { feedProfile: other.id, bodyProfile: listProfiles()[ 0 ]?.id ?? '' }
    }

    it( 'uses the profile in the body first', async () => {
      const { feedProfile, bodyProfile } = profiles()
      const feed = crypto.randomUUID()
      addFeed( feed, feedProfile, 'Other' )
      const item = addItem( { feed_id: feed } )

      const { jobs } = await summarizeItems( { ids: [ item.id ], profile_id: bodyProfile } )

      expect( jobs[ 0 ]?.prompt_profile_id ).toBe( bodyProfile )
    } )

    it( 'then the profile of the feed', async () => {
      const { feedProfile } = profiles()
      const feed = crypto.randomUUID()
      addFeed( feed, feedProfile, 'Other' )
      const item = addItem( { feed_id: feed } )

      const { jobs } = await summarizeItems( { ids: [ item.id ] } )

      expect( jobs[ 0 ]?.prompt_profile_id ).toBe( feedProfile )
    } )

    it( 'then none, which means the default', async () => {
      const item = addItem()

      expect( ( await summarizeItems( { ids: [ item.id ] } ) ).jobs[ 0 ]?.prompt_profile_id )
        .toBeNull()
    } )

    it( 'falls back to the default when the feed profile was deleted', async () => {
      const { feedProfile } = profiles()
      const feed = crypto.randomUUID()
      addFeed( feed, feedProfile, 'Other' )
      deleteProfile( feedProfile )
      const item = addItem( { feed_id: feed } )

      const { jobs } = await summarizeItems( { ids: [ item.id ] } )

      expect( jobs[ 0 ]?.prompt_profile_id ).toBeNull()
    } )

    it( 'uses the model in the body and none otherwise', async () => {
      const one = addItem()
      const two = addItem()

      const { jobs } = await summarizeItems( { ids: [ one.id ], model: 'claude-opus-5-5' } )

      expect( jobs[ 0 ]?.summary_model ).toBe( 'claude-opus-5-5' )
      expect( ( await summarizeItems( { ids: [ two.id ] } ) ).jobs[ 0 ]?.summary_model ).toBeNull()
    } )
  } )

  describe( 'all or nothing', () => {
    it( 'refuses ids that are not in the inbox, naming them, and queues nothing', async () => {
      const good = addItem()
      const dismissed = addItem( { status: 'dismissed' } )
      const unknown = crypto.randomUUID()

      const failure = summarizeItems( { ids: [ good.id, dismissed.id, unknown ] } )

      await expect( failure ).rejects.toThrow( ConflictError )
      await expect( failure ).rejects.toThrow( dismissed.id )
      await expect( failure ).rejects.toThrow( unknown )
      expect( listJobs() ).toEqual( [] )
      expect( status( good.id ) ).toBe( 'inbox' )
    } )

    it( 'refuses an unknown model before queueing anything', async () => {
      const one = addItem()
      const two = addItem()
      assertKnownModelMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

      await expect( summarizeItems( { ids: [ one.id, two.id ], model: 'nope' } ) )
        .rejects.toThrow( ValidationError )

      expect( listJobs() ).toEqual( [] )
      expect( [ status( one.id ), status( two.id ) ] ).toEqual( [ 'inbox', 'inbox' ] )
    } )

    it( 'refuses an unknown profile before queueing anything', async () => {
      const one = addItem()

      await expect( summarizeItems( { ids: [ one.id ], profile_id: crypto.randomUUID() } ) )
        .rejects.toThrow( ValidationError )

      expect( listJobs() ).toEqual( [] )
      expect( status( one.id ) ).toBe( 'inbox' )
    } )

    it( 'does not queue an item twice when the same id is sent twice', async () => {
      const one = addItem()

      const { jobs } = await summarizeItems( { ids: [ one.id, one.id ] } )

      expect( jobs ).toHaveLength( 1 )
    } )
  } )
} )

describe( 'dismissItems', () => {
  it( 'dismisses inbox items and drops their full text', () => {
    const one = addItem( { content_markdown: longText } )

    dismissItems( [ one.id ] )

    expect( findItemsByIds( [ one.id ] )[ 0 ] ).toMatchObject( {
      status: 'dismissed',
      content_markdown: null,
    } )
  } )

  it( 'ignores ids that are not in the inbox', () => {
    const queued = addItem( { status: 'queued' } )
    const baseline = addItem( { status: 'baseline' } )

    expect( () => dismissItems( [ queued.id, baseline.id, crypto.randomUUID() ] ) )
      .not.toThrow()
    expect( [ status( queued.id ), status( baseline.id ) ] ).toEqual( [ 'queued', 'baseline' ] )
  } )
} )
