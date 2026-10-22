// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import {
  findSubject,
  listSubjects,
  updateSubject,
  upsertSubject,
} from './meleteSubjects.repository.js'

describe( 'upsertSubject', () => {
  it( 'creates a subject with the defaults', () => {
    const subject = upsertSubject( 'Learning/TypeScript' )

    expect( subject ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      folder: 'Learning/TypeScript',
      auto_enroll: false,
      new_per_day: 10,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
  } )

  it( 'returns the same subject for the same folder and keeps its settings', () => {
    const first = upsertSubject( 'Learning/TypeScript' )

    updateSubject( first.id, { auto_enroll: true, new_per_day: 3 } )

    const again = upsertSubject( 'Learning/TypeScript' )

    expect( again.id ).toBe( first.id )
    expect( again ).toMatchObject( { auto_enroll: true, new_per_day: 3 } )
    expect( listSubjects() ).toHaveLength( 1 )
  } )

  it( 'gives different folders different subjects', () => {
    expect( upsertSubject( 'Learning/A' ).id ).not.toBe( upsertSubject( 'Learning/B' ).id )
  } )
} )

describe( 'listSubjects and findSubject', () => {
  it( 'lists nothing at first', () => {
    expect( listSubjects() ).toEqual( [] )
  } )

  it( 'lists subjects by folder, ignoring case', () => {
    upsertSubject( 'Learning/beta' )
    upsertSubject( 'Learning/Alpha' )
    upsertSubject( 'Learning/Gamma' )

    expect( listSubjects().map( ( { folder } ) => folder ) )
      .toEqual( [ 'Learning/Alpha', 'Learning/beta', 'Learning/Gamma' ] )
  } )

  it( 'finds a subject by id and returns undefined for an unknown one', () => {
    const subject = upsertSubject( 'Learning/A' )

    expect( findSubject( subject.id ) ).toEqual( subject )
    expect( findSubject( crypto.randomUUID() ) ).toBeUndefined()
  } )
} )

describe( 'updateSubject', () => {
  it( 'changes only the given fields and returns the subject', () => {
    const { id } = upsertSubject( 'Learning/A' )

    expect( updateSubject( id, { auto_enroll: true } ) )
      .toMatchObject( { auto_enroll: true, new_per_day: 10 } )
    expect( updateSubject( id, { new_per_day: 0 } ) )
      .toMatchObject( { auto_enroll: true, new_per_day: 0 } )
    expect( updateSubject( id, { auto_enroll: false } ) )
      .toMatchObject( { auto_enroll: false, new_per_day: 0 } )
  } )

  it( 'returns undefined for an unknown subject', () => {
    expect( updateSubject( crypto.randomUUID(), { new_per_day: 5 } ) ).toBeUndefined()
  } )
} )
