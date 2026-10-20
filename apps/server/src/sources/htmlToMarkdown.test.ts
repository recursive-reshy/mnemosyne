// Packages
import { describe, it, expect } from 'vitest'
// Sources
import { htmlToMarkdown } from './htmlToMarkdown.js'

describe( 'htmlToMarkdown', () => {
  it( 'writes headings in ATX style', () => {
    expect( htmlToMarkdown( '<h1>One</h1><h2>Two</h2><h3>Three</h3>' ) )
      .toBe( '# One\n\n## Two\n\n### Three' )
  } )

  it( 'writes bullet lists with a dash and numbered lists with numbers', () => {
    expect( htmlToMarkdown( '<ul><li>a</li><li>b</li></ul>' ) ).toBe( '-   a\n-   b' )
    expect( htmlToMarkdown( '<ol><li>a</li><li>b</li></ol>' ) ).toBe( '1.  a\n2.  b' )
  } )

  it( 'writes emphasis with asterisks and strong with double asterisks', () => {
    expect( htmlToMarkdown( '<p><em>soft</em> and <strong>hard</strong></p>' ) )
      .toBe( '*soft* and **hard**' )
  } )

  it( 'keeps links with their href', () => {
    expect( htmlToMarkdown( '<p>See <a href="https://example.com/a">this page</a>.</p>' ) )
      .toBe( 'See [this page](https://example.com/a).' )
  } )

  it( 'writes code blocks fenced', () => {
    expect( htmlToMarkdown( '<pre><code>const a = 1</code></pre>' ) )
      .toBe( '```\nconst a = 1\n```' )
  } )

  it( 'keeps inline code and block quotes', () => {
    const html = '<p>Use <code>fetch</code>.</p><blockquote><p>Quoted</p></blockquote>'

    expect( htmlToMarkdown( html ) ).toBe( 'Use `fetch`.\n\n> Quoted' )
  } )

  it.each( [
    [ 'img', '<p>a<img src="x.png" alt="pic">b</p>' ],
    [ 'picture', '<p>a<picture><source srcset="x.webp"><img src="x.png"></picture>b</p>' ],
    [ 'iframe', '<p>a<iframe src="https://example.com"></iframe>b</p>' ],
    [ 'script', '<p>a<script>alert( 1 )</script>b</p>' ],
    [ 'style', '<p>a<style>p { color: red }</style>b</p>' ],
    [ 'svg', '<p>a<svg><circle r="1"/></svg>b</p>' ],
    [ 'video', '<p>a<video src="x.mp4">fallback</video>b</p>' ],
    [ 'audio', '<p>a<audio src="x.mp3">fallback</audio>b</p>' ],
    [ 'form', '<p>a</p><form><input name="q"><label>Search</label></form><p>b</p>' ],
    [ 'button', '<p>a<button>Share</button>b</p>' ],
  ] )( 'drops %s', ( tag, html ) => {
    const result = htmlToMarkdown( html )

    expect( result ).toMatch( /^a/ )
    expect( result ).not.toMatch( /x\.|alert|color|Share|Search|fallback|circle/ )
    expect( result ).toContain( 'b' )
    expect( tag ).toBeTruthy()
  } )

  it( 'drops tables entirely', () => {
    expect( htmlToMarkdown( '<p>a</p><table><tr><td>cell</td></tr></table><p>b</p>' ) )
      .toBe( 'a\n\nb' )
  } )

  it( 'drops a figure and its image but keeps the caption as a paragraph', () => {
    const html = '<p>a</p><figure><img src="x.png"><figcaption>A caption</figcaption></figure>'
      + '<p>b</p>'

    expect( htmlToMarkdown( html ) ).toBe( 'a\n\nA caption\n\nb' )
  } )

  it( 'drops a figure with no caption', () => {
    expect( htmlToMarkdown( '<p>a</p><figure><img src="x.png"></figure><p>b</p>' ) )
      .toBe( 'a\n\nb' )
  } )

  it( 'collapses three or more newlines to two and trims', () => {
    expect( htmlToMarkdown( '\n\n<p>a</p>\n\n\n\n<p>b</p>\n\n' ) ).toBe( 'a\n\nb' )
    expect( htmlToMarkdown( '<p>a</p><br><br><br><br><p>b</p>' ) ).not.toMatch( /\n{3,}/ )
  } )

  it( 'returns an empty string for empty input or only removed content', () => {
    expect( htmlToMarkdown( '' ) ).toBe( '' )
    expect( htmlToMarkdown( '<img src="x.png"><script>x</script>' ) ).toBe( '' )
  } )
} )

describe( 'htmlToMarkdown with layoutTables: unwrap', () => {
  const unwrap = ( html: string ): string => htmlToMarkdown( html, { layoutTables: 'unwrap' } )

  it( 'keeps the text of every cell, each cell as its own paragraph', () => {
    const html = '<table><tr><td>First</td><td>Second</td></tr><tr><td>Third</td></tr></table>'

    expect( unwrap( html ) ).toBe( 'First\n\nSecond\n\nThird' )
  } )

  it( 'flattens nested tables', () => {
    const html = '<table><tr><td><table><tr><td><table><tr><td>Deep</td></tr></table></td></tr>'
      + '</table></td></tr></table>'

    expect( unwrap( html ) ).toBe( 'Deep' )
  } )

  it( 'handles thead, tbody, tfoot and th', () => {
    const html = '<table><thead><tr><th>Head</th></tr></thead><tbody><tr><td>Body</td></tr></tbody>'
      + '<tfoot><tr><td>Foot</td></tr></tfoot></table>'

    expect( unwrap( html ) ).toBe( 'Head\n\nBody\n\nFoot' )
  } )

  it( 'writes headings, links and lists inside cells as usual', () => {
    const html = '<table><tr><td><h2>Title</h2><p>See <a href="https://example.com/a">this</a>.</p>'
      + '<ul><li>one</li><li>two</li></ul></td></tr></table>'

    expect( unwrap( html ) ).toBe(
      '## Title\n\nSee [this](https://example.com/a).\n\n-   one\n-   two',
    )
  } )

  it( 'keeps text around the table and collapses the blank lines', () => {
    expect( unwrap( '<p>a</p><table><tr><td>cell</td></tr></table><p>b</p>' ) )
      .toBe( 'a\n\ncell\n\nb' )
  } )

  it.each( [
    '<img src="x.png">',
    '<script>alert( 1 )</script>',
    '<style>p { color: red }</style>',
    '<button>Share</button>',
    '<form><label>Search</label></form>',
  ] )( 'still drops %s inside a cell', ( removed ) => {
    expect( unwrap( `<table><tr><td>text${ removed }</td></tr></table>` ) ).toBe( 'text' )
  } )

  it( 'treats "remove" like the default', () => {
    const html = '<p>a</p><table><tr><td>cell</td></tr></table><p>b</p>'

    expect( htmlToMarkdown( html, { layoutTables: 'remove' } ) ).toBe( htmlToMarkdown( html ) )
    expect( htmlToMarkdown( html, { layoutTables: 'remove' } ) ).toBe( 'a\n\nb' )
  } )

  it( 'returns an empty string for an empty table', () => {
    expect( unwrap( '<table><tr><td></td></tr></table>' ) ).toBe( '' )
  } )
} )
