// Packages
import { describe, it, expect } from 'vitest'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Formatters
import { formatSrt } from './srt.formatter.js'

describe( 'formatSrt', () => {
  it( 'renders one numbered cue per non-empty segment', () => {
    expect( formatSrt( transcriptFixture ) ).toBe(
      '1\n00:00:00,000 --> 00:00:04,200\nWelcome to the talk.\n' +
        '\n' +
        '2\n00:00:04,200 --> 00:00:09,000\nToday we cover formatters.\n' +
        '\n' +
        '3\n00:00:09,000 --> 00:00:20,500\nThey are pure functions.\n' +
        '\n' +
        '4\n00:00:22,500 --> 00:00:30,000\nNo I/O is involved.\n' +
        '\n' +
        '5\n00:02:15,000 --> 00:02:20,250\nLast, the Markdown output.\n',
    )
  } )

  it( 'returns an empty string for an empty transcript', () => {
    expect( formatSrt( { ...transcriptFixture, segments: [] } ) ).toBe( '' )
  } )

  it( 'keeps numbering gapless around empty segments', () => {
    const segments = [
      { start: 0, end: 1, text: 'a' },
      { start: 1, end: 2, text: ' ' },
      { start: 2, end: 3, text: 'b' },
    ]

    expect( formatSrt( { ...transcriptFixture, segments } ) ).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\na\n\n2\n00:00:02,000 --> 00:00:03,000\nb\n',
    )
  } )
} )
