// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import request from 'supertest'
// Shared
import {
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
  MeleteQuestion,
} from '@mnemosyne/shared'
// App
import { app } from '../app.js'
import { config } from '../config.js'
// Melete
import { resetScanClock } from '../melete/scanClock.js'
// Repositories
import { listNotesUnder, updateNote } from '../repositories/meleteNotes.repository.js'
import { findQuestion } from '../repositories/meleteQuestions.repository.js'
import { listSubjects } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Test support
import { addQuestion } from '../test-support/meleteData.fixture.js'
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'

let vault: MeleteVault
let originalVaultPath: string

const scanned = async (): Promise< void > => {
  await request( app ).get( '/api/melete/today' )
}

const subject = ( name: string ) => {
  const found = listSubjects().find( ( { folder } ) => folder === `Learning/${ name }` )

  if( found === undefined ) {
    throw new Error( `No subject ${ name }` )
  }

  return found
}

const note = ( path: string ) => {
  const found = listNotesUnder( 'Learning' ).find( ( candidate ) => {
    return candidate.path === `Learning/${ path }`
  } )

  if( found === undefined ) {
    throw new Error( `No note ${ path }` )
  }

  return found
}

const GENERICS = 'TypeScript/Generics.md'

beforeEach( async () => {
  vault = await createMeleteVault()
  originalVaultPath = config.vaultPath
  config.vaultPath = vault.vaultPath
  setSetting( 'melete_learning_root', 'Learning' )
  resetScanClock()
} )

afterEach( async () => {
  config.vaultPath = originalVaultPath
  await vault.cleanup()
} )

describe( 'GET /api/melete/today', () => {
  it( 'scans the learning root and lists its subjects', async () => {
    const response = await request( app ).get( '/api/melete/today' )
    const today = GetMeleteTodayResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( today.learning_root ).toBe( 'Learning' )
    expect( today.subjects.map( ( { name, note_count } ) => [ name, note_count ] ) )
      .toEqual( [ [ 'Rust', 1 ], [ 'TypeScript', 2 ] ] )
  } )

  it( 'answers 200 with a null learning root when none is set', async () => {
    setSetting( 'melete_learning_root', null )

    const response = await request( app ).get( '/api/melete/today' )

    expect( response.status ).toBe( 200 )
    expect( GetMeleteTodayResponse.parse( response.body ) ).toEqual( {
      learning_root: null,
      subjects: [],
      totals: { due: 0, new_remaining: 0, learning_soon: 0 },
    } )
  } )
} )

describe( 'GET /api/melete/subjects/:id', () => {
  it( 'returns the subject and its notes', async () => {
    await scanned()

    const response = await request( app ).get( `/api/melete/subjects/${ subject( 'Rust' ).id }` )
    const body = GetMeleteSubjectResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.subject.name ).toBe( 'Rust' )
    expect( body.notes.map( ( { title } ) => title ) ).toEqual( [ 'Ownership' ] )
  } )

  it( 'returns 400 for an id that is not a uuid', async () => {
    expect( ( await request( app ).get( '/api/melete/subjects/nope' ) ).status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown subject', async () => {
    const response = await request( app ).get( `/api/melete/subjects/${ crypto.randomUUID() }` )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Subject not found' } )
  } )

  it( 'returns 409 when there is no learning root', async () => {
    await scanned()
    const { id } = subject( 'Rust' )
    setSetting( 'melete_learning_root', null )

    const response = await request( app ).get( `/api/melete/subjects/${ id }` )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Choose a learning root first' } )
  } )
} )

