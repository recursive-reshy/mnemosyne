// Packages
import { describe, it, expect } from 'vitest'
// Note
import { parseNote, serializeNote } from './note.js'
// Wikilinks
import {
  findAnchor,
  hasWikilink,
  insertLink,
  isStale,
} from './wikilinks.js'

const FRONT_MATTER = [
  '---',
  'title: "Pricing talk"',
  'source: "https://example.com/pricing"',
  'created: 2026-10-21',
  'tags: ["pricing"]',
  '---',
  '',
].join( '\n' )

const note = ( body: string ): string => `${ FRONT_MATTER }\n${ body }`

const slice = ( markdown: string, anchor: string ): string | null => {
  const found = findAnchor( markdown, anchor )

  return found === null ? null : markdown.slice( found.start, found.end )
}

describe( 'findAnchor', () => {
  it( 'finds the first exact occurrence and returns its offsets', () => {
    const markdown = note( 'We talk about pricing here, and pricing again.' )
    const found = findAnchor( markdown, 'pricing' )

    expect( found ).not.toBeNull()
    expect( found?.start ).toBe( markdown.indexOf( 'pricing here' ) )
    expect( found?.end ).toBe( ( found?.start ?? 0 ) + 'pricing'.length )
  } )

  it( 'is case-sensitive', () => {
    expect( findAnchor( note( 'Pricing matters.' ), 'pricing' ) ).toBeNull()
  } )

  it( 'finds a multi-word phrase', () => {
    expect( slice( note( 'Use value based pricing today.' ), 'value based pricing' ) )
      .toBe( 'value based pricing' )
  } )

  it( 'returns null for an empty anchor and for a phrase that is not there', () => {
    expect( findAnchor( note( 'Some text.' ), '' ) ).toBeNull()
    expect( findAnchor( note( 'Some text.' ), 'absent' ) ).toBeNull()
  } )

  describe( 'word boundaries', () => {
    it( 'does not match inside a longer word', () => {
      expect( findAnchor( note( 'The start of it.' ), 'art' ) ).toBeNull()
      expect( findAnchor( note( 'Article' ), 'art' ) ).toBeNull()
    } )

    it( 'skips an embedded match and takes a later whole-word one', () => {
      const markdown = note( 'The start is not an art form, but art is.' )

      expect( findAnchor( markdown, 'art' )?.start ).toBe( markdown.indexOf( 'art form' ) )
    } )

    it( 'treats digits and Unicode letters as word characters', () => {
      expect( findAnchor( note( 'Version v2 and été.' ), 'v' ) ).toBeNull()
      expect( findAnchor( note( 'Une soirée entière.' ), 'entier' ) ).toBeNull()
      expect( findAnchor( note( 'Une soirée entière.' ), 'entière' ) ).not.toBeNull()
    } )

    it( 'allows punctuation and line ends as boundaries', () => {
      expect( slice( note( '(pricing), "pricing".' ), 'pricing' ) ).toBe( 'pricing' )
      expect( slice( note( 'pricing' ), 'pricing' ) ).toBe( 'pricing' )
    } )
  } )

  describe( 'excluded regions', () => {
    it( 'skips the front-matter', () => {
      expect( findAnchor( note( 'Nothing here.' ), 'Pricing talk' ) ).toBeNull()
      expect( findAnchor( note( 'Nothing here.' ), 'pricing' ) ).toBeNull()
    } )

    it( 'skips ATX headings', () => {
      expect( findAnchor( note( '## Pricing basics\n\nText.' ), 'Pricing' ) ).toBeNull()
      expect( findAnchor( note( '# Pricing' ), 'Pricing' ) ).toBeNull()
    } )

    it( 'skips blockquote lines', () => {
      expect( findAnchor( note( '> A quote about pricing.\n\nPlain.' ), 'pricing' ) ).toBeNull()
    } )

    it( 'skips fenced code blocks, backtick and tilde', () => {
      expect( findAnchor( note( '```\npricing\n```' ), 'pricing' ) ).toBeNull()
      expect( findAnchor( note( '~~~ts\npricing\n~~~' ), 'pricing' ) ).toBeNull()
      expect( findAnchor( note( '````\n```\npricing\n```\n````' ), 'pricing' ) ).toBeNull()
    } )

    it( 'treats an unclosed fence as running to the end of the note', () => {
      expect( findAnchor( note( 'Before.\n```\npricing' ), 'pricing' ) ).toBeNull()
    } )

    it( 'finds text after a fenced block ends', () => {
      const markdown = note( '```\ncode\n```\n\nAfter the pricing block.' )

      expect( slice( markdown, 'pricing' ) ).toBe( 'pricing' )
    } )

    it( 'skips inline code', () => {
      expect( findAnchor( note( 'Use `pricing` wisely.' ), 'pricing' ) ).toBeNull()
      expect( findAnchor( note( 'Use ``a `pricing` b`` wisely.' ), 'pricing' ) ).toBeNull()
    } )

    it( 'skips wikilinks, including aliased, heading and embed forms', () => {
      expect( findAnchor( note( 'See [[Pricing]].' ), 'Pricing' ) ).toBeNull()
      expect( findAnchor( note( 'See [[Note|pricing]].' ), 'pricing' ) ).toBeNull()
      expect( findAnchor( note( 'See [[Note#pricing]].' ), 'pricing' ) ).toBeNull()
      expect( findAnchor( note( 'See ![[pricing.png]].' ), 'pricing' ) ).toBeNull()
    } )

    it( 'skips Markdown links, images and autolinks', () => {
      expect( findAnchor( note( 'See [pricing](https://x.com).' ), 'pricing' ) ).toBeNull()
      expect( findAnchor( note( 'See [text](https://x.com/pricing).' ), 'pricing' ) ).toBeNull()
      expect( findAnchor( note( 'See ![pricing](a.png).' ), 'pricing' ) ).toBeNull()
      expect( findAnchor( note( 'See <https://x.com/pricing>.' ), 'pricing' ) ).toBeNull()
    } )

    it( 'falls through to a later eligible occurrence', () => {
      const markdown = note(
        '# Pricing\n\n> pricing quote\n\n`pricing` and [[Pricing]], then pricing.',
      )

      expect( findAnchor( markdown, 'pricing' )?.start )
        .toBe( markdown.lastIndexOf( 'pricing' ) )
    } )

    it( 'does not match across a masked region', () => {
      expect( findAnchor( note( 'a `b` c' ), 'a  c' ) ).toBeNull()
    } )
  } )

  it( 'works on a note without front-matter', () => {
    expect( slice( 'Plain text about pricing.', 'pricing' ) ).toBe( 'pricing' )
  } )

  it( 'works with CRLF line endings', () => {
    const markdown = '# Pricing\r\n\r\nAbout pricing.\r\n> pricing\r\n'

    expect( findAnchor( markdown, 'pricing' )?.start ).toBe( markdown.indexOf( 'pricing.' ) )
  } )
} )

