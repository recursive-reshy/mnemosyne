// Packages
import { describe, it, expect } from 'vitest'
// Source
import { detectSourceType } from './detectSourceType.js'

describe( 'detectSourceType', () => {
  it.each( [
    'https://www.youtube.com/watch?v=abc',
    'https://youtube.com/watch?v=abc',
    'https://m.youtube.com/watch?v=abc',
    'https://music.youtube.com/watch?v=abc',
    'https://youtu.be/abc',
    'https://vimeo.com/123',
    'https://player.vimeo.com/video/123',
    'https://www.dailymotion.com/video/x1',
    'https://www.tiktok.com/@a/video/1',
    'https://www.twitch.tv/videos/1',
  ] )( 'treats %s as a video', ( url ) => {
    expect( detectSourceType( url ) ).toBe( 'video' )
  } )

  it.each( [
    'https://medium.com/@a/post-1',
    'https://example.com/blog/post',
    'https://notyoutube.com/watch?v=abc',
    'https://youtube.com.example.com/post',
    'https://example.com/?next=https://youtube.com',
  ] )( 'treats %s as an article', ( url ) => {
    expect( detectSourceType( url ) ).toBe( 'article' )
  } )

  it( 'treats an unparseable URL as an article', () => {
    expect( detectSourceType( 'not a url' ) ).toBe( 'article' )
  } )

  it( 'ignores the case of the host', () => {
    expect( detectSourceType( 'https://WWW.YouTube.com/watch?v=abc' ) ).toBe( 'video' )
  } )
} )
