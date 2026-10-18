// Node
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
// Errors
import { ValidationError } from '../errors.js'
// Clients
import { HttpStatusError } from '../clients/http.client.js'
// Sources
import {
  discoverFeed,
  itemKey,
  parseFeedXml,
  toFeedItem,
} from './feeds.js'

const fixture = ( name: string ): string => {
  return readFileSync( new URL( `../test-support/feeds/${ name }`, import.meta.url ), 'utf8' )
}

describe( 'parseFeedXml', () => {
  it( 'parses an RSS 2.0 blog with content:encoded', () => {
    const feed = parseFeedXml( fixture( 'rss-blog.xml' ) )

    expect( feed.title ).toBe( 'Example Blog' )
    expect( feed.items ).toHaveLength( 3 )
    expect( feed.items[ 0 ] ).toMatchObject( {
      guid: 'post-3',
      link: 'https://blog.example.com/posts/newest#comments',
      title: 'Newest post',
      published_at: '2026-10-15T09:00:00.000Z',
      author: 'Ada Lovelace',
    } )
    expect( feed.items[ 0 ]?.content_html ).toContain( 'Paragraph 0 of the full text' )
  } )

  it( 'drops an item with no link and gives null for a missing guid or a bad date', () => {
    const { items } = parseFeedXml( fixture( 'rss-blog.xml' ) )

    expect( items.map( ( { title } ) => title ) ).not.toContain( 'An item with no link' )
    expect( items[ 2 ] ).toMatchObject( { guid: null, published_at: null, author: null } )
  } )

  it( 'falls back to the description when an RSS item has no full text', () => {
    const { items } = parseFeedXml( fixture( 'rss-blog.xml' ) )

    expect( items[ 1 ] ).toMatchObject( {
      guid: 'https://blog.example.com/posts/middle',
      content_html: 'Just a teaser, no full text.',
    } )
    expect( items[ 2 ]?.content_html ).toBeNull()
  } )

  it( 'parses an Atom feed: alternate link, published over updated, author, content', () => {
    const feed = parseFeedXml( fixture( 'atom.xml' ) )

    expect( feed.title ).toBe( 'Atom Notes' )
    expect( feed.items[ 0 ] ).toMatchObject( {
      guid: 'tag:atom.example.com,2026:1',
      link: 'https://atom.example.com/1',
      title: 'First entry',
      published_at: '2026-10-10T08:00:00.000Z',
      author: 'Grace Hopper',
    } )
    expect( feed.items[ 0 ]?.content_html ).toContain( 'Paragraph 0 of the full text' )
  } )

  it( 'uses a link with no rel, updated when there is no published, and the summary', () => {
    const { items } = parseFeedXml( fixture( 'atom.xml' ) )

    expect( items[ 1 ] ).toMatchObject( {
      link: 'https://atom.example.com/2',
      published_at: '2026-10-09T08:00:00.000Z',
      content_html: 'Only a summary.',
    } )
  } )

  it( 'parses a Medium feed', () => {
    const feed = parseFeedXml( fixture( 'medium.xml' ) )

    expect( feed.title ).toBe( 'Stories by Grace on Medium' )
    expect( feed.items[ 0 ] ).toMatchObject( {
      guid: 'https://medium.com/p/abc123',
      title: 'Why I Stopped Using Frameworks',
      author: 'Grace Hopper',
      published_at: '2026-10-11T12:00:00.000Z',
    } )
  } )

  it( 'parses a Substack feed', () => {
    const feed = parseFeedXml( fixture( 'substack.xml' ) )

    expect( feed.title ).toBe( 'Notes on Work' )
    expect( feed.items[ 0 ] ).toMatchObject( {
      guid: '142857',
      link: 'https://notes.substack.com/p/habits',
      author: 'Alan Turing',
    } )
  } )

  it( 'parses a YouTube channel feed', () => {
    const feed = parseFeedXml( fixture( 'youtube.xml' ) )

    expect( feed.title ).toBe( 'Rust Channel' )
    expect( feed.items.map( ( { link } ) => link ) ).toEqual( [
      'https://www.youtube.com/watch?v=abc111',
      'https://www.youtube.com/watch?v=abc222',
    ] )
    expect( feed.items[ 0 ] ).toMatchObject( { guid: 'yt:video:abc111', author: 'Rust Channel' } )
  } )

  it( 'parses a JSON Feed', () => {
    const feed = parseFeedXml( fixture( 'json-feed.json' ) )

    expect( feed.title ).toBe( 'JSON Notes' )
    expect( feed.items[ 0 ] ).toMatchObject( {
      guid: 'j1',
      link: 'https://json.example.com/1',
      author: 'Jo',
      published_at: '2026-10-13T10:00:00.000Z',
      content_html: 'plain text body',
    } )
  } )

  it( 'parses an RDF feed', () => {
    const rdf = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel rdf:about="https://r.example"><title>RDF Notes</title><link>https://r.example</link></channel>
      <item rdf:about="https://r.example/1"><title>R one</title><link>https://r.example/1</link>
      <dc:creator>Rae</dc:creator><dc:date>2026-10-01T00:00:00Z</dc:date></item></rdf:RDF>`

    const feed = parseFeedXml( rdf )

    expect( feed.title ).toBe( 'RDF Notes' )
    expect( feed.items[ 0 ] ).toMatchObject( {
      link: 'https://r.example/1',
      title: 'R one',
      author: 'Rae',
      published_at: '2026-10-01T00:00:00.000Z',
    } )
  } )

  it( 'throws for HTML, empty text and other XML', () => {
    expect( () => parseFeedXml( fixture( 'not-a-feed.html' ) ) ).toThrow()
    expect( () => parseFeedXml( '' ) ).toThrow()
    expect( () => parseFeedXml( '<?xml version="1.0"?><note>hi</note>' ) ).toThrow()
  } )

  it( 'gives a feed with no items an empty list', () => {
    const xml = '<?xml version="1.0"?><rss version="2.0">'
      + '<channel><title>Empty</title></channel></rss>'

    expect( parseFeedXml( xml ) ).toEqual( { title: 'Empty', items: [] } )
  } )
} )

describe( 'itemKey', () => {
  const base = { guid: null, link: 'https://x.example/a#top', title: 'T', published_at: null }

  it( 'prefers the GUID or Atom id', () => {
    expect( itemKey( { ...base, guid: 'id-1' } ) ).toBe( 'id-1' )
  } )

  it( 'then the link without its fragment', () => {
    expect( itemKey( base ) ).toBe( 'https://x.example/a' )
  } )

  it( 'then a hash of the title and date', () => {
    const key = itemKey( { ...base, link: '', published_at: '2026-10-01T00:00:00.000Z' } )

    expect( key ).toMatch( /^[0-9a-f]{64}$/ )
    expect( key ).toBe( itemKey( { ...base, link: '', published_at: '2026-10-01T00:00:00.000Z' } ) )
    expect( key ).not.toBe( itemKey( { ...base, link: '', title: 'Other' } ) )
  } )

  it( 'keeps the same key when only the title is edited and a guid exists', () => {
    expect( itemKey( { ...base, guid: 'id-1', title: 'Edited' } ) ).toBe( 'id-1' )
  } )
} )

describe( 'toFeedItem', () => {
  const raw = ( overrides: Record< string, unknown > = {} ) => ( {
    guid: 'g',
    link: 'https://blog.example.com/p',
    title: 'T',
    published_at: '2026-10-01T00:00:00.000Z',
    author: 'Ada',
    content_html: null as string | null,
    ...overrides,
  } )
  const html = ( length: number ): string => `<p>${ 'x'.repeat( length ) }</p>`

  it( 'adds the key and the source type from the link', () => {
    expect( toFeedItem( raw() ) ).toMatchObject( { item_key: 'g', source_type: 'article' } )
    expect( toFeedItem( raw( { link: 'https://www.youtube.com/watch?v=a' } ) ).source_type )
      .toBe( 'video' )
  } )

  it( 'turns long enough full text into Markdown', () => {
    const item = toFeedItem( raw( { content_html: `<h2>Head</h2>${ html( 600 ) }` } ) )

    expect( item.content_markdown ).toContain( '## Head' )
  } )

  it( 'keeps no content that is under 500 or over 300,000 characters', () => {
    expect( toFeedItem( raw( { content_html: html( 100 ) } ) ).content_markdown ).toBeNull()
    expect( toFeedItem( raw( { content_html: html( 300_100 ) } ) ).content_markdown ).toBeNull()
    expect( toFeedItem( raw( { content_html: html( 500 ) } ) ).content_markdown ).not.toBeNull()
  } )

  it( 'keeps no content for a video item', () => {
    const item = toFeedItem( raw( {
      link: 'https://www.youtube.com/watch?v=a',
      content_html: html( 900 ),
    } ) )

    expect( item.content_markdown ).toBeNull()
  } )

  it( 'turns the Medium and Substack fixtures into clean text', () => {
    const medium = parseFeedXml( fixture( 'medium.xml' ) ).items[ 0 ]
    const substack = parseFeedXml( fixture( 'substack.xml' ) ).items[ 0 ]

    expect( toFeedItem( medium ).content_markdown )
      .toContain( 'Paragraph 5 of the full text' )
    expect( toFeedItem( substack ).content_markdown )
      .toContain( 'Paragraph 5 of the full text' )
  } )
} )

describe( 'discoverFeed', () => {
  let server: Server
  let base = ''
  let hits: string[] = []

  const files: Record< string, [ string, string ] > = {
    '/rss-blog.xml': [ 'rss-blog.xml', 'application/rss+xml; charset=utf-8' ],
    '/a/rss-blog.xml': [ 'rss-blog.xml', 'application/rss+xml' ],
    '/feeds/rss.xml': [ 'rss-blog.xml', 'application/rss+xml' ],
    '/atom.xml': [ 'atom.xml', 'application/atom+xml' ],
    '/a/discover-rss.html': [ 'discover-rss.html', 'text/html' ],
    '/a/discover-atom.html': [ 'discover-atom.html', 'text/html' ],
    '/a/b/discover-relative.html': [ 'discover-relative.html', 'text/html' ],
    '/discover-none.html': [ 'discover-none.html', 'text/html' ],
    '/discover-dead.html': [ 'discover-dead.html', 'text/html' ],
    '/not-a-feed.html': [ 'not-a-feed.html', 'text/html' ],
  }

  beforeEach( async () => {
    hits = []
    server = createServer( ( req, res ) => {
      const url = req.url ?? '/'

      hits.push( url )

      if( url === '/gone' ) {
        res.writeHead( 404 )
        res.end()

        return
      }

      const found = files[ url ]

      if( found === undefined ) {
        res.writeHead( 404 )
        res.end()

        return
      }

      res.setHeader( 'Content-Type', found[ 1 ] )
      res.setHeader( 'ETag', '"v1"' )
      res.end( fixture( found[ 0 ] ) )
    } )
    await new Promise< void >( ( resolve ) => {
      server.listen( 0, '127.0.0.1', resolve )
    } )
    base = `http://127.0.0.1:${ ( server.address() as AddressInfo ).port }`
  } )

  afterEach( async () => {
    server.closeAllConnections()
    await new Promise( ( resolve ) => server.close( resolve ) )
  } )

  it( 'uses a feed URL directly, with its title, items and validators', async () => {
    const found = await discoverFeed( `${ base }/rss-blog.xml` )

    expect( found ).toMatchObject( {
      feedUrl: `${ base }/rss-blog.xml`,
      title: 'Example Blog',
      etag: '"v1"',
    } )
    expect( found.items ).toHaveLength( 3 )
    expect( hits ).toEqual( [ '/rss-blog.xml' ] )
  } )

  it( 'follows the RSS alternate link of a page', async () => {
    const found = await discoverFeed( `${ base }/a/discover-rss.html` )

    expect( found.feedUrl ).toBe( `${ base }/feeds/rss.xml` )
    expect( found.title ).toBe( 'Example Blog' )
  } )

  it( 'follows an Atom alternate link', async () => {
    const found = await discoverFeed( `${ base }/a/discover-atom.html` )

    expect( found.feedUrl ).toBe( `${ base }/atom.xml` )
    expect( found.title ).toBe( 'Atom Notes' )
  } )

  it( 'takes the first alternate link and resolves a relative one against the page', async () => {
    const found = await discoverFeed( `${ base }/a/b/discover-relative.html` )

    expect( found.feedUrl ).toBe( `${ base }/a/rss-blog.xml` )
  } )

  it( 'refuses a page with no feed link', async () => {
    await expect( discoverFeed( `${ base }/discover-none.html` ) )
      .rejects.toThrow( new ValidationError( 'No feed found at this address' ) )
  } )

  it( 'refuses a page whose feed link is not a feed', async () => {
    await expect( discoverFeed( `${ base }/discover-dead.html` ) )
      .rejects.toThrow( 'No feed found at this address' )
  } )

  it( 'refuses an address that is neither a feed nor HTML', async () => {
    await expect( discoverFeed( `${ base }/not-a-feed.html` ) )
      .rejects.toThrow( 'No feed found at this address' )
  } )

  it( 'passes on the client error for a 404', async () => {
    await expect( discoverFeed( `${ base }/gone` ) ).rejects.toThrow( HttpStatusError )
  } )

  it( 'passes on the client error for an unreachable site', async () => {
    await new Promise( ( resolve ) => server.close( resolve ) )

    await expect( discoverFeed( `${ base }/rss-blog.xml` ) )
      .rejects.toThrow( "Couldn't reach the site" )
  } )
} )
