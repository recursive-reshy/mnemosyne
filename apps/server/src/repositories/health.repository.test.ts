// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import {
  deleteHealth,
  getHealth,
  listErrors,
  listHealth,
  recordFailure,
  recordSuccess,
} from './health.repository.js'

const at = ( minute: number ): string => {
  return `2026-10-22T10:${ String( minute ).padStart( 2, '0' ) }:00.000Z`
}

describe( 'recordSuccess', () => {
  it( 'creates the row with the check and success times', () => {
    recordSuccess( 'feed', 'f1', at( 1 ) )

    expect( getHealth( 'feed', 'f1' ) ).toEqual( {
      kind: 'feed',
      subject_id: 'f1',
      last_checked_at: at( 1 ),
      last_success_at: at( 1 ),
      last_error: null,
      failing_since: null,
      detail: null,
    } )
  } )

  it( 'stores the detail', () => {
    recordSuccess( 'backup', 'default', at( 1 ), '{"file":"a.db"}' )

    expect( getHealth( 'backup', 'default' )?.detail ).toBe( '{"file":"a.db"}' )
  } )

  it( 'clears last_error and failing_since after a failure', () => {
    recordFailure( 'feed', 'f1', at( 1 ), 'HTTP 500' )
    recordSuccess( 'feed', 'f1', at( 2 ) )

    expect( getHealth( 'feed', 'f1' ) ).toMatchObject( {
      last_checked_at: at( 2 ),
      last_success_at: at( 2 ),
      last_error: null,
      failing_since: null,
    } )
  } )

  it( 'keeps the error history', () => {
    recordFailure( 'feed', 'f1', at( 1 ), 'HTTP 500' )
    recordSuccess( 'feed', 'f1', at( 2 ) )

    expect( listErrors( 'feed', 'f1' ) ).toEqual( [ { at: at( 1 ), message: 'HTTP 500' } ] )
  } )
} )

describe( 'recordFailure', () => {
  it( 'sets the check time, the error and failing_since, and keeps no success time', () => {
    recordFailure( 'agent', 'default', at( 1 ), 'down' )

    expect( getHealth( 'agent', 'default' ) ).toEqual( {
      kind: 'agent',
      subject_id: 'default',
      last_checked_at: at( 1 ),
      last_success_at: null,
      last_error: 'down',
      failing_since: at( 1 ),
      detail: null,
    } )
  } )

  it( 'keeps the last success time and the detail', () => {
    recordSuccess( 'backup', 'default', at( 1 ), 'a.db' )
    recordFailure( 'backup', 'default', at( 2 ), 'disk full' )

    expect( getHealth( 'backup', 'default' ) ).toMatchObject( {
      last_checked_at: at( 2 ),
      last_success_at: at( 1 ),
      last_error: 'disk full',
      detail: 'a.db',
    } )
  } )

  it( 'keeps failing_since on repeated failures and updates the latest error', () => {
    recordFailure( 'feed', 'f1', at( 1 ), 'first' )
    recordFailure( 'feed', 'f1', at( 2 ), 'second' )

    expect( getHealth( 'feed', 'f1' ) ).toMatchObject( {
      last_checked_at: at( 2 ),
      last_error: 'second',
      failing_since: at( 1 ),
    } )
  } )

  it( 'starts failing_since again after a success', () => {
    recordFailure( 'feed', 'f1', at( 1 ), 'first' )
    recordSuccess( 'feed', 'f1', at( 2 ) )
    recordFailure( 'feed', 'f1', at( 3 ), 'again' )

    expect( getHealth( 'feed', 'f1' )?.failing_since ).toBe( at( 3 ) )
  } )

  it( 'keeps only the newest 5 errors, newest first', () => {
    for( let minute = 1; minute <= 7; minute += 1 ) {
      recordFailure( 'feed', 'f1', at( minute ), `error ${ minute }` )
    }

    expect( listErrors( 'feed', 'f1' ).map( ( { message } ) => message ) )
      .toEqual( [ 'error 7', 'error 6', 'error 5', 'error 4', 'error 3' ] )
  } )

  it( 'trims each subject on its own', () => {
    for( let minute = 1; minute <= 6; minute += 1 ) {
      recordFailure( 'feed', 'f1', at( minute ), 'x' )
    }

    recordFailure( 'feed', 'f2', at( 1 ), 'y' )
    recordFailure( 'gmail_source', 'f1', at( 1 ), 'z' )

    expect( listErrors( 'feed', 'f1' ) ).toHaveLength( 5 )
    expect( listErrors( 'feed', 'f2' ) ).toHaveLength( 1 )
    expect( listErrors( 'gmail_source', 'f1' ) ).toHaveLength( 1 )
  } )
} )

describe( 'getHealth, listHealth and listErrors', () => {
  it( 'returns undefined and an empty list for an unknown subject', () => {
    expect( getHealth( 'feed', 'nope' ) ).toBeUndefined()
    expect( listErrors( 'feed', 'nope' ) ).toEqual( [] )
  } )

  it( 'lists every row', () => {
    recordSuccess( 'feed', 'f1', at( 1 ) )
    recordFailure( 'whisper', 'default', at( 2 ), 'down' )

    expect( listHealth().map( ( { kind } ) => kind ).sort() ).toEqual( [ 'feed', 'whisper' ] )
  } )
} )

describe( 'deleteHealth', () => {
  it( 'removes the row and its errors and leaves other subjects', () => {
    recordFailure( 'feed', 'f1', at( 1 ), 'x' )
    recordFailure( 'feed', 'f2', at( 1 ), 'y' )

    deleteHealth( 'feed', 'f1' )

    expect( getHealth( 'feed', 'f1' ) ).toBeUndefined()
    expect( listErrors( 'feed', 'f1' ) ).toEqual( [] )
    expect( getHealth( 'feed', 'f2' ) ).toBeDefined()
    expect( listErrors( 'feed', 'f2' ) ).toHaveLength( 1 )
  } )

  it( 'does nothing for an unknown subject', () => {
    expect( () => deleteHealth( 'feed', 'nope' ) ).not.toThrow()
  } )
} )
