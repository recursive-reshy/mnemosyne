// Packages
import { describe, it, expect } from 'vitest'
// Postings
import {
  AlertEmail,
  AlertEmailStatus,
  ListAlertEmailsQuery,
  ListAlertEmailsResponse,
  ListPostingsQuery,
  ListPostingsResponse,
  Posting,
  PostingDetails,
  PostingSightingsResponse,
} from './postings.js'

const id = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const otherId = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

const emptyDetails = {
  budget: null,
  skills: [],
  description: null,
  experience_level: null,
  duration: null,
  proposals: null,
  client: null,
  extra: [],
}

const fullDetails = {
  budget: { type: 'hourly', min: 30, max: 50, currency: 'USD' },
  skills: [ 'TypeScript', 'Node.js' ],
  description: 'Build an API.',
  experience_level: 'Expert',
  duration: '1 to 3 months',
  proposals: 'Less than 5',
  client: {
    country: 'Canada',
    rating: 4.9,
    total_spent: '$10K+',
    payment_verified: true,
    hires: '12 hires',
  },
  extra: [ { key: 'Connects', value: '16' } ],
}

const posting = {
  id,
  platform: 'upwork',
  platform_job_id: '~01abc',
  title: 'Node.js developer',
  url: 'https://www.upwork.com/jobs/~01abc',
  posted_at: '2026-10-19T09:00:00.000Z',
  first_seen_at: '2026-10-19T10:00:00.000Z',
  last_seen_at: '2026-10-19T10:00:00.000Z',
  sightings: 1,
  details: fullDetails,
}

const alertEmail = {
  id,
  source_id: otherId,
  source_name: 'Upwork alerts',
  subject: 'New jobs for you',
  sender: 'Upwork',
  received_at: '2026-10-19T09:30:00.000Z',
  link: 'https://mail.google.com/mail/u/naresh%40example.com/#all/18c2',
  status: 'extracted',
  postings_count: 5,
  attempts: 1,
  error: null,
}

describe( 'PostingDetails', () => {
  it( 'accepts a full record and the empty shape', () => {
    expect( PostingDetails.safeParse( fullDetails ).success ).toBe( true )
    expect( PostingDetails.safeParse( emptyDetails ).success ).toBe( true )
  } )

  it( 'accepts fixed and hourly budgets with open ends', () => {
    const budget = ( value: unknown ): boolean => {
      return PostingDetails.safeParse( { ...emptyDetails, budget: value } ).success
    }

    expect( budget( { type: 'fixed', min: 500, max: null, currency: null } ) ).toBe( true )
    expect( budget( { type: 'hourly', min: null, max: 50, currency: 'USD' } ) ).toBe( true )
    expect( budget( { type: 'monthly', min: 1, max: 2, currency: 'USD' } ) ).toBe( false )
  } )

  it( 'accepts a client with unknown fields as null', () => {
    const client = {
      country: null,
      rating: null,
      total_spent: null,
      payment_verified: null,
      hires: null,
    }

    expect( PostingDetails.safeParse( { ...emptyDetails, client } ).success ).toBe( true )
    expect( PostingDetails.safeParse(
      { ...emptyDetails, client: { ...client, rating: 'high' } },
    ).success ).toBe( false )
    expect( PostingDetails.safeParse(
      { ...emptyDetails, client: { ...client, payment_verified: 'yes' } },
    ).success ).toBe( false )
  } )

  it( 'needs every field, with extra as key and value pairs', () => {
    expect( PostingDetails.safeParse( { ...emptyDetails, skills: undefined } ).success )
      .toBe( false )
    expect( PostingDetails.safeParse( { ...emptyDetails, extra: [ { key: 'a' } ] } ).success )
      .toBe( false )
  } )
} )

describe( 'Posting', () => {
  it( 'accepts a posting, with and without a platform id or date', () => {
    expect( Posting.safeParse( posting ).success ).toBe( true )
    expect( Posting.safeParse(
      { ...posting, platform_job_id: null, posted_at: null },
    ).success ).toBe( true )
  } )

  it.each( Object.keys( posting ) )( 'rejects a missing %s', ( field ) => {
    const without: Record< string, unknown > = { ...posting }
    delete without[ field ]

    expect( Posting.safeParse( without ).success ).toBe( false )
  } )

  it( 'rejects a bad id, url and sightings', () => {
    expect( Posting.safeParse( { ...posting, id: 'x' } ).success ).toBe( false )
    expect( Posting.safeParse( { ...posting, url: 'nope' } ).success ).toBe( false )
    expect( Posting.safeParse( { ...posting, sightings: 1.5 } ).success ).toBe( false )
  } )
} )

