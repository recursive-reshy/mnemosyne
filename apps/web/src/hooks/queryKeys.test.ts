// Vitest
import { describe, expect, it } from 'vitest'
// App
import {
  feedKeys,
  modelKeys,
  promptKeys,
  settingsKeys,
} from './queryKeys'

describe( 'summarizer query keys', () => {
  it( 'has stable keys for settings, models and profiles', () => {
    expect( settingsKeys.all ).toEqual( [ 'settings' ] )
    expect( modelKeys.all ).toEqual( [ 'models' ] )
    expect( promptKeys.profiles ).toEqual( [ 'prompt-profiles' ] )
  } )

  it( 'nests a profile\'s versions under the profiles key', () => {
    expect( promptKeys.versions( 'abc' ) ).toEqual( [ 'prompt-profiles', 'abc', 'versions' ] )
  } )
} )

describe( 'feed query keys', () => {
  it( 'has stable keys for feeds and the inbox', () => {
    expect( feedKeys.all ).toEqual( [ 'feeds' ] )
    expect( feedKeys.inbox ).toEqual( [ 'feed-items' ] )
  } )
} )
