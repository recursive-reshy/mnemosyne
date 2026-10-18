// Node
import { readFileSync } from 'node:fs'
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
import {
  BadGatewayError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors.js'
// Clients
import { HttpStatusError, UnreachableError, fetchResource } from '../clients/http.client.js'
// Repositories
import {
  findFeedById,
  insertFeed,
  listFeeds as listStoredFeeds,
  markFeedDeleted,
} from '../repositories/feeds.repository.js'
import { findItemsByIds, listInbox } from '../repositories/feedItems.repository.js'
import { getDatabase } from '../repositories/database.js'
import { clearJobs } from '../repositories/jobStore.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import {
  checkAllFeeds,
  checkDueFeeds,
  checkFeed,
  createFeed,
  deleteFeed,
  listFeeds,
  previewFeed,
  updateFeed,
} from './feeds.service.js'
import { queueFeedItem } from './feedInbox.service.js'
import { listJobs } from './jobs.service.js'
import { listProfiles } from './prompts.service.js'

vi.mock( './feedInbox.service.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( './feedInbox.service.js' ) >()

  return { ...original, queueFeedItem: vi.fn( original.queueFeedItem ) }
} )
vi.mock( '../clients/http.client.js', async ( importOriginal ) => ( {
  ...await importOriginal< typeof import( '../clients/http.client.js' ) >(),
  fetchResource: vi.fn(),
} ) )

const fetchMock = vi.mocked( fetchResource )

const NOW = new Date( '2026-10-18T12:00:00.000Z' )
const feedUrl = 'https://blog.example.com/feed.xml'

const fixture = ( name: string ): string => {
  return readFileSync( new URL( `../test-support/feeds/${ name }`, import.meta.url ), 'utf8' )
}

