// Packages
import { describe, it, expect } from 'vitest'
// Link suggestions
import {
  AcceptLinkSuggestionsBody,
  LinkSuggestionStatus,
  LinkSuggestionsResponse,
  ListLinkSuggestionsResponse,
  RejectLinkSuggestionsBody,
  RunLinkingBody,
  StoredLinkSuggestion,
} from './linkSuggestions.js'

const id = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const jobId = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5c'

const suggestion = {
  id,
  job_id: jobId,
  position: 0,
  target: 'Pricing Strategy',
  kind: 'new_concept',
  anchor: 'pricing',
  reason: 'The note is about pricing.',
  status: 'pending',
  decided_at: null,
}

const job = {
  id: jobId,
  url: 'https://www.youtube.com/watch?v=abc',
  status: 'ready_for_review',
  error: null,
  created_at: '2026-10-21T10:00:00.000Z',
  updated_at: '2026-10-21T10:00:00.000Z',
  title: 'T',
  note_markdown: '# T',
  target_folder: null,
  default_folder: 'Inbox',
  expires_at: null,
  saved_path: null,
  summary_model: null,
  prompt_profile_id: null,
  summary_usage: null,
  link_state: 'linked',
  link_error: null,
  link_usage: null,
  source_type: 'video',
  feed_id: null,
  feed_name: null,
  gmail_source_id: null,
  gmail_source_name: null,
}

describe( 'LinkSuggestionStatus', () => {
  it.each( [ 'pending', 'accepted', 'rejected', 'superseded' ] )( 'accepts %s', ( status ) => {
    expect( LinkSuggestionStatus.safeParse( status ).success ).toBe( true )
  } )

  it( 'rejects an unknown status', () => {
    expect( LinkSuggestionStatus.safeParse( 'stale' ).success ).toBe( false )
  } )
} )

describe( 'StoredLinkSuggestion', () => {
  it( 'accepts a pending suggestion with an anchor', () => {
    expect( StoredLinkSuggestion.safeParse( suggestion ).success ).toBe( true )
  } )

  it( 'accepts a decided Related suggestion', () => {
    const decided = {
      ...suggestion,
      anchor: null,
      status: 'accepted',
      decided_at: '2026-10-21T10:05:00.000Z',
    }

    expect( StoredLinkSuggestion.safeParse( decided ).success ).toBe( true )
  } )

  it.each( [
    { kind: 'link' },
    { status: 'stale' },
    { id: 'x' },
    { job_id: 'x' },
    { position: -1 },
    { position: 1.5 },
    { target: '' },
    { reason: '' },
    { decided_at: 'yesterday' },
  ] )( 'rejects %o', ( change ) => {
    expect( StoredLinkSuggestion.safeParse( { ...suggestion, ...change } ).success ).toBe( false )
  } )

  it.each( [ 'anchor', 'decided_at', 'position', 'job_id' ] )( 'rejects a missing %s', ( key ) => {
    const without: Record< string, unknown > = { ...suggestion }
    delete without[ key ]

    expect( StoredLinkSuggestion.safeParse( without ).success ).toBe( false )
  } )
} )

describe( 'ListLinkSuggestionsResponse', () => {
  it( 'accepts a list, including an empty one', () => {
    expect( ListLinkSuggestionsResponse.safeParse( { suggestions: [ suggestion ] } ).success )
      .toBe( true )
    expect( ListLinkSuggestionsResponse.safeParse( { suggestions: [] } ).success ).toBe( true )
  } )

  it( 'needs the suggestions key', () => {
    expect( ListLinkSuggestionsResponse.safeParse( {} ).success ).toBe( false )
  } )
} )

describe( 'AcceptLinkSuggestionsBody', () => {
  it( 'accepts ids and the resulting note', () => {
    expect( AcceptLinkSuggestionsBody.safeParse( { ids: [ id ], note_markdown: '# T' } ).success )
      .toBe( true )
  } )

  it( 'accepts an empty note string', () => {
    expect( AcceptLinkSuggestionsBody.safeParse( { ids: [ id ], note_markdown: '' } ).success )
      .toBe( true )
  } )

  it( 'needs 1 to 50 uuids', () => {
    const fifty = Array.from( { length: 50 }, () => crypto.randomUUID() )

    expect( AcceptLinkSuggestionsBody.safeParse( { ids: [], note_markdown: 'n' } ).success )
      .toBe( false )
    expect( AcceptLinkSuggestionsBody.safeParse( { ids: fifty, note_markdown: 'n' } ).success )
      .toBe( true )
    expect( AcceptLinkSuggestionsBody.safeParse( {
      ids: [ ...fifty, crypto.randomUUID() ],
      note_markdown: 'n',
    } ).success ).toBe( false )
    expect( AcceptLinkSuggestionsBody.safeParse( { ids: [ 'x' ], note_markdown: 'n' } ).success )
      .toBe( false )
  } )

  it( 'needs the note', () => {
    expect( AcceptLinkSuggestionsBody.safeParse( { ids: [ id ] } ).success ).toBe( false )
  } )
} )

describe( 'RejectLinkSuggestionsBody', () => {
  it( 'accepts 1 to 50 uuids', () => {
    expect( RejectLinkSuggestionsBody.safeParse( { ids: [ id ] } ).success ).toBe( true )
    expect( RejectLinkSuggestionsBody.safeParse( { ids: [] } ).success ).toBe( false )
    expect( RejectLinkSuggestionsBody.safeParse( {
      ids: Array.from( { length: 51 }, () => crypto.randomUUID() ),
    } ).success ).toBe( false )
  } )
} )

describe( 'RunLinkingBody', () => {
  it( 'accepts an empty body and a note', () => {
    expect( RunLinkingBody.safeParse( {} ).success ).toBe( true )
    expect( RunLinkingBody.safeParse( { note_markdown: '# T' } ).success ).toBe( true )
  } )

  it( 'rejects a note that is not a string', () => {
    expect( RunLinkingBody.safeParse( { note_markdown: 1 } ).success ).toBe( false )
  } )
} )

describe( 'LinkSuggestionsResponse', () => {
  it( 'carries the job and its suggestions', () => {
    expect( LinkSuggestionsResponse.safeParse( { job, suggestions: [ suggestion ] } ).success )
      .toBe( true )
    expect( LinkSuggestionsResponse.safeParse( { job } ).success ).toBe( false )
  } )
} )
