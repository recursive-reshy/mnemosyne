// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Repositories
import { findNote, updateNote } from '../repositories/meleteNotes.repository.js'
// Services
import { generateForNote } from '../services/meleteGeneration.service.js'
// Worker
import { startMeleteGenerator } from './meleteGenerator.js'
// Logging
import { logger } from '../logger.js'
import { getLogContext } from '../logContext.js'
// Test support
import { addNote, addSubject } from '../test-support/meleteData.fixture.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../services/meleteGeneration.service.js' )

const generateMock = vi.mocked( generateForNote )

let events: string[]
let gates: Map< string, () => void >
let hold: boolean
let seenContexts: ( string | undefined )[]
let stopGenerator: () => Promise< void >
let subjectId: string

const queued = ( enrolledAt: string ): string => {
  return addNote( userId, subjectId, { generation: 'queued', enrolledAt } )
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  events = []
  gates = new Map()
  hold = false
  seenContexts = []
  stopGenerator = () => Promise.resolve()
  subjectId = addSubject( userId )
  generateMock.mockImplementation( async ( _owner, id ) => {
    events.push( `start:${ id }` )
    seenContexts.push( getLogContext()?.melete_note_id )

    if( hold ) {
      await new Promise< void >( ( resolve ) => gates.set( id, resolve ) )
    }

    updateNote( userId, id, { generation: 'idle' } )
    events.push( `end:${ id }` )
  } )
} )

afterEach( async () => {
  gates.forEach( ( release ) => release() )
  await stopGenerator()
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'startMeleteGenerator', () => {
  it( 'generates a queued note immediately', async () => {
    const id = queued( '2026-10-01T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock ).toHaveBeenCalledWith( userId, id )
    expect( findNote( userId, id )?.generation ).toBe( 'idle' )
  } )

  it( 'generates queued notes oldest enrolled first, one at a time', async () => {
    const later = queued( '2026-10-02T00:00:00.000Z' )
    const earlier = queued( '2026-10-01T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [
      `start:${ earlier }`,
      `end:${ earlier }`,
      `start:${ later }`,
      `end:${ later }`,
    ] )
  } )

  it( 'does not overlap passes while a note is still generating', async () => {
    hold = true
    const first = queued( '2026-10-01T00:00:00.000Z' )
    const second = queued( '2026-10-02T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( events ).toEqual( [ `start:${ first }` ] )

    gates.get( first )?.()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( events ).toEqual( [
      `start:${ first }`,
      `end:${ first }`,
      `start:${ second }`,
    ] )
  } )

  it( 'picks up a note queued later on the next poll', async () => {
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )
    expect( generateMock ).not.toHaveBeenCalled()

    const id = queued( '2026-10-01T00:00:00.000Z' )
    await vi.advanceTimersByTimeAsync( 1000 )

    expect( generateMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'leaves idle, failed and generating notes alone', async () => {
    addNote( userId, subjectId, { generation: 'idle' } )
    addNote( userId, subjectId, { generation: 'failed' } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock ).not.toHaveBeenCalled()
  } )

  it( 'puts notes left generating by a restart back in the queue and runs them', async () => {
    const id = addNote( userId, subjectId, {
      generation: 'generating',
      enrolledAt: '2026-10-01T00:00:00.000Z',
    } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'requeues generating notes only once, at start', async () => {
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    const id = addNote( userId, subjectId, { generation: 'generating' } )

    await vi.advanceTimersByTimeAsync( 5000 )

    expect( generateMock ).not.toHaveBeenCalled()
    expect( findNote( userId, id )?.generation ).toBe( 'generating' )
  } )

  it( 'runs each note inside a log context carrying its id', async () => {
    const id = queued( '2026-10-01T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( seenContexts ).toEqual( [ id ] )
  } )

  it( 'logs an error and carries on with the next note', async () => {
    const error = vi.spyOn( logger, 'error' )
    const first = queued( '2026-10-01T00:00:00.000Z' )
    const second = queued( '2026-10-02T00:00:00.000Z' )

    generateMock.mockRejectedValueOnce( new Error( 'database is locked' ) )
    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )
    await vi.advanceTimersByTimeAsync( 1000 )

    expect( error ).toHaveBeenCalledTimes( 1 )
    expect( generateMock ).toHaveBeenNthCalledWith( 1, userId, first )
    expect( generateMock ).toHaveBeenNthCalledWith( 2, userId, second )
  } )

  it( 'stops polling and waits for the running note when stopped', async () => {
    hold = true
    const first = queued( '2026-10-01T00:00:00.000Z' )
    const second = queued( '2026-10-02T00:00:00.000Z' )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    let stopped = false
    const stopping = stopGenerator().then( () => {
      stopped = true
    } )

    await vi.advanceTimersByTimeAsync( 5000 )
    expect( stopped ).toBe( false )

    gates.get( first )?.()
    await stopping
    await vi.advanceTimersByTimeAsync( 5000 )

    expect( stopped ).toBe( true )
    expect( events ).toEqual( [ `start:${ first }`, `end:${ first }` ] )
    expect( findNote( userId, second )?.generation ).toBe( 'queued' )
  } )
} )

describe( 'startMeleteGenerator for two users', () => {
  it( 'generates each note for its owner, oldest first, in the owner\'s context', async () => {
    const other = createTestUser().id
    const mine = queued( '2026-10-02T00:00:00.000Z' )
    const theirs = addNote(
      other,
      addSubject( other ),
      { generation: 'queued', enrolledAt: '2026-10-01T00:00:00.000Z' },
    )
    const owners: ( string | undefined )[] = []

    generateMock.mockImplementation( ( owner ) => {
      owners.push( getLogContext()?.user_id )

      return Promise.resolve( owner ).then( () => undefined )
    } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock.mock.calls ).toEqual( [ [ other, theirs ], [ userId, mine ] ] )
    expect( owners ).toEqual( [ other, userId ] )
  } )

  it( 'puts the interrupted notes of every user back in the queue', async () => {
    const other = createTestUser().id
    const mine = addNote( userId, subjectId, { generation: 'generating' } )
    const theirs = addNote( other, addSubject( other ), { generation: 'generating' } )

    stopGenerator = startMeleteGenerator()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( generateMock.mock.calls.map( ( [ owner, id ] ) => `${ owner }:${ id }` ).sort() )
      .toEqual( [ `${ userId }:${ mine }`, `${ other }:${ theirs }` ].sort() )
  } )
} )
