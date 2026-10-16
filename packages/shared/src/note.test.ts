// Packages
import { describe, it, expect } from 'vitest'
// Note
import { NoteParseError, parseNote, serializeNote } from './note.js'

const fixture = [
  '---',
  'title: "How Transformers Work"',
  'source: "https://www.youtube.com/watch?v=abc123"',
  'channel: "Some Channel"',
  'duration: "1:42:10"',
  'created: 2026-10-15',
  'tags: [mnemosyne, machine-learning, transformers]',
  '---',
  '',
  '## Summary',
  '',
  '* Uses [[Attention]] heads',
  '- Mixed bullets',
  '',
  '---',
  '',
  '> "Quote" [12:30](https://www.youtube.com/watch?v=abc123&t=750s)',
  '',
].join( '\n' )

describe( 'parseNote', () => {
  it( 'reads the properties and the body', () => {
    const { properties, body } = parseNote( fixture )

    expect( properties ).toEqual( {
      title: 'How Transformers Work',
      source: 'https://www.youtube.com/watch?v=abc123',
      channel: 'Some Channel',
      duration: '1:42:10',
      created: '2026-10-15',
      tags: [ 'mnemosyne', 'machine-learning', 'transformers' ],
    } )
    expect( body.startsWith( '## Summary\n' ) ).toBe( true )
    expect( body.endsWith( '750s)\n' ) ).toBe( true )
  } )

  it( 'throws NoteParseError when there is no front-matter', () => {
    expect( () => parseNote( '## Summary\n' ) ).toThrow( NoteParseError )
  } )

  it( 'throws NoteParseError when the front-matter is never closed', () => {
    expect( () => parseNote( '---\ntitle: "A"\n\n## Summary\n' ) ).toThrow( NoteParseError )
  } )

  it( 'throws NoteParseError on invalid YAML', () => {
    expect( () => parseNote( '---\ntitle: "A\ntags: [a\n---\n\nBody\n' ) ).toThrow( NoteParseError )
  } )

  it( 'throws NoteParseError when a required property is missing or not a string', () => {
    expect( () => parseNote( '---\ntitle: "A"\n---\n\nBody\n' ) ).toThrow( NoteParseError )
    expect( () => parseNote( fixture.replace( 'title: "How Transformers Work"', 'title: 5' ) ) )
      .toThrow( NoteParseError )
  } )
} )

describe( 'serializeNote', () => {
  it( 'returns the same bytes it was given', () => {
    expect( serializeNote( parseNote( fixture ) ) ).toBe( fixture )
  } )

  it( 'writes the 0.2.0 front-matter layout', () => {
    const result = serializeNote( {
      properties: {
        title: 'A "big"\nidea',
        source: 'https://example.com/v',
        channel: 'C',
        duration: '05:00',
        created: '2026-10-15',
        tags: [ 'mnemosyne', 'rust' ],
      },
      body: '## Summary\n',
    } )

    expect( result ).toBe( [
      '---',
      'title: "A \\"big\\" idea"',
      'source: "https://example.com/v"',
      'channel: "C"',
      'duration: "05:00"',
      'created: 2026-10-15',
      'tags: [mnemosyne, rust]',
      '---',
      '',
      '## Summary',
      '',
    ].join( '\n' ) )
  } )

  it( 'keeps the body byte for byte', () => {
    const body = '\n\n  odd   spacing\n\n\n[[Wiki|alias]]\n* a\n'
    const note = parseNote( serializeNote( { ...parseNote( fixture ), body } ) )

    expect( note.body ).toBe( body )
  } )
} )
