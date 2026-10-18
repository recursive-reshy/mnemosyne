// Packages
import { describe, it, expect } from 'vitest'
// Sources
import { adapterFor } from './index.js'
import { articleAdapter } from './article.adapter.js'
import { videoAdapter } from './video.adapter.js'

describe( 'adapterFor', () => {
  it( 'returns the video adapter for videos', () => {
    expect( adapterFor( 'video' ) ).toBe( videoAdapter )
  } )

  it( 'returns the article adapter for articles', () => {
    expect( adapterFor( 'article' ) ).toBe( articleAdapter )
  } )
} )
