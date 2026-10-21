// Vitest
import { describe, expect, it } from 'vitest'
// App
import {
  feedKeys,
  gmailKeys,
  inboxKeys,
  jobKeys,
  linkSuggestionKeys,
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
    expect( feedKeys ).not.toHaveProperty( 'inbox' )
  } )
} )

describe( 'inbox query keys', () => {
  it( 'has one key for the inbox of feed items and newsletter emails', () => {
    expect( inboxKeys.all ).toEqual( [ 'inbox' ] )
  } )
} )

describe( 'gmail query keys', () => {
  it( 'has stable keys for the account, the labels and the sources', () => {
    expect( gmailKeys.account ).toEqual( [ 'gmail', 'account' ] )
    expect( gmailKeys.labels ).toEqual( [ 'gmail', 'labels' ] )
    expect( gmailKeys.sources ).toEqual( [ 'gmail', 'sources' ] )
  } )
} )

describe( 'link suggestion query keys', () => {
  it( 'nests a job\'s suggestions under the job\'s key', () => {
    expect( linkSuggestionKeys.list( 'abc' ) ).toEqual( [ 'jobs', 'abc', 'link-suggestions' ] )
    expect( linkSuggestionKeys.list( 'abc' ).slice( 0, 2 ) ).toEqual( jobKeys.detail( 'abc' ) )
  } )
} )