// A feed of `count` items g0..g(count-1), newest first, each with its own link and date.
const rssWith = ( count: number, title = 'Generated' ): string => {
  const items = Array.from( { length: count }, ( _, index ) => {
    const day = String( 28 - index ).padStart( 2, '0' )

    return `<item><title>Item ${ index }</title><link>https://blog.example.com/p/${ index }</link>
      <guid>g${ index }</guid><pubDate>Mon, ${ day } Sep 2026 09:00:00 GMT</pubDate></item>`
  } )

  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${ title }</title>
    ${ items.join( '' ) }</channel></rss>`
}

interface Served {
  body?: string
  etag?: string
  error?: Error
}

const serve = ( pages: Record< string, Served > ): void => {
  fetchMock.mockImplementation( ( url, options ) => {
    const page = pages[ url ]

    if( page === undefined ) {
      return Promise.reject( new HttpStatusError( 404 ) )
    }

    if( page.error !== undefined ) {
      return Promise.reject( page.error )
    }

    if( page.etag !== undefined && options.etag === page.etag ) {
      return Promise.resolve( {
        status: 304,
        finalUrl: url,
        contentType: null,
        body: '',
        etag: page.etag,
        lastModified: null,
      } )
    }

    return Promise.resolve( {
      status: 200,
      finalUrl: url,
      contentType: 'application/rss+xml',
      body: page.body ?? '',
      etag: page.etag ?? null,
      lastModified: 'Sat, 17 Oct 2026 10:00:00 GMT',
    } )
  } )
}

const itemTitles = (): string[] => listInbox().map( ( { title } ) => title )

const statusesOf = ( feedId: string ): Record< string, number > => {
  const rows = getDatabase()
    .prepare( 'SELECT status, COUNT(*) AS count FROM feed_items WHERE feed_id = ? GROUP BY status' )
    .all( feedId ) as { status: string, count: number }[]

  return Object.fromEntries( rows.map( ( { status, count } ) => [ status, count ] ) )
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( NOW )
  fetchMock.mockReset()
  serve( { [ feedUrl ]: { body: fixture( 'rss-blog.xml' ), etag: '"v1"' } } )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'previewFeed', () => {
  it( 'returns the feed URL, its title and the newest item', async () => {
    expect( await previewFeed( feedUrl ) ).toEqual( {
      feed_url: feedUrl,
      title: 'Example Blog',
      latest_item: { title: 'Newest post', published_at: '2026-10-15T09:00:00.000Z' },
    } )
  } )

  it( 'takes the first item when none has a date, and null for an empty feed', async () => {
    serve( {
      [ feedUrl ]: {
        body: '<rss version="2.0"><channel><title>T</title><item><title>A</title>'
          + '<link>https://x.example/a</link></item></channel></rss>',
      },
      'https://empty.example/feed': {
        body: '<rss version="2.0"><channel><title>Empty</title></channel></rss>',
      },
    } )

    expect( ( await previewFeed( feedUrl ) ).latest_item )
      .toEqual( { title: 'A', published_at: null } )
    expect( ( await previewFeed( 'https://empty.example/feed' ) ).latest_item ).toBeNull()
  } )

  it( 'says there is no feed at an address that is not one', async () => {
    serve( { 'https://page.example/': { body: '<html><body>hi</body></html>' } } )

    await expect( previewFeed( 'https://page.example/' ) )
      .rejects.toThrow( new ValidationError( 'No feed found at this address' ) )
  } )

  it( 'passes on an unreachable site', async () => {
    serve( { [ feedUrl ]: { error: new UnreachableError() } } )

    await expect( previewFeed( feedUrl ) ).rejects.toThrow( BadGatewayError )
    await expect( previewFeed( feedUrl ) ).rejects.toThrow( "Couldn't reach the site" )
  } )
} )

describe( 'createFeed', () => {
  it( 'stores the feed with its title as the name and the check recorded', async () => {
    const feed = await createFeed( { url: feedUrl } )

    expect( feed ).toMatchObject( {
      url: feedUrl,
      feed_url: feedUrl,
      name: 'Example Blog',
      profile_id: null,
      enabled: true,
      auto_summarize: false,
      last_checked_at: NOW.toISOString(),
      last_error: null,
      last_skipped_count: 0,
      created_at: NOW.toISOString(),
    } )
    expect( findFeedById( feed.id ) ).toMatchObject( {
      etag: '"v1"',
      last_modified: 'Sat, 17 Oct 2026 10:00:00 GMT',
    } )
  } )

  it( 'keeps the address that was entered and the one the feed was found at', async () => {
    serve( {
      'https://blog.example.com/': {
        body: '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml">'
          + '</head></html>',
      },
      [ feedUrl ]: { body: fixture( 'rss-blog.xml' ) },
    } )

    const feed = await createFeed( { url: 'https://blog.example.com/' } )

    expect( feed ).toMatchObject( { url: 'https://blog.example.com/', feed_url: feedUrl } )
  } )

  it( 'uses the given name, profile and auto_summarize', async () => {
    const profile = listProfiles()[ 1 ]?.id ?? ''

    const feed = await createFeed( { url: feedUrl, name: 'Mine', profile_id: profile } )

    expect( feed ).toMatchObject( { name: 'Mine', profile_id: profile } )
  } )

  it( 'stores the current items as baseline, the newest going to the inbox', async () => {
    const feed = await createFeed( { url: feedUrl } )

    expect( statusesOf( feed.id ) ).toEqual( { baseline: 2, inbox: 1 } )
    expect( itemTitles() ).toEqual( [ 'Newest post' ] )
    expect( feed.inbox_count ).toBe( 1 )
  } )

  it( 'keeps full text only for the item in the inbox', async () => {
    const feed = await createFeed( { url: feedUrl } )
    const rows = getDatabase()
      .prepare( 'SELECT status, content_markdown FROM feed_items WHERE feed_id = ?' )
      .all( feed.id ) as { status: string, content_markdown: string | null }[]

    const withText = rows.filter( ( { content_markdown } ) => content_markdown !== null )

    expect( withText.map( ( { status } ) => status ) ).toEqual( [ 'inbox' ] )
    expect( withText[ 0 ]?.content_markdown ).toContain( 'Paragraph 0' )
  } )

  it( 'works for a feed with no items', async () => {
    const body = '<rss version="2.0"><channel><title>E</title></channel></rss>'
    serve( { [ feedUrl ]: { body } } )

    const feed = await createFeed( { url: feedUrl } )

    expect( feed.inbox_count ).toBe( 0 )
    expect( statusesOf( feed.id ) ).toEqual( {} )
  } )

  it( 'refuses a second active feed with the same feed URL', async () => {
    await createFeed( { url: feedUrl } )

    await expect( createFeed( { url: feedUrl } ) ).rejects.toThrow( ConflictError )
  } )

  it( 'allows the feed again once the first one was deleted', async () => {
    const first = await createFeed( { url: feedUrl } )
    deleteFeed( first.id, { removeInboxItems: false } )

    await expect( createFeed( { url: feedUrl } ) )
      .resolves.toMatchObject( { name: 'Example Blog' } )
  } )

  it( 'refuses a profile that does not exist, and stores nothing', async () => {
    await expect( createFeed( { url: feedUrl, profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
    expect( listStoredFeeds() ).toEqual( [] )
  } )

  it( 'stores nothing when the address has no feed or is unreachable', async () => {
    serve( { [ feedUrl ]: { error: new UnreachableError() } } )

    await expect( createFeed( { url: feedUrl } ) ).rejects.toThrow( BadGatewayError )
    expect( listStoredFeeds() ).toEqual( [] )
  } )
} )

describe( 'listFeeds, updateFeed and deleteFeed', () => {
  it( 'lists active feeds by name with their inbox counts', async () => {
    const one = await createFeed( { url: feedUrl, name: 'b feed' } )
    serve( { 'https://two.example/feed': { body: rssWith( 3 ) } } )
    await createFeed( { url: 'https://two.example/feed', name: 'a feed' } )

    expect( listFeeds().map( ( { name, inbox_count } ) => [ name, inbox_count ] ) )
      .toEqual( [ [ 'a feed', 1 ], [ 'b feed', 1 ] ] )
    deleteFeed( one.id, { removeInboxItems: true } )
    expect( listFeeds().map( ( { name } ) => name ) ).toEqual( [ 'a feed' ] )
  } )

  it( 'updates the name, profile, enabled and auto_summarize', async () => {
    const feed = await createFeed( { url: feedUrl } )
    const profile = listProfiles()[ 0 ]?.id ?? ''

    const updated = updateFeed( feed.id, {
      name: 'Renamed',
      profile_id: profile,
      enabled: false,
      auto_summarize: true,
    } )

    expect( updated ).toMatchObject( {
      name: 'Renamed',
      profile_id: profile,
      enabled: false,
      auto_summarize: true,
    } )
    expect( updateFeed( feed.id, { profile_id: null } ).profile_id ).toBeNull()
  } )

  it( 'refuses an unknown profile and an unknown or deleted feed', async () => {
    const feed = await createFeed( { url: feedUrl } )

    expect( () => updateFeed( feed.id, { profile_id: crypto.randomUUID() } ) )
      .toThrow( ValidationError )
    expect( () => updateFeed( crypto.randomUUID(), { name: 'x' } ) ).toThrow( NotFoundError )

    deleteFeed( feed.id, { removeInboxItems: false } )

    expect( () => updateFeed( feed.id, { name: 'x' } ) ).toThrow( NotFoundError )
  } )

  it( 'soft-deletes a feed and leaves its inbox items when asked to', async () => {
    const feed = await createFeed( { url: feedUrl } )

    deleteFeed( feed.id, { removeInboxItems: false } )

    expect( findFeedById( feed.id )?.deleted_at ).toBe( NOW.toISOString() )
    expect( itemTitles() ).toEqual( [ 'Newest post' ] )
  } )

  it( 'dismisses its inbox items when asked to', async () => {
    const feed = await createFeed( { url: feedUrl } )

    deleteFeed( feed.id, { removeInboxItems: true } )

    expect( itemTitles() ).toEqual( [] )
    expect( statusesOf( feed.id ) ).toEqual( { baseline: 2, dismissed: 1 } )
  } )

  it( 'throws NotFoundError for an unknown feed', () => {
    expect( () => deleteFeed( crypto.randomUUID(), { removeInboxItems: false } ) )
      .toThrow( NotFoundError )
  } )
} )

describe( 'checkFeed', () => {
  const afterBaseline = async ( count = 3 ) => {
    serve( { [ feedUrl ]: { body: rssWith( count ), etag: '"v1"' } } )
    const feed = await createFeed( { url: feedUrl } )
    vi.setSystemTime( new Date( NOW.getTime() + 3_600_000 ) )

    return feed
  }

  it( 'sends the stored ETag and Last-Modified', async () => {
    const feed = await afterBaseline()
    fetchMock.mockClear()

    await checkFeed( feed.id )

    expect( fetchMock ).toHaveBeenCalledWith( feedUrl, expect.objectContaining( {
      etag: '"v1"',
      lastModified: 'Sat, 17 Oct 2026 10:00:00 GMT',
    } ) )
  } )

  it( 'records only the check on a 304', async () => {
    const feed = await afterBaseline()
    const before = statusesOf( feed.id )

    const checked = await checkFeed( feed.id )

    expect( checked.last_checked_at ).toBe( new Date( NOW.getTime() + 3_600_000 ).toISOString() )
    expect( checked.last_error ).toBeNull()
    expect( statusesOf( feed.id ) ).toEqual( before )
  } )

  it( 'adds only the items it has not seen, to the inbox', async () => {
    const feed = await afterBaseline( 3 )
    serve( { [ feedUrl ]: { body: rssWith( 5 ), etag: '"v2"' } } )

    const checked = await checkFeed( feed.id )

    expect( statusesOf( feed.id ) ).toEqual( { baseline: 2, inbox: 3 } )
    expect( checked.inbox_count ).toBe( 3 )
    expect( findFeedById( feed.id )?.etag ).toBe( '"v2"' )
  } )

  it( 'lists the inbox in feed order, newest first, when several arrive together', async () => {
    const feed = await afterBaseline( 3 )
    serve( { [ feedUrl ]: { body: rssWith( 5 ), etag: '"v2"' } } )
    await checkFeed( feed.id )

    expect( itemTitles().slice( 0, 2 ) ).toEqual( [ 'Item 3', 'Item 4' ] )
  } )

  it( 'never adds an item again, even when the feed reorders or edits it', async () => {
    const feed = await afterBaseline( 3 )
    const edited = rssWith( 3 ).replace( 'Item 0', 'Item 0 (edited)' )
    const reordered = edited.replace( /(<item>.*?<\/item>)(<item>.*?<\/item>)/s, '$2$1' )
    serve( { [ feedUrl ]: { body: reordered, etag: '"v2"' } } )

    await checkFeed( feed.id )

    expect( statusesOf( feed.id ) ).toEqual( { baseline: 2, inbox: 1 } )
  } )

  it( 'does not bring back an item that was dismissed', async () => {
    const feed = await afterBaseline( 3 )
    const [ item ] = listInbox()
    getDatabase().prepare( 'UPDATE feed_items SET status = \'dismissed\' WHERE id = ?' )
      .run( item?.id )
    serve( { [ feedUrl ]: { body: rssWith( 3 ), etag: '"v2"' } } )

    await checkFeed( feed.id )

    expect( findItemsByIds( [ item?.id ?? '' ] )[ 0 ]?.status ).toBe( 'dismissed' )
    expect( listInbox() ).toEqual( [] )
  } )

  it( 'puts at most 10 new items in the inbox and marks the rest skipped', async () => {
    const feed = await afterBaseline( 2 )
    serve( { [ feedUrl ]: { body: rssWith( 16 ), etag: '"v2"' } } )

    const checked = await checkFeed( feed.id )

    // The baseline's newest item is already in the inbox, so 11 in all.
    expect( statusesOf( feed.id ) ).toEqual( { baseline: 1, inbox: 11, skipped: 4 } )
    expect( checked.last_skipped_count ).toBe( 4 )
    expect( checked.inbox_count ).toBe( 11 )
  } )

  it( 'resets the skipped count on a check with no overflow', async () => {
    const feed = await afterBaseline( 2 )
    serve( { [ feedUrl ]: { body: rssWith( 16 ), etag: '"v2"' } } )
    await checkFeed( feed.id )
    serve( { [ feedUrl ]: { body: rssWith( 17 ), etag: '"v3"' } } )

    expect( ( await checkFeed( feed.id ) ).last_skipped_count ).toBe( 0 )
  } )

  it( 'keeps full text only for items that went to the inbox', async () => {
    const feed = await afterBaseline( 2 )
    const long = `<content:encoded><![CDATA[<p>${ 'word '.repeat( 150 ) }</p>]]></content:encoded>`
    const body = rssWith( 14 )
      .replace( '<rss version="2.0">', '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">' )
      .replace( /<\/item>/g, `${ long }</item>` )
    serve( { [ feedUrl ]: { body, etag: '"v2"' } } )

    await checkFeed( feed.id )

    const withContent = getDatabase()
      .prepare( `SELECT status, COUNT(*) AS count FROM feed_items
        WHERE content_markdown IS NOT NULL GROUP BY status` )
      .all()

    expect( withContent ).toEqual( [ { status: 'inbox', count: 10 } ] )
  } )

  it( 'records the error, the time and nothing else when the fetch fails', async () => {
    const feed = await afterBaseline( 3 )
    serve( { [ feedUrl ]: { error: new HttpStatusError( 500 ) } } )

    const checked = await checkFeed( feed.id )

    expect( checked ).toMatchObject( {
      last_error: 'The site answered 500',
      last_checked_at: new Date( NOW.getTime() + 3_600_000 ).toISOString(),
    } )
    expect( findFeedById( feed.id )?.etag ).toBe( '"v1"' )
    expect( statusesOf( feed.id ) ).toEqual( { baseline: 2, inbox: 1 } )
  } )

  it( 'records an error when the body is no longer a feed', async () => {
    const feed = await afterBaseline( 3 )
    serve( { [ feedUrl ]: { body: '<html>moved</html>' } } )

    expect( ( await checkFeed( feed.id ) ).last_error ).toBe( 'No feed found at this address' )
  } )

  it( 'clears the error after a good check', async () => {
    const feed = await afterBaseline( 3 )
    serve( { [ feedUrl ]: { error: new HttpStatusError( 500 ) } } )
    await checkFeed( feed.id )
    serve( { [ feedUrl ]: { body: rssWith( 3 ), etag: '"v2"' } } )

    expect( ( await checkFeed( feed.id ) ).last_error ).toBeNull()
  } )

  it( 'refuses a feed that is turned off or deleted, and an unknown one', async () => {
    const feed = await afterBaseline()
    updateFeed( feed.id, { enabled: false } )

    await expect( checkFeed( feed.id ) ).rejects.toThrow( ConflictError )

    deleteFeed( feed.id, { removeInboxItems: false } )

    await expect( checkFeed( feed.id ) ).rejects.toThrow( NotFoundError )
    await expect( checkFeed( crypto.randomUUID() ) ).rejects.toThrow( NotFoundError )
  } )
} )

describe( 'checkAllFeeds and checkDueFeeds', () => {
  const addFeed = ( id: string, url: string, overrides = {} ): void => {
    insertFeed( {
      id,
      url,
      feed_url: url,
      name: id,
      profile_id: null,
      enabled: true,
      auto_summarize: false,
      etag: null,
      last_modified: null,
      last_checked_at: null,
      last_error: null,
      last_skipped_count: 0,
      created_at: NOW.toISOString(),
      deleted_at: null,
      ...overrides,
    } )
  }

  beforeEach( () => {
    serve( {
      'https://a.example/f': { body: rssWith( 2 ) },
      'https://b.example/f': { error: new UnreachableError() },
      'https://c.example/f': { body: rssWith( 2 ) },
    } )
  } )

  it( 'checks every enabled feed, whether due or not, and skips the others', async () => {
    addFeed( 'a', 'https://a.example/f', { last_checked_at: NOW.toISOString() } )
    addFeed( 'c', 'https://c.example/f', { enabled: false } )
    addFeed( 'd', 'https://d.example/f', { deleted_at: NOW.toISOString() } )

    const feeds = await checkAllFeeds()

    expect( fetchMock ).toHaveBeenCalledTimes( 1 )
    expect( feeds.map( ( { id } ) => id ) ).toEqual( [ 'a' ] )
  } )

  it( 'checks the due feeds one at a time, the least recently checked first', async () => {
    setSetting( 'feed_check_interval_minutes', 60 )
    const old = new Date( NOW.getTime() - 3 * 3_600_000 ).toISOString()
    const older = new Date( NOW.getTime() - 5 * 3_600_000 ).toISOString()
    addFeed( 'a', 'https://a.example/f', { last_checked_at: old } )
    addFeed( 'c', 'https://c.example/f', { last_checked_at: older } )
    addFeed( 'e', 'https://a.example/f2', { last_checked_at: NOW.toISOString() } )

    expect( await checkDueFeeds() ).toBe( 2 )

    expect( fetchMock.mock.calls.map( ( [ url ] ) => url ) )
      .toEqual( [ 'https://c.example/f', 'https://a.example/f' ] )
  } )

  it( 'reads the interval from the settings every time', async () => {
    const checked = new Date( NOW.getTime() - 30 * 60_000 ).toISOString()
    addFeed( 'a', 'https://a.example/f', { last_checked_at: checked } )

    setSetting( 'feed_check_interval_minutes', 60 )

    expect( await checkDueFeeds() ).toBe( 0 )

    setSetting( 'feed_check_interval_minutes', 15 )

    expect( await checkDueFeeds() ).toBe( 1 )
  } )

  it( 'does not let one failing feed stop the rest', async () => {
    addFeed( 'b', 'https://b.example/f' )
    addFeed( 'c', 'https://c.example/f' )

    expect( await checkDueFeeds() ).toBe( 2 )

    expect( findFeedById( 'b' )?.last_error ).toBe( "Couldn't reach the site" )
    expect( findFeedById( 'c' ) ).toMatchObject( { last_error: null } )
    expect( findFeedById( 'c' )?.last_checked_at ).toBe( NOW.toISOString() )
  } )

  it( 'keeps going when a deleted feed is in the way', async () => {
    addFeed( 'a', 'https://a.example/f' )
    markFeedDeleted( 'a', NOW.toISOString() )

    expect( await checkDueFeeds() ).toBe( 0 )
  } )
} )

describe( 'automatic feeds', () => {
  beforeEach( () => {
    clearJobs()
  } )

  const longItem = ( index: number ): string => {
    const day = String( 28 - index ).padStart( 2, '0' )

    return `<item><title>Item ${ index }</title><link>https://blog.example.com/p/${ index }</link>
      <guid>g${ index }</guid><pubDate>Mon, ${ day } Sep 2026 09:00:00 GMT</pubDate>
      <content:encoded><![CDATA[<p>${ 'word '.repeat( 150 ) }</p>]]></content:encoded></item>`
  }

  const richFeed = ( count: number ): string => {
    return '<?xml version="1.0"?><rss version="2.0" '
      + 'xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Auto</title>'
      + `${ Array.from( { length: count }, ( _, index ) => longItem( index ) ).join( '' ) }`
      + '</channel></rss>'
  }

  it( 'queues the newest item of a new automatic feed, not the inbox', async () => {
    serve( { [ feedUrl ]: { body: richFeed( 3 ) } } )

    const feed = await createFeed( { url: feedUrl, auto_summarize: true } )

    expect( feed.inbox_count ).toBe( 0 )
    expect( statusesOf( feed.id ) ).toEqual( { baseline: 2, queued: 1 } )
    expect( listJobs() ).toHaveLength( 1 )
    expect( listJobs()[ 0 ] ).toMatchObject( {
      status: 'summarizing',
      source_type: 'article',
      feed_id: feed.id,
      title: 'Item 0',
    } )
  } )

  it( 'queues new items on a check, still capped at 10 per check', async () => {
    serve( { [ feedUrl ]: { body: richFeed( 2 ), etag: '"v1"' } } )
    const feed = await createFeed( { url: feedUrl, auto_summarize: true } )
    clearJobs()
    serve( { [ feedUrl ]: { body: richFeed( 16 ), etag: '"v2"' } } )

    const checked = await checkFeed( feed.id )

    expect( checked ).toMatchObject( { inbox_count: 0, last_skipped_count: 4 } )
    expect( statusesOf( feed.id ) ).toEqual( { baseline: 1, queued: 11, skipped: 4 } )
    expect( listJobs() ).toHaveLength( 10 )
  } )

  it( 'leaves items in the inbox for a feed that is not automatic', async () => {
    serve( { [ feedUrl ]: { body: richFeed( 3 ) } } )

    await createFeed( { url: feedUrl } )

    expect( listJobs() ).toEqual( [] )
  } )

  it( 'leaves an item in the inbox, and says so in the log, when it cannot be queued', async () => {
    serve( { [ feedUrl ]: { body: richFeed( 3 ) } } )
    const errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
    vi.mocked( queueFeedItem ).mockRejectedValueOnce( new Error( 'boom' ) )

    const feed = await createFeed( { url: feedUrl, auto_summarize: true } )

    expect( feed.inbox_count ).toBe( 1 )
    expect( errorSpy ).toHaveBeenCalledOnce()
    expect( listJobs() ).toEqual( [] )
  } )
} )