describe( 'hasWikilink', () => {
  it.each( [
    '[[Pricing Strategy]]',
    '[[Pricing Strategy|pricing]]',
    '[[Pricing Strategy#Tiers]]',
    '[[Pricing Strategy#Tiers|tiers]]',
    '[[pricing strategy]]',
    '[[ Pricing Strategy ]]',
  ] )( 'finds %s', ( link ) => {
    expect( hasWikilink( note( `See ${ link } now.` ), 'Pricing Strategy' ) ).toBe( true )
  } )

  it( 'does not match a different target that shares a prefix or suffix', () => {
    expect( hasWikilink( note( '[[Pricing]]' ), 'Pricing Strategy' ) ).toBe( false )
    expect( hasWikilink( note( '[[Pricing Strategy Guide]]' ), 'Pricing Strategy' ) ).toBe( false )
    expect( hasWikilink( note( '[[Value Pricing Strategy]]' ), 'Pricing Strategy' ) ).toBe( false )
  } )

  it( 'does not count an alias or a heading as the target', () => {
    expect( hasWikilink( note( '[[Other|Pricing Strategy]]' ), 'Pricing Strategy' ) ).toBe( false )
    expect( hasWikilink( note( '[[Other#Pricing Strategy]]' ), 'Pricing Strategy' ) ).toBe( false )
  } )

  it( 'ignores embeds, code and the front-matter', () => {
    expect( hasWikilink( note( '![[Pricing Strategy]]' ), 'Pricing Strategy' ) ).toBe( false )
    expect( hasWikilink( note( '`[[Pricing Strategy]]`' ), 'Pricing Strategy' ) ).toBe( false )
    expect( hasWikilink( note( '```\n[[Pricing Strategy]]\n```' ), 'Pricing Strategy' ) )
      .toBe( false )
    const frontMatterLink = '---\nrelated: "[[Pricing Strategy]]"\n---\n\nText.'

    expect( hasWikilink( frontMatterLink, 'Pricing Strategy' ) ).toBe( false )
  } )

  it( 'finds a link inside a heading or a quote, since the note still links there', () => {
    const heading = note( '## About [[Pricing Strategy]]' )
    const quote = note( '> see [[Pricing Strategy]]' )

    expect( hasWikilink( heading, 'Pricing Strategy' ) ).toBe( true )
    expect( hasWikilink( quote, 'Pricing Strategy' ) ).toBe( true )
  } )
} )

