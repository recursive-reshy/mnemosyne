// Packages
import { describe, it, expect } from 'vitest'
// Test support
import { addNote, addSubject } from '../test-support/meleteData.fixture.js'
// Repositories
import {
  claimNextQueued,
  findMissingByHash,
  findNote,
  insertNote,
  listNotesBySubject,
  listNotesUnder,
  requeueGenerating,
  setEnrolled,
  updateNote,
} from './meleteNotes.repository.js'

const MISSING = '2026-10-22T00:00:00.000Z'
const AT = '2026-10-22T09:00:00.000Z'

const newNote = ( subjectId: string, path = 'Learning/TypeScript/Generics.md' ) => ( {
  subject_id: subjectId,
  path,
  title: 'Generics',
  body_hash: 'abc',
  mtime_ms: 1_700_000_000_000,
  size: 120,
  enrolled: false,
  enrolled_at: null,
  generation: 'idle' as const,
} )

describe( 'insertNote and findNote', () => {
  it( 'stores a note and reads it back', () => {
    const subjectId = addSubject()
    const note = insertNote( newNote( subjectId ) )

    expect( note ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      subject_id: subjectId,
      path: 'Learning/TypeScript/Generics.md',
      title: 'Generics',
      body_hash: 'abc',
      mtime_ms: 1_700_000_000_000,
      size: 120,
      enrolled: false,
      enrolled_at: null,
      generation: 'idle',
      generation_error: null,
      missing_at: null,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
    expect( findNote( note.id ) ).toEqual( note )
  } )

  it( 'stores an enrolled, queued note', () => {
    const note = insertNote( {
      ...newNote( addSubject() ),
      enrolled: true,
      enrolled_at: '2026-10-22T00:00:00.000Z',
      generation: 'queued',
    } )

    expect( note ).toMatchObject( {
      enrolled: true,
      enrolled_at: '2026-10-22T00:00:00.000Z',
      generation: 'queued',
    } )
  } )

  it( 'refuses a second live note at the same path', () => {
    const subjectId = addSubject()

    insertNote( newNote( subjectId ) )

    expect( () => insertNote( newNote( subjectId ) ) ).toThrow()
  } )

  it( 'returns undefined for an unknown note', () => {
    expect( findNote( crypto.randomUUID() ) ).toBeUndefined()
  } )
} )

describe( 'listNotesBySubject', () => {
  it( 'lists a subject\'s notes by path, missing ones included', () => {
    const subjectId = addSubject()
    const otherId = addSubject( 'Learning/Rust' )

    addNote( subjectId, { path: 'Learning/TypeScript/b.md' } )
    addNote( subjectId, { path: 'Learning/TypeScript/a.md', missingAt: MISSING } )
    addNote( otherId, { path: 'Learning/Rust/c.md' } )

    expect( listNotesBySubject( subjectId )
      .map( ( { path, missing_at } ) => [ path, missing_at !== null ] ) )
      .toEqual( [
        [ 'Learning/TypeScript/a.md', true ],
        [ 'Learning/TypeScript/b.md', false ],
      ] )
  } )
} )

describe( 'listNotesUnder', () => {
  it( 'lists notes whose path is inside the folder, missing ones included', () => {
    const subjectId = addSubject()

    addNote( subjectId, { path: 'Learning/TS/a.md' } )
    addNote( subjectId, { path: 'Learning/TS/deep/b.md', missingAt: '2026-10-22T00:00:00.000Z' } )

    expect( listNotesUnder( 'Learning/TS' ).map( ( { path } ) => path ) )
      .toEqual( [ 'Learning/TS/a.md', 'Learning/TS/deep/b.md' ] )
  } )

  it( 'does not match a sibling folder that starts with the same letters', () => {
    const subjectId = addSubject()

    addNote( subjectId, { path: 'Learning/TSX/a.md' } )
    addNote( subjectId, { path: 'Learning/TS/b.md' } )

    expect( listNotesUnder( 'Learning/TS' ).map( ( { path } ) => path ) )
      .toEqual( [ 'Learning/TS/b.md' ] )
  } )

  it( 'treats % and _ in a folder name literally', () => {
    const subjectId = addSubject()

    addNote( subjectId, { path: 'Learning/100%/a.md' } )
    addNote( subjectId, { path: 'Learning/100x/b.md' } )

    expect( listNotesUnder( 'Learning/100%' ).map( ( { path } ) => path ) )
      .toEqual( [ 'Learning/100%/a.md' ] )
  } )
} )

describe( 'updateNote', () => {
  it( 'changes only the given fields', () => {
    const id = addNote( addSubject(), { path: 'Learning/TypeScript/a.md', enrolled: false } )

    const updated = updateNote( id, {
      title: 'New title',
      body_hash: 'new',
      mtime_ms: 5,
      size: 9,
      generation: 'queued',
      generation_error: 'Old error',
    } )

    expect( updated ).toMatchObject( {
      path: 'Learning/TypeScript/a.md',
      title: 'New title',
      body_hash: 'new',
      mtime_ms: 5,
      size: 9,
      generation: 'queued',
      generation_error: 'Old error',
      enrolled: false,
    } )
  } )

  it( 'moves a note and sets or clears missing_at', () => {
    const subjectId = addSubject()
    const otherId = addSubject( 'Learning/Rust' )
    const id = addNote( subjectId, { path: 'Learning/TypeScript/a.md' } )

    expect( updateNote( id, { missing_at: '2026-10-22T00:00:00.000Z' } )?.missing_at )
      .toBe( '2026-10-22T00:00:00.000Z' )
    expect( updateNote( id, {
      path: 'Learning/Rust/a.md',
      subject_id: otherId,
      missing_at: null,
    } ) )
      .toMatchObject( { path: 'Learning/Rust/a.md', subject_id: otherId, missing_at: null } )
  } )

  it( 'clears the generation error with null', () => {
    const id = addNote( addSubject() )

    updateNote( id, { generation: 'failed', generation_error: 'Boom' } )

    expect( updateNote( id, { generation: 'queued', generation_error: null } ) )
      .toMatchObject( { generation: 'queued', generation_error: null } )
  } )

  it( 'returns undefined for an unknown note and ignores an empty change', () => {
    expect( updateNote( crypto.randomUUID(), { title: 'x' } ) ).toBeUndefined()

    const id = addNote( addSubject() )

    expect( updateNote( id, {} ) ).toEqual( findNote( id ) )
  } )
} )

describe( 'findMissingByHash', () => {
  it( 'returns only missing notes with that hash', () => {
    const subjectId = addSubject()
    const gone = addNote( subjectId, { hash: 'same', missingAt: '2026-10-22T00:00:00.000Z' } )

    addNote( subjectId, { hash: 'same' } )
    addNote( subjectId, { hash: 'other', missingAt: '2026-10-22T00:00:00.000Z' } )

    expect( findMissingByHash( 'same' ).map( ( { id } ) => id ) ).toEqual( [ gone ] )
    expect( findMissingByHash( 'nothing' ) ).toEqual( [] )
  } )
} )

describe( 'setEnrolled', () => {
  it( 'enrolls several notes at one time', () => {
    const subjectId = addSubject()
    const a = addNote( subjectId, { enrolled: false } )
    const b = addNote( subjectId, { enrolled: false } )
    const c = addNote( subjectId, { enrolled: false } )

    setEnrolled( [ a, b ], true, AT )

    expect( findNote( a ) ).toMatchObject( { enrolled: true, enrolled_at: AT } )
    expect( findNote( b ) ).toMatchObject( { enrolled: true, enrolled_at: AT } )
    expect( findNote( c ) ).toMatchObject( { enrolled: false, enrolled_at: null } )
  } )

  it( 'unenrolls without losing when it was enrolled', () => {
    const id = addNote( addSubject(), { enrolled: true, enrolledAt: '2026-10-01T00:00:00.000Z' } )

    setEnrolled( [ id ], false, '2026-10-22T09:00:00.000Z' )

    expect( findNote( id ) )
      .toMatchObject( { enrolled: false, enrolled_at: '2026-10-01T00:00:00.000Z' } )
  } )

  it( 'does nothing for no ids', () => {
    expect( () => setEnrolled( [], true, '2026-10-22T09:00:00.000Z' ) ).not.toThrow()
  } )
} )

describe( 'claimNextQueued', () => {
  it( 'returns undefined when nothing is queued', () => {
    addNote( addSubject(), { generation: 'idle' } )

    expect( claimNextQueued() ).toBeUndefined()
  } )

  it( 'claims the oldest enrolled note and marks it generating', () => {
    const subjectId = addSubject()
    const queued = { generation: 'queued' }
    const later = addNote( subjectId, { ...queued, enrolledAt: '2026-10-02T00:00:00.000Z' } )
    const earlier = addNote( subjectId, { ...queued, enrolledAt: '2026-10-01T00:00:00.000Z' } )

    expect( claimNextQueued() ).toMatchObject( { id: earlier, generation: 'generating' } )
    expect( findNote( earlier )?.generation ).toBe( 'generating' )
    expect( claimNextQueued() ).toMatchObject( { id: later } )
    expect( claimNextQueued() ).toBeUndefined()
  } )

  it( 'never returns the same note twice', () => {
    const subjectId = addSubject()

    addNote( subjectId, { generation: 'queued' } )
    addNote( subjectId, { generation: 'queued' } )

    const first = claimNextQueued()
    const second = claimNextQueued()

    expect( first?.id ).not.toBe( second?.id )
  } )

  it( 'skips notes that are generating or failed', () => {
    const subjectId = addSubject()

    addNote( subjectId, { generation: 'generating' } )
    addNote( subjectId, { generation: 'failed' } )

    expect( claimNextQueued() ).toBeUndefined()
  } )
} )

describe( 'requeueGenerating', () => {
  it( 'moves generating notes back to queued and reports how many', () => {
    const subjectId = addSubject()
    const stuck = addNote( subjectId, { generation: 'generating' } )
    const failed = addNote( subjectId, { generation: 'failed' } )

    expect( requeueGenerating() ).toBe( 1 )
    expect( findNote( stuck )?.generation ).toBe( 'queued' )
    expect( findNote( failed )?.generation ).toBe( 'failed' )
    expect( requeueGenerating() ).toBe( 0 )
  } )
} )
