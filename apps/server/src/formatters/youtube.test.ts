// Packages
import { describe, it, expect } from 'vitest'
// YouTube
import { youTubeVideoId } from './youtube.js'

describe( 'youTubeVideoId', () => {
  it.each( [
    'https://www.youtube.com/watch?v=abc123',
    'https://youtube.com/watch?v=abc123',
    'https://m.youtube.com/watch?v=abc123',
    'https://www.youtube.com/watch?list=PL1&v=abc123&t=30s',
    'https://youtu.be/abc123',
    'https://youtu.be/abc123?t=10',
    'https://www.youtube.com/shorts/abc123',
    'https://youtube.com/shorts/abc123?feature=share',
  ] )( 'finds the id in %s', ( url ) => {
    expect( youTubeVideoId( url ) ).toBe( 'abc123' )
  } )

  it.each( [
    'https://vimeo.com/12345',
    'https://example.com/watch?v=abc123',
    'https://notyoutube.com/watch?v=abc123',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=',
    'https://www.youtube.com/',
    'https://youtu.be/',
    'https://www.youtube.com/shorts/',
    'not a url',
  ] )( 'returns undefined for %s', ( url ) => {
    expect( youTubeVideoId( url ) ).toBeUndefined()
  } )
} )