describe( 'ListPostingsQuery', () => {
  it( 'defaults limit to 50 and offset to 0', () => {
    expect( ListPostingsQuery.parse( {} ) ).toEqual( { limit: 50, offset: 0 } )
  } )

  it( 'coerces query-string numbers and keeps q and platform', () => {
    const query = { q: 'node', platform: 'upwork', limit: '20', offset: '40' }

    expect( ListPostingsQuery.parse( query ) )
      .toEqual( { q: 'node', platform: 'upwork', limit: 20, offset: 40 } )
  } )

  it( 'accepts limit 1 and 100 only within range', () => {
    expect( ListPostingsQuery.safeParse( { limit: 1 } ).success ).toBe( true )
    expect( ListPostingsQuery.safeParse( { limit: 100 } ).success ).toBe( true )
    expect( ListPostingsQuery.safeParse( { limit: 0 } ).success ).toBe( false )
    expect( ListPostingsQuery.safeParse( { limit: 101 } ).success ).toBe( false )
  } )

  it( 'rejects a negative or fractional offset and a non-numeric limit', () => {
    expect( ListPostingsQuery.safeParse( { offset: -1 } ).success ).toBe( false )
    expect( ListPostingsQuery.safeParse( { offset: '1.5' } ).success ).toBe( false )
    expect( ListPostingsQuery.safeParse( { limit: 'many' } ).success ).toBe( false )
  } )

  it( 'accepts a q of 200 characters but not 201', () => {
    expect( ListPostingsQuery.safeParse( { q: 'x'.repeat( 200 ) } ).success ).toBe( true )
    expect( ListPostingsQuery.safeParse( { q: 'x'.repeat( 201 ) } ).success ).toBe( false )
  } )
} )

describe( 'ListPostingsResponse', () => {
  it( 'carries postings, both counts and the platforms', () => {
    const response = { postings: [ posting ], total: 10, filtered: 1, platforms: [ 'upwork' ] }

    expect( ListPostingsResponse.safeParse( response ).success ).toBe( true )
    expect( ListPostingsResponse.safeParse( { ...response, platforms: undefined } ).success )
      .toBe( false )
    expect( ListPostingsResponse.safeParse( { ...response, total: -1 } ).success ).toBe( false )
  } )
} )

describe( 'AlertEmail', () => {
  it( 'accepts every status', () => {
    for( const status of [ 'pending', 'extracted', 'no_jobs', 'failed' ] ) {
      expect( AlertEmailStatus.safeParse( status ).success ).toBe( true )
      expect( AlertEmail.safeParse( { ...alertEmail, status } ).success ).toBe( true )
    }

    expect( AlertEmailStatus.safeParse( 'skipped' ).success ).toBe( false )
  } )

  it( 'accepts a failed email with its reason', () => {
    expect( AlertEmail.safeParse(
      { ...alertEmail, status: 'failed', error: 'Malformed output', attempts: 3 },
    ).success ).toBe( true )
  } )

  it.each( Object.keys( alertEmail ) )( 'rejects a missing %s', ( field ) => {
    const without: Record< string, unknown > = { ...alertEmail }
    delete without[ field ]

    expect( AlertEmail.safeParse( without ).success ).toBe( false )
  } )

  it( 'rejects a bad link and a negative count', () => {
    expect( AlertEmail.safeParse( { ...alertEmail, link: 'nope' } ).success ).toBe( false )
    expect( AlertEmail.safeParse( { ...alertEmail, postings_count: -1 } ).success ).toBe( false )
  } )
} )

describe( 'ListAlertEmailsQuery', () => {
  it( 'defaults like the postings query and accepts a status', () => {
    expect( ListAlertEmailsQuery.parse( {} ) ).toEqual( { limit: 50, offset: 0 } )
    expect( ListAlertEmailsQuery.parse( { status: 'failed', limit: '10' } ) )
      .toEqual( { status: 'failed', limit: 10, offset: 0 } )
  } )

  it( 'rejects an unknown status and an out-of-range limit', () => {
    expect( ListAlertEmailsQuery.safeParse( { status: 'skipped' } ).success ).toBe( false )
    expect( ListAlertEmailsQuery.safeParse( { limit: 101 } ).success ).toBe( false )
  } )
} )

describe( 'alert email responses', () => {
  it( 'ListAlertEmailsResponse carries emails and a total', () => {
    expect( ListAlertEmailsResponse.safeParse( { emails: [ alertEmail ], total: 1 } ).success )
      .toBe( true )
    expect( ListAlertEmailsResponse.safeParse( { emails: [ alertEmail ] } ).success )
      .toBe( false )
  } )

  it( 'PostingSightingsResponse carries emails', () => {
    expect( PostingSightingsResponse.safeParse( { emails: [ alertEmail ] } ).success )
      .toBe( true )
    expect( PostingSightingsResponse.safeParse( { emails: [ { id } ] } ).success ).toBe( false )
  } )
} )
