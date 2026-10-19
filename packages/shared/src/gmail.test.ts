// Packages
import { describe, it, expect } from 'vitest'
// Gmail
import {
  Backfill,
  CreateGmailSourceBody,
  GetGmailAccountResponse,
  GmailAccount,
  GmailLabel,
  GmailMatch,
  GmailSource,
  GmailSourceResponse,
  ListGmailLabelsResponse,
  ListGmailSourcesResponse,
  PreviewGmailSourceBody,
  PreviewGmailSourceResponse,
  SourceName,
  UpdateGmailSourceBody,
} from './gmail.js'

const id = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const otherId = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

const labels = { kind: 'labels', label_ids: [ 'Label_1' ] }
const query = { kind: 'query', query: 'from:donotreply@upwork.com' }

const source = {
  id,
  name: 'Upwork alerts',
  match: labels,
  label_names: [ 'Upwork' ],
  destination: 'jobs',
  profile_id: null,
  auto_summarize: false,
  enabled: true,
  sync_from: '2026-10-19T10:00:00.000Z',
  last_checked_at: null,
  last_error: null,
  last_skipped_count: 0,
  inbox_count: 0,
  postings_count: 0,
  created_at: '2026-10-19T10:00:00.000Z',
}

describe( 'GmailAccount', () => {
  const account = {
    status: 'connected',
    email: 'naresh@example.com',
    connected_at: '2026-10-19T10:00:00.000Z',
    error: null,
  }

  it( 'accepts every connection status', () => {
    for( const status of [ 'not_configured', 'not_connected', 'connected', 'reconnect_needed' ] ) {
      expect( GmailAccount.safeParse( { ...account, status } ).success ).toBe( true )
    }
  } )

  it( 'accepts an account with no address yet', () => {
    const empty = { status: 'not_connected', email: null, connected_at: null, error: null }

    expect( GetGmailAccountResponse.safeParse( { account: empty } ).success ).toBe( true )
  } )

  it( 'rejects an unknown status and a bad timestamp', () => {
    expect( GmailAccount.safeParse( { ...account, status: 'ok' } ).success ).toBe( false )
    expect( GmailAccount.safeParse( { ...account, connected_at: 'yesterday' } ).success )
      .toBe( false )
  } )
} )

describe( 'GmailLabel', () => {
  it( 'accepts system and user labels in a list response', () => {
    const response = {
      labels: [
        { id: 'Label_1', name: 'Upwork', type: 'user' },
        { id: 'INBOX', name: 'INBOX', type: 'system' },
      ],
    }

    expect( ListGmailLabelsResponse.safeParse( response ).success ).toBe( true )
  } )

  it( 'rejects an unknown type', () => {
    expect( GmailLabel.safeParse( { id: 'a', name: 'a', type: 'other' } ).success ).toBe( false )
  } )
} )

describe( 'GmailMatch', () => {
  it( 'accepts one to ten label ids', () => {
    const ids = ( count: number ): string[] => {
      return Array.from( { length: count }, ( _, index ) => `L${ index }` )
    }

    expect( GmailMatch.safeParse( { kind: 'labels', label_ids: ids( 1 ) } ).success ).toBe( true )
    expect( GmailMatch.safeParse( { kind: 'labels', label_ids: ids( 10 ) } ).success ).toBe( true )
    expect( GmailMatch.safeParse( { kind: 'labels', label_ids: [] } ).success ).toBe( false )
    expect( GmailMatch.safeParse( { kind: 'labels', label_ids: ids( 11 ) } ).success )
      .toBe( false )
  } )

  it( 'trims a query and accepts 1 to 500 characters', () => {
    expect( GmailMatch.parse( { kind: 'query', query: '  is:unread  ' } ) )
      .toEqual( { kind: 'query', query: 'is:unread' } )
    expect( GmailMatch.safeParse( { kind: 'query', query: 'x'.repeat( 500 ) } ).success )
      .toBe( true )
  } )

  it( 'rejects a blank or over-long query and an unknown kind', () => {
    expect( GmailMatch.safeParse( { kind: 'query', query: '   ' } ).success ).toBe( false )
    expect( GmailMatch.safeParse( { kind: 'query', query: 'x'.repeat( 501 ) } ).success )
      .toBe( false )
    expect( GmailMatch.safeParse( { kind: 'sender', query: 'a' } ).success ).toBe( false )
  } )
} )

describe( 'SourceName', () => {
  it( 'trims and accepts 1 to 100 characters', () => {
    expect( SourceName.parse( '  Lenny  ' ) ).toBe( 'Lenny' )
    expect( SourceName.safeParse( 'x'.repeat( 100 ) ).success ).toBe( true )
  } )

  it( 'rejects empty, blank and over-long names', () => {
    expect( SourceName.safeParse( '' ).success ).toBe( false )
    expect( SourceName.safeParse( '   ' ).success ).toBe( false )
    expect( SourceName.safeParse( 'x'.repeat( 101 ) ).success ).toBe( false )
  } )
} )