describe( 'PATCH /api/melete/subjects/:id', () => {
  it( 'changes auto-enrol and new questions per day', async () => {
    await scanned()
    const { id } = subject( 'Rust' )

    const response = await request( app )
      .patch( `/api/melete/subjects/${ id }` )
      .send( { auto_enroll: true, new_per_day: 4 } )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toMatchObject( {
      subject: { id, auto_enroll: true, new_per_day: 4 },
    } )
  } )

  it.each( [ {}, { new_per_day: 101 }, { new_per_day: -1 }, { auto_enroll: 'yes' } ] )(
    'returns 400 for the body %j',
    async ( body ) => {
      await scanned()

      const response = await request( app )
        .patch( `/api/melete/subjects/${ subject( 'Rust' ).id }` )
        .send( body )

      expect( response.status ).toBe( 400 )
    },
  )

  it( 'returns 404 for an unknown subject', async () => {
    const response = await request( app )
      .patch( `/api/melete/subjects/${ crypto.randomUUID() }` )
      .send( { auto_enroll: true } )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'POST /api/melete/subjects/:id/enrollment', () => {
  it( 'enrols every note of the subject and queues generation', async () => {
    await scanned()

    const response = await request( app )
      .post( `/api/melete/subjects/${ subject( 'TypeScript' ).id }/enrollment` )
      .send( { enrolled: true } )
    const body = GetMeleteSubjectResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.notes.map( ( { enrolled, generation } ) => [ enrolled, generation ] ) )
      .toEqual( [ [ true, 'queued' ], [ true, 'queued' ] ] )
    expect( body.subject.enrolled_count ).toBe( 2 )
  } )

  it( 'unenrols them again', async () => {
    await scanned()
    const url = `/api/melete/subjects/${ subject( 'TypeScript' ).id }/enrollment`
    await request( app ).post( url ).send( { enrolled: true } )

    const response = await request( app ).post( url ).send( { enrolled: false } )

    expect( GetMeleteSubjectResponse.parse( response.body ).subject.enrolled_count ).toBe( 0 )
  } )

  it( 'returns 400 without a boolean and 404 for an unknown subject', async () => {
    await scanned()

    expect( ( await request( app )
      .post( `/api/melete/subjects/${ subject( 'Rust' ).id }/enrollment` )
      .send( {} ) ).status ).toBe( 400 )
    expect( ( await request( app )
      .post( `/api/melete/subjects/${ crypto.randomUUID() }/enrollment` )
      .send( { enrolled: true } ) ).status ).toBe( 404 )
  } )
} )

describe( 'the note routes', () => {
  it( 'GET returns the note and its questions', async () => {
    await scanned()
    const { id } = note( GENERICS )
    addQuestion( id )

    const response = await request( app ).get( `/api/melete/notes/${ id }` )
    const body = GetMeleteNoteResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.note ).toMatchObject( { id, title: 'Generics in TypeScript', question_count: 1 } )
    expect( body.questions ).toHaveLength( 1 )
  } )

  it( 'PATCH enrols and unenrols a note', async () => {
    await scanned()
    const url = `/api/melete/notes/${ note( GENERICS ).id }`

    const enrolled = await request( app ).patch( url ).send( { enrolled: true } )
    const unenrolled = await request( app ).patch( url ).send( { enrolled: false } )

    expect( enrolled.status ).toBe( 200 )
    expect( GetMeleteNoteResponse.parse( enrolled.body ).note )
      .toMatchObject( { enrolled: true, generation: 'queued' } )
    expect( GetMeleteNoteResponse.parse( unenrolled.body ).note )
      .toMatchObject( { enrolled: false, generation: 'idle' } )
  } )

  it( 'PATCH returns 400 for a body without enrolled', async () => {
    await scanned()

    const response = await request( app )
      .patch( `/api/melete/notes/${ note( GENERICS ).id }` )
      .send( {} )

    expect( response.status ).toBe( 400 )
  } )

  it( 'POST regenerate answers 202 with the note queued', async () => {
    await scanned()
    const { id } = note( GENERICS )
    await request( app ).patch( `/api/melete/notes/${ id }` ).send( { enrolled: true } )
    updateNote( id, { generation: 'idle' } )
    const questionId = addQuestion( id )

    const response = await request( app ).post( `/api/melete/notes/${ id }/regenerate` )

    expect( response.status ).toBe( 202 )
    expect( GetMeleteNoteResponse.parse( response.body ).note.generation ).toBe( 'queued' )
    expect( findQuestion( questionId )?.state ).toBe( 'retired' )
  } )

  it( 'POST regenerate returns 409 for a note that is not enrolled or already queued', async () => {
    await scanned()
    const { id } = note( GENERICS )

    const notEnrolled = await request( app ).post( `/api/melete/notes/${ id }/regenerate` )
    await request( app ).patch( `/api/melete/notes/${ id }` ).send( { enrolled: true } )
    const queued = await request( app ).post( `/api/melete/notes/${ id }/regenerate` )

    expect( notEnrolled.status ).toBe( 409 )
    expect( queued.status ).toBe( 409 )
  } )

  it( 'POST retry answers 202 for a failed note and 409 for any other', async () => {
    await scanned()
    const { id } = note( GENERICS )

    const idle = await request( app ).post( `/api/melete/notes/${ id }/retry` )
    updateNote( id, { generation: 'failed', generation_error: 'Too long' } )
    const failed = await request( app ).post( `/api/melete/notes/${ id }/retry` )

    expect( idle.status ).toBe( 409 )
    expect( failed.status ).toBe( 202 )
    expect( GetMeleteNoteResponse.parse( failed.body ).note )
      .toMatchObject( { generation: 'queued', generation_error: null } )
  } )

  it.each( [ 'get', 'patch', 'post' ] as const )(
    'returns 404 for an unknown note (%s)',
    async ( method ) => {
      const id = crypto.randomUUID()
      const response = method === 'post'
        ? await request( app ).post( `/api/melete/notes/${ id }/regenerate` )
        : await request( app )[ method ]( `/api/melete/notes/${ id }` ).send( { enrolled: true } )

      expect( response.status ).toBe( 404 )
    },
  )

  it( 'returns 400 for an id that is not a uuid', async () => {
    expect( ( await request( app ).get( '/api/melete/notes/nope' ) ).status ).toBe( 400 )
    expect( ( await request( app ).post( '/api/melete/notes/nope/retry' ) ).status ).toBe( 400 )
  } )
} )

describe( 'POST /api/melete/questions/:id/drop', () => {
  it( 'drops an active question', async () => {
    await scanned()
    const questionId = addQuestion( note( GENERICS ).id )

    const response = await request( app ).post( `/api/melete/questions/${ questionId }/drop` )

    expect( response.status ).toBe( 200 )
    expect( MeleteQuestion.parse( ( response.body as { question: unknown } ).question ) )
      .toMatchObject( { id: questionId, state: 'dropped' } )
  } )

  it( 'returns 409 for a question that is already dropped', async () => {
    await scanned()
    const questionId = addQuestion( note( GENERICS ).id, { state: 'dropped' } )

    expect( ( await request( app ).post( `/api/melete/questions/${ questionId }/drop` ) ).status )
      .toBe( 409 )
  } )

  it( 'returns 404 for an unknown question and 400 for a bad id', async () => {
    expect( ( await request( app ).post( `/api/melete/questions/${ crypto.randomUUID() }/drop` ) )
      .status ).toBe( 404 )
    expect( ( await request( app ).post( '/api/melete/questions/nope/drop' ) ).status )
      .toBe( 400 )
  } )
} )