describe( 'isStale', () => {
  it( 'is false without an anchor', () => {
    expect( isStale( note( 'Text.' ), { anchor: null } ) ).toBe( false )
  } )

  it( 'is false while the anchor can still be placed', () => {
    expect( isStale( note( 'About pricing.' ), { anchor: 'pricing' } ) ).toBe( false )
  } )

  it( 'is true once the phrase is gone', () => {
    expect( isStale( note( 'About costs.' ), { anchor: 'pricing' } ) ).toBe( true )
  } )

  it( 'is true when the phrase only remains in an excluded region', () => {
    expect( isStale( note( '## Pricing\n\nText.' ), { anchor: 'Pricing' } ) ).toBe( true )
    expect( isStale( note( 'See [[Pricing]].' ), { anchor: 'Pricing' } ) ).toBe( true )
  } )
} )

describe( 'insertLink', () => {
  describe( 'with an anchor', () => {
    it( 'links the first eligible occurrence as [[Target]] when the phrase is the target', () => {
      const markdown = note( 'Pricing Strategy is key. Pricing Strategy again.' )

      expect( insertLink( markdown, { target: 'Pricing Strategy', anchor: 'Pricing Strategy' } ) )
        .toBe( note( '[[Pricing Strategy]] is key. Pricing Strategy again.' ) )
    } )

    it( 'uses an alias when the phrase differs from the target', () => {
      const markdown = note( 'We set prices carefully.' )

      expect( insertLink( markdown, { target: 'Pricing Strategy', anchor: 'prices' } ) )
        .toBe( note( 'We set [[Pricing Strategy|prices]] carefully.' ) )
    } )

    it( 'keeps the typed text when only the case differs', () => {
      const markdown = note( 'We refined our pricing strategy.' )

      expect( insertLink( markdown, { target: 'Pricing Strategy', anchor: 'pricing strategy' } ) )
        .toBe( note( 'We refined our [[Pricing Strategy|pricing strategy]].' ) )
    } )

    it( 'skips an ineligible first occurrence', () => {
      const markdown = note( '# Prices\n\nWe set prices.' )

      expect( insertLink( markdown, { target: 'Pricing', anchor: 'prices' } ) )
        .toBe( note( '# Prices\n\nWe set [[Pricing|prices]].' ) )
    } )

    it( 'leaves the front-matter untouched', () => {
      const result = insertLink(
        note( 'About pricing.' ),
        { target: 'Pricing', anchor: 'pricing' },
      )

      expect( result.startsWith( FRONT_MATTER ) ).toBe( true )
    } )
  } )

  describe( 'in Related', () => {
    it( 'creates the section when the note has none', () => {
      expect( insertLink( note( 'Body text.\n' ), { target: 'Pricing', anchor: null } ) )
        .toBe( note( 'Body text.\n\n## Related\n\n- [[Pricing]]\n' ) )
    } )

    it( 'normalizes the gap and the trailing newline when creating it', () => {
      expect( insertLink( note( 'Body text.\n\n\n\n' ), { target: 'Pricing', anchor: null } ) )
        .toBe( note( 'Body text.\n\n## Related\n\n- [[Pricing]]\n' ) )
      expect( insertLink( note( 'Body text.' ), { target: 'Pricing', anchor: null } ) )
        .toBe( note( 'Body text.\n\n## Related\n\n- [[Pricing]]\n' ) )
    } )

    it( 'appends to the list of an existing Related section', () => {
      const markdown = note( 'Body.\n\n## Related\n\n- [[Existing]]\n' )

      expect( insertLink( markdown, { target: 'Pricing', anchor: null } ) )
        .toBe( note( 'Body.\n\n## Related\n\n- [[Existing]]\n- [[Pricing]]\n' ) )
    } )

    it( 'appends before the next heading and keeps the gap', () => {
      const markdown = note( '## Related\n\n- [[Existing]]\n\n## Sources\n\n- a\n' )

      expect( insertLink( markdown, { target: 'Pricing', anchor: null } ) )
        .toBe( note( '## Related\n\n- [[Existing]]\n- [[Pricing]]\n\n## Sources\n\n- a\n' ) )
    } )

    it( 'fills an empty Related section', () => {
      expect( insertLink( note( 'Body.\n\n## Related\n' ), { target: 'Pricing', anchor: null } ) )
        .toBe( note( 'Body.\n\n## Related\n\n- [[Pricing]]\n' ) )
      expect( insertLink( note( 'Body.\n\n## Related' ), { target: 'Pricing', anchor: null } ) )
        .toBe( note( 'Body.\n\n## Related\n\n- [[Pricing]]\n' ) )
    } )

    it( 'uses the last exact Related heading in the note', () => {
      const markdown = note( '## Related\n\n- [[One]]\n\n## Other\n\n## Related\n\n- [[Two]]\n' )

      expect( insertLink( markdown, { target: 'Pricing', anchor: null } ) )
        .toBe( note(
          '## Related\n\n- [[One]]\n\n## Other\n\n## Related\n\n- [[Two]]\n- [[Pricing]]\n',
        ) )
    } )

    it( 'does not mistake a similar heading or a heading inside code for Related', () => {
      const similar = note( 'Body.\n\n## related\n\n- a\n\n### Related\n' )
      const fenced = note( 'Body.\n\n```\n## Related\n```\n' )

      expect( insertLink( similar, { target: 'Pricing', anchor: null } ) )
        .toMatch( /\n## Related\n\n- \[\[Pricing\]\]\n$/ )
      expect( insertLink( fenced, { target: 'Pricing', anchor: null } ) )
        .toBe( note( 'Body.\n\n```\n## Related\n```\n\n## Related\n\n- [[Pricing]]\n' ) )
    } )

    it( 'goes to Related when asRelated is set, even if the anchor is placeable', () => {
      expect( insertLink(
        note( 'About pricing.\n' ),
        { target: 'Pricing', anchor: 'pricing' },
        { asRelated: true },
      ) ).toBe( note( 'About pricing.\n\n## Related\n\n- [[Pricing]]\n' ) )
    } )

    it( 'goes to Related when the anchor is stale', () => {
      expect( insertLink( note( 'About costs.\n' ), { target: 'Pricing', anchor: 'pricing' } ) )
        .toBe( note( 'About costs.\n\n## Related\n\n- [[Pricing]]\n' ) )
    } )
  } )

  describe( 'when the note already links to the target', () => {
    it( 'returns the note unchanged for any alias or heading form', () => {
      const withAlias = note( 'See [[pricing strategy|that]].\n\nMore pricing strategy.' )
      const withHeading = note( 'See [[Pricing Strategy#Tiers]].' )

      expect( insertLink( withAlias, { target: 'Pricing Strategy', anchor: 'pricing strategy' } ) )
        .toBe( withAlias )
      expect( insertLink( withHeading, { target: 'Pricing Strategy', anchor: null } ) )
        .toBe( withHeading )
    } )
  } )

  it( 'round-trips through parseNote and serializeNote apart from the insertion', () => {
    const original = serializeNote( {
      properties: {
        title: 'Pricing talk',
        source: 'https://example.com/pricing',
        created: '2026-10-21',
        tags: [ 'pricing' ],
      },
      body: '## Summary\n\nWe discuss pricing.\n',
    } )
    const inline = insertLink( original, { target: 'Pricing Strategy', anchor: 'pricing' } )
    const related = insertLink( original, { target: 'Pricing Strategy', anchor: null } )
    const before = parseNote( original )

    expect( parseNote( inline ) ).toEqual( {
      properties: before.properties,
      body: '## Summary\n\nWe discuss [[Pricing Strategy|pricing]].\n',
    } )
    expect( parseNote( related ) ).toEqual( {
      properties: before.properties,
      body: '## Summary\n\nWe discuss pricing.\n\n## Related\n\n- [[Pricing Strategy]]\n',
    } )
    expect( serializeNote( parseNote( inline ) ) ).toBe( inline )
    expect( serializeNote( parseNote( related ) ) ).toBe( related )
  } )
} )
