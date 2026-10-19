// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import {
  findSourceById,
  insertSource,
  listActiveSourcesByMatch,
  listDueSources,
  listSources,
  markSourceDeleted,
  recordSourceCheck,
  updateSource,
} from './gmailSources.repository.js'
import type { StoredGmailSource } from './gmailSources.repository.js'

const buildSource = ( overrides: Partial< StoredGmailSource > = {} ): StoredGmailSource => {
  return {
    id: crypto.randomUUID(),
    name: 'Upwork alerts',
    match: { kind: 'labels', label_ids: [ 'Label_1', 'Label_2' ] },
    destination: 'jobs',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    sync_from: '2026-10-19T10:00:00.000Z',
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: '2026-10-19T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

describe( 'insertSource and findSourceById', () => {
  it( 'returns an equal source after insert, with label ids', () => {
    const source = buildSource()

    insertSource( source )

    expect( findSourceById( source.id ) ).toEqual( source )
  } )

  it( 'round-trips a search match and a newsletter source with a profile', () => {
    const source = buildSource( {
      match: { kind: 'query', query: 'from:donotreply@upwork.com is:unread' },
      destination: 'newsletter',
      profile_id: crypto.randomUUID(),
      auto_summarize: true,
      enabled: false,
      last_checked_at: '2026-10-19T11:00:00.000Z',
      last_error: 'Label not found in Gmail: Label_9',
      last_skipped_count: 4,
    } )

    insertSource( source )

    expect( findSourceById( source.id ) ).toEqual( source )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( findSourceById( crypto.randomUUID() ) ).toBeUndefined()
  } )

  it( 'finds a deleted source too', () => {
    const source = buildSource( { deleted_at: '2026-10-20T10:00:00.000Z' } )

    insertSource( source )

    expect( findSourceById( source.id )?.deleted_at ).toBe( '2026-10-20T10:00:00.000Z' )
  } )
} )

describe( 'listSources', () => {
  it( 'lists sources that are not deleted, by name ignoring case, then insertion', () => {
    insertSource( buildSource( { name: 'beta' } ) )
    insertSource( buildSource( { name: 'Alpha' } ) )
    insertSource( buildSource( { name: 'gone', deleted_at: '2026-10-20T10:00:00.000Z' } ) )
    insertSource( buildSource( { name: 'alpha' } ) )

    expect( listSources().map( ( { name } ) => name ) ).toEqual( [ 'Alpha', 'alpha', 'beta' ] )
  } )

  it( 'is empty when there are no sources', () => {
    expect( listSources() ).toEqual( [] )
  } )
} )

describe( 'updateSource', () => {
  it( 'merges the changes, stores them and returns the updated source', () => {
    const source = buildSource()
    insertSource( source )

    const updated = updateSource( source.id, {
      name: 'Renamed',
      match: { kind: 'query', query: 'label:jobs' },
      enabled: false,
      profile_id: crypto.randomUUID(),
    } )

    expect( updated ).toEqual( findSourceById( source.id ) )
    expect( updated?.name ).toBe( 'Renamed' )
    expect( updated?.match ).toEqual( { kind: 'query', query: 'label:jobs' } )
    expect( updated?.enabled ).toBe( false )
    expect( updated?.destination ).toBe( 'jobs' )
  } )

  it( 'switches the match between labels and a search in both directions', () => {
    const source = buildSource()
    insertSource( source )

    updateSource( source.id, { match: { kind: 'query', query: 'a' } } )
    updateSource( source.id, { match: { kind: 'labels', label_ids: [ 'L9' ] } } )

    expect( findSourceById( source.id )?.match ).toEqual( { kind: 'labels', label_ids: [ 'L9' ] } )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( updateSource( crypto.randomUUID(), { name: 'x' } ) ).toBeUndefined()
  } )
} )

describe( 'markSourceDeleted', () => {
  it( 'sets deleted_at and hides the source from the list', () => {
    const source = buildSource()
    insertSource( source )

    markSourceDeleted( source.id, '2026-10-20T10:00:00.000Z' )

    expect( findSourceById( source.id )?.deleted_at ).toBe( '2026-10-20T10:00:00.000Z' )
    expect( listSources() ).toEqual( [] )
  } )
} )

describe( 'listDueSources', () => {
  const now = '2026-10-19T12:00:00.000Z'

  it( 'returns sources never checked or last checked at least one interval ago', () => {
    const never = buildSource( { name: 'never' } )
    const exact = buildSource( { name: 'exact', last_checked_at: '2026-10-19T11:00:00.000Z' } )
    const old = buildSource( { name: 'old', last_checked_at: '2026-10-19T09:00:00.000Z' } )
    const recent = buildSource( { name: 'recent', last_checked_at: '2026-10-19T11:30:00.000Z' } )
    const disabled = buildSource( { name: 'disabled', enabled: false } )
    const deleted = buildSource( { name: 'deleted', deleted_at: '2026-10-19T08:00:00.000Z' } )

    for( const source of [ recent, old, exact, never, disabled, deleted ] ) {
      insertSource( source )
    }

    expect( listDueSources( now, 60 ).map( ( { name } ) => name ) )
      .toEqual( [ 'never', 'old', 'exact' ] )
  } )

  it( 'honours the interval', () => {
    insertSource( buildSource( { last_checked_at: '2026-10-19T11:30:00.000Z' } ) )

    expect( listDueSources( now, 60 ) ).toHaveLength( 0 )
    expect( listDueSources( now, 30 ) ).toHaveLength( 1 )
  } )
} )

describe( 'recordSourceCheck', () => {
  it( 'stores the check result and touches nothing else', () => {
    const source = buildSource()
    insertSource( source )

    recordSourceCheck( source.id, {
      last_checked_at: '2026-10-19T12:00:00.000Z',
      last_error: 'Label not found in Gmail: Label_9',
      last_skipped_count: 3,
    } )

    expect( findSourceById( source.id ) ).toEqual( {
      ...source,
      last_checked_at: '2026-10-19T12:00:00.000Z',
      last_error: 'Label not found in Gmail: Label_9',
      last_skipped_count: 3,
    } )
  } )

  it( 'clears the error with null', () => {
    const source = buildSource( { last_error: 'old' } )
    insertSource( source )

    recordSourceCheck( source.id, {
      last_checked_at: '2026-10-19T12:00:00.000Z',
      last_error: null,
      last_skipped_count: 0,
    } )

    expect( findSourceById( source.id )?.last_error ).toBeNull()
  } )
} )

describe( 'listActiveSourcesByMatch', () => {
  it( 'returns sources that are not deleted, enabled or not, with their match', () => {
    const labels = buildSource( { name: 'b labels' } )
    const query = buildSource( {
      name: 'a query',
      match: { kind: 'query', query: 'from:a@example.com' },
      enabled: false,
    } )

    insertSource( labels )
    insertSource( query )
    insertSource( buildSource( { name: 'gone', deleted_at: '2026-10-20T10:00:00.000Z' } ) )

    expect( listActiveSourcesByMatch() ).toEqual( [ query, labels ] )
  } )
} )