describe( 'GmailSource', () => {
  it( 'accepts a jobs source with no profile and auto-summarize off', () => {
    expect( GmailSource.safeParse( source ).success ).toBe( true )
  } )

  it( 'accepts a newsletter source with a query match and a profile', () => {
    const newsletter = {
      ...source,
      match: query,
      label_names: [],
      destination: 'newsletter',
      profile_id: otherId,
      auto_summarize: true,
      inbox_count: 3,
    }

    expect( GmailSource.safeParse( newsletter ).success ).toBe( true )
  } )

  it( 'rejects an unknown destination and a negative count', () => {
    expect( GmailSource.safeParse( { ...source, destination: 'archive' } ).success )
      .toBe( false )
    expect( GmailSource.safeParse( { ...source, postings_count: -1 } ).success ).toBe( false )
  } )

  it( 'wraps sources in the list and single responses', () => {
    expect( ListGmailSourcesResponse.safeParse( { sources: [ source ] } ).success ).toBe( true )
    expect( GmailSourceResponse.safeParse( { source } ).success ).toBe( true )
    expect( GmailSourceResponse.safeParse( { source: { id } } ).success ).toBe( false )
  } )
} )

describe( 'PreviewGmailSource', () => {
  it( 'takes a match', () => {
    expect( PreviewGmailSourceBody.safeParse( { match: query } ).success ).toBe( true )
    expect( PreviewGmailSourceBody.safeParse( {} ).success ).toBe( false )
  } )

  it( 'answers with a count, the newest email and overlaps', () => {
    const response = {
      count: 12,
      count_capped: false,
      newest: {
        subject: 'Five new jobs',
        from: 'Upwork',
        received_at: '2026-10-19T10:00:00.000Z',
      },
      overlaps: [ { id, name: 'Other source' } ],
    }

    expect( PreviewGmailSourceResponse.safeParse( response ).success ).toBe( true )
  } )

  it( 'accepts no newest email when nothing matches', () => {
    const response = { count: 0, count_capped: false, newest: null, overlaps: [] }

    expect( PreviewGmailSourceResponse.safeParse( response ).success ).toBe( true )
  } )
} )

describe( 'Backfill', () => {
  it( 'accepts none, 30d, 90d and all only', () => {
    for( const value of [ 'none', '30d', '90d', 'all' ] ) {
      expect( Backfill.safeParse( value ).success ).toBe( true )
    }

    expect( Backfill.safeParse( '7d' ).success ).toBe( false )
  } )
} )

describe( 'CreateGmailSourceBody', () => {
  const jobs = { name: 'Upwork', match: labels, destination: 'jobs' }

  it( 'accepts a jobs source with only the common fields', () => {
    expect( CreateGmailSourceBody.safeParse( jobs ).success ).toBe( true )
  } )

  it( 'accepts a newsletter source with every newsletter option', () => {
    const body = {
      name: 'Lenny',
      match: query,
      destination: 'newsletter',
      profile_id: id,
      auto_summarize: true,
      backfill: '90d',
    }

    expect( CreateGmailSourceBody.safeParse( body ).success ).toBe( true )
  } )

  it( 'refuses each newsletter-only option on a jobs source', () => {
    expect( CreateGmailSourceBody.safeParse( { ...jobs, profile_id: id } ).success )
      .toBe( false )
    expect( CreateGmailSourceBody.safeParse( { ...jobs, auto_summarize: false } ).success )
      .toBe( false )
    expect( CreateGmailSourceBody.safeParse( { ...jobs, backfill: 'none' } ).success )
      .toBe( false )
  } )

  it( 'rejects a missing name, match or destination and a bad backfill', () => {
    expect( CreateGmailSourceBody.safeParse( { ...jobs, name: ' ' } ).success ).toBe( false )
    expect( CreateGmailSourceBody.safeParse( { name: 'a', destination: 'jobs' } ).success )
      .toBe( false )
    expect( CreateGmailSourceBody.safeParse( { name: 'a', match: labels } ).success )
      .toBe( false )
    expect( CreateGmailSourceBody.safeParse(
      { ...jobs, destination: 'newsletter', backfill: '7d' },
    ).success ).toBe( false )
  } )
} )

describe( 'UpdateGmailSourceBody', () => {
  it( 'accepts each field alone', () => {
    expect( UpdateGmailSourceBody.safeParse( { name: 'New' } ).success ).toBe( true )
    expect( UpdateGmailSourceBody.safeParse( { match: query } ).success ).toBe( true )
    expect( UpdateGmailSourceBody.safeParse( { enabled: false } ).success ).toBe( true )
    expect( UpdateGmailSourceBody.safeParse( { auto_summarize: true } ).success ).toBe( true )
    expect( UpdateGmailSourceBody.safeParse( { profile_id: id } ).success ).toBe( true )
  } )

  it( 'allows clearing the profile with null', () => {
    expect( UpdateGmailSourceBody.safeParse( { profile_id: null } ).success ).toBe( true )
  } )

  it( 'rejects an empty body', () => {
    expect( UpdateGmailSourceBody.safeParse( {} ).success ).toBe( false )
  } )

  it( 'ignores destination: it cannot be changed', () => {
    // Refusing profile_id and auto_summarize on a jobs source needs the stored source, so
    // the service checks that; the body can't know the destination.
    expect( UpdateGmailSourceBody.safeParse( { destination: 'jobs' } ).success ).toBe( false )
    expect( UpdateGmailSourceBody.parse( { name: 'a', destination: 'jobs' } ) )
      .toEqual( { name: 'a' } )
  } )
} )
