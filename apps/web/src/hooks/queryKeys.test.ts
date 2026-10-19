// Vitest
import { describe, expect, it } from 'vitest'
// App
import {
  feedKeys,
  gmailKeys,
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

describe( 'gmail query keys', () => {
  it( 'has stable keys for the account and the labels', () => {
    expect( gmailKeys.account ).toEqual( [ 'gmail', 'account' ] )
    expect( gmailKeys.labels ).toEqual( [ 'gmail', 'labels' ] )
  } )
} )
