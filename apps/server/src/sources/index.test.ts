// Packages
import { describe, it, expect } from 'vitest'
// Sources
import { adapterFor } from './index.js'
import { videoAdapter } from './video.adapter.js'

describe( 'adapterFor', () => {
  it( 'returns the video adapter for videos', () => {
    expect( adapterFor( 'video' ) ).toBe( videoAdapter )
  } )

  it( 'has no article adapter yet', () => {
    expect( () => adapterFor( 'article' ) ).toThrow( 'No adapter for article jobs yet' )
  } )
} )
