// Node
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Clients
import { generateQuestions } from '../clients/claude.client.js'
// Errors
import { MeleteError } from '../errors.js'
// Melete
import {
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
  buildMeleteSystemPrompt,
} from '../melete/prompts.js'
import { bodyHash, splitFrontMatter } from '../melete/scan.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import {
  findNote,
  listNotesUnder,
  setEnrolled,
  updateNote,
} from '../repositories/meleteNotes.repository.js'
import { listForNote } from '../repositories/meleteQuestions.repository.js'
import { findRun } from '../repositories/meleteRuns.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { generateForNote } from './meleteGeneration.service.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { addQuestion } from '../test-support/meleteData.fixture.js'
import {
  GENERICS_NOTE,
  MeleteVault,
  createMeleteVault,
} from '../test-support/meleteVault.fixture.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( { logLevel: 'silent', sessionDays: 30, vaultPath: '' } ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( '../clients/claude.client.js' )

const generate = vi.mocked( generateQuestions )

const T0 = new Date( '2026-10-22T10:00:00.000Z' )
const GENERICS_PATH = 'Learning/TypeScript/Generics.md'
const GENERICS_BODY = splitFrontMatter( GENERICS_NOTE ).body
const PASSAGE = 'A generic type takes other types as parameters.'

let vault: MeleteVault

const usage = { input_tokens: 2000, output_tokens: 300 }

const reply = ( passage = PASSAGE ) => ( {
  output: {
    questions: [
      { prompt: 'What is a generic type?', answer: 'A type with type parameters.', passage },
      { prompt: 'Why use generics?', answer: 'To reuse code across types.', passage: '' },
    ],
  },
  usage,
} )

const noteAt = ( path: string ) => {
  const found = listNotesUnder( 'Learning' ).find( ( note ) => {
    return note.path === path && note.missing_at === null
  } )

  if( found === undefined ) {
    throw new Error( `No live note at ${ path }` )
  }

  return found
}

// A scanned, enrolled note that the loop has just claimed
const claimed = async ( path = GENERICS_PATH ): Promise< string > => {
  await scanLearningRoot( { force: true, now: T0 } )

  const { id } = noteAt( path )

  setEnrolled( [ id ], true, T0.toISOString() )
  updateNote( id, { generation: 'generating' } )

  return id
}

const runs = () => getDatabase().prepare( 'SELECT * FROM melete_runs ORDER BY id' ).all()

const snapshot = async ( root: string ): Promise< string[] > => {
  const names = await readdir( root, { recursive: true } )
  const lines = await Promise.all( names.map( async ( name ) => {
    const { mtimeMs, size } = await stat( join( root, name ) )

    return `${ name }:${ mtimeMs }:${ size }`
  } ) )

  return lines.sort()
}

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultPath = vault.vaultPath
  setSetting( userId, 'melete_learning_root', 'Learning' )
  setSetting( userId, 'melete_question_model', 'claude-sonnet-5-5' )
  resetScanClock()
  generate.mockReset()
  generate.mockResolvedValue( reply() )
} )

afterEach( async () => {
  await vault.cleanup()
  vi.restoreAllMocks()
} )

describe( 'generateForNote', () => {
  it( 'stores the questions and returns the note to idle', async () => {
    const id = await claimed()

    await generateForNote( id, T0 )

    const note = findNote( id )
    const questions = listForNote( id )

    expect( note ).toMatchObject( { generation: 'idle', generation_error: null } )
    expect( questions.map( ( { position, prompt, passage, state } ) => {
      return { position, prompt, passage, state }
    } ) ).toEqual( [
      { position: 1, prompt: 'What is a generic type?', passage: PASSAGE, state: 'active' },
      { position: 2, prompt: 'Why use generics?', passage: '', state: 'active' },
    ] )
    expect( questions.every( ( { body_hash: hash } ) => hash === bodyHash( GENERICS_BODY ) ) )
      .toBe( true )
  } )

  it( 'sends the subject, the title and the body without front-matter', async () => {
    const id = await claimed()

    await generateForNote( id, T0 )

    const { version } = resolveMeletePrompt( userId, 'melete_questions' )

    expect( generate ).toHaveBeenCalledWith( {
      model: 'claude-sonnet-5-5',
      system: buildMeleteSystemPrompt(
        LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
        DEFAULT_MELETE_QUESTIONS_GUIDANCE,
      ),
      user: `Subject: TypeScript\nTitle: Generics in TypeScript\n\n${ GENERICS_BODY }`,
    } )
    expect( version.guidance ).toBe( DEFAULT_MELETE_QUESTIONS_GUIDANCE )
  } )

  it( 'records the run with the model, prompt version, tokens and cost', async () => {
    const id = await claimed()

    await generateForNote( id, T0 )

    const [ run ] = runs() as { id: number }[]
    const { version } = resolveMeletePrompt( userId, 'melete_questions' )

    expect( runs() ).toHaveLength( 1 )
    expect( findRun( run?.id ?? 0 ) ).toMatchObject( {
      kind: 'generate',
      note_id: id,
      question_id: null,
      model: 'claude-sonnet-5-5',
      prompt_version_id: version.id,
      input_tokens: 2000,
      output_tokens: 300,
      outcome: 'succeeded',
      error: null,
      created_at: T0.toISOString(),
    } )
    expect( findRun( run?.id ?? 0 )?.cost_usd ).toBeGreaterThan( 0 )
    expect( listForNote( id )[ 0 ]?.run_id ).toBe( run?.id )
  } )

  it( 'empties a passage that is not in the note', async () => {
    const id = await claimed()

    generate.mockResolvedValue( reply( 'A line the note does not contain.' ) )
    await generateForNote( id, T0 )

    expect( listForNote( id )[ 0 ]?.passage ).toBe( '' )
  } )

  it( 'follows the edited question prompt', async () => {
    const id = await claimed()

    const { profile } = resolveMeletePrompt( userId, 'melete_questions' )
    const { saveVersion } = await import( './prompts.service.js' )

    saveVersion( userId, profile.id, 'Ask about edge cases.' )
    await generateForNote( id, T0 )

    expect( generate.mock.calls[ 0 ]?.[ 0 ].system )
      .toContain( '## Guidance\nAsk about edge cases.' )
  } )

  it( 'fails a note over 60000 characters without calling Claude', async () => {
    await vault.write( GENERICS_PATH, `# Big\n\n${ 'a'.repeat( 60_000 ) }\n` )

    const id = await claimed()

    await generateForNote( id, T0 )

    const note = findNote( id )

    expect( generate ).not.toHaveBeenCalled()
    expect( note?.generation ).toBe( 'failed' )
    expect( note?.generation_error )
      .toMatch( /^Note is too long for question generation \(\d+ char/ )
    expect( note?.generation_error ).toMatch( /, limit 60000\)\. Split it into smaller notes\.$/ )
    expect( runs() ).toMatchObject( [ {
      outcome: 'failed',
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } ] )
    expect( listForNote( id ) ).toEqual( [] )
  } )

  it( 'stores a Claude failure on the note, with the billed tokens', async () => {
    const id = await claimed()
    const other = noteAt( 'Learning/Rust/Ownership.md' ).id

    setEnrolled( [ other ], true, T0.toISOString() )
    updateNote( other, { generation: 'queued' } )
    generate.mockRejectedValue( new MeleteError( 'Question generation was cut off', { usage } ) )

    await generateForNote( id, T0 )

    expect( findNote( id ) ).toMatchObject( {
      generation: 'failed',
      generation_error: 'Question generation was cut off',
    } )
    expect( runs() ).toMatchObject( [ {
      outcome: 'failed',
      error: 'Question generation was cut off',
      input_tokens: 2000,
      output_tokens: 300,
    } ] )
    expect( listForNote( id ) ).toEqual( [] )
    expect( findNote( other )?.generation ).toBe( 'queued' )
  } )

  it( 'stores a failure without usage as null tokens and cost', async () => {
    const id = await claimed()

    generate.mockRejectedValue( new MeleteError( 'Question generation failed: Overloaded' ) )
    await generateForNote( id, T0 )

    expect( runs() ).toMatchObject( [ {
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } ] )
  } )

  it( 'fails the note, not the loop, on an unexpected error', async () => {
    const id = await claimed()

    generate.mockRejectedValue( new TypeError( 'boom' ) )

    await expect( generateForNote( id, T0 ) ).resolves.toBeUndefined()
    expect( findNote( id ) ).toMatchObject( { generation: 'failed', generation_error: 'boom' } )
  } )

  it( 'fails the note when no usable question comes back', async () => {
    const id = await claimed()

    generate.mockResolvedValue( {
      output: { questions: [ { prompt: ' ', answer: 'x', passage: '' } ] },
      usage,
    } )
    await generateForNote( id, T0 )

    expect( findNote( id ) ).toMatchObject( {
      generation: 'failed',
      generation_error: 'No usable questions came back',
    } )
    expect( runs() ).toMatchObject( [ { outcome: 'failed', input_tokens: 2000 } ] )
    expect( listForNote( id ) ).toEqual( [] )
  } )

  it( 'hands a note edited since it was queued back to the scan', async () => {
    const id = await claimed()

    await generateForNote( id, T0 ) // first questions
    updateNote( id, { generation: 'generating' } )
    generate.mockClear()
    await vault.write( GENERICS_PATH, '# Generics\n\nA different body.\n' )

    await generateForNote( id, new Date( T0.getTime() + 60_000 ) )

    expect( generate ).not.toHaveBeenCalled()
    expect( findNote( id ) ).toMatchObject( { generation: 'queued', generation_error: null } )
    expect( listForNote( id ) ).toEqual( [] )
  } )

  it( 'marks a note whose file is gone as missing and idle', async () => {
    const id = await claimed()

    await vault.remove( GENERICS_PATH )
    await generateForNote( id, T0 )

    expect( generate ).not.toHaveBeenCalled()
    expect( findNote( id ) ).toMatchObject( { generation: 'idle' } )
    expect( findNote( id )?.missing_at ).not.toBeNull()
    expect( runs() ).toEqual( [] )
  } )

  it( 'does nothing for a note that is no longer enrolled', async () => {
    const id = await claimed()

    setEnrolled( [ id ], false, T0.toISOString() )
    await generateForNote( id, T0 )

    expect( generate ).not.toHaveBeenCalled()
    expect( findNote( id )?.generation ).toBe( 'idle' )
  } )

  it( 'does nothing for a note that already has questions for this body', async () => {
    const id = await claimed()

    addQuestion( id, { hash: noteAt( GENERICS_PATH ).body_hash } )
    await generateForNote( id, T0 )

    expect( generate ).not.toHaveBeenCalled()
    expect( findNote( id )?.generation ).toBe( 'idle' )
    expect( listForNote( id ) ).toHaveLength( 1 )
  } )

  it( 'keeps the queue entry when the note is edited during the call', async () => {
    const id = await claimed()

    generate.mockImplementation( async () => {
      await vault.write( GENERICS_PATH, '# Generics\n\nEdited while Claude was thinking.\n' )
      await scanLearningRoot( { force: true, now: new Date( T0.getTime() + 60_000 ) } )

      return reply()
    } )
    await generateForNote( id, T0 )

    expect( listForNote( id ) ).toEqual( [] )
    expect( findNote( id )?.generation ).toBe( 'queued' )
    expect( runs() ).toMatchObject( [ { outcome: 'succeeded' } ] )
  } )

  it( 'returns an unenrolled note edited during the call to idle', async () => {
    const id = await claimed()

    generate.mockImplementation( async () => {
      setEnrolled( [ id ], false, T0.toISOString() )
      await vault.write( GENERICS_PATH, '# Generics\n\nEdited and unenrolled.\n' )
      await scanLearningRoot( { force: true, now: new Date( T0.getTime() + 60_000 ) } )

      return reply()
    } )
    await generateForNote( id, T0 )

    expect( listForNote( id ) ).toEqual( [] )
    expect( findNote( id )?.generation ).toBe( 'idle' )
  } )

  it( 'leaves the note not idle when storing the questions fails', async () => {
    const id = await claimed()

    generate.mockResolvedValue( {
      output: { questions: [ { prompt: 'Q?', answer: 'A.', passage: '' } ] },
      usage,
    } )
    getDatabase().exec( `CREATE TRIGGER stop_insert BEFORE INSERT ON melete_questions
      BEGIN SELECT RAISE( ABORT, 'disk full' ); END` )

    await generateForNote( id, T0 )

    expect( findNote( id ) ).toMatchObject( {
      generation: 'failed',
      generation_error: 'disk full',
    } )
    expect( listForNote( id ) ).toEqual( [] )
  } )

  it( 'ignores an unknown note', async () => {
    const warn = vi.spyOn( logger, 'warn' )

    await expect( generateForNote( crypto.randomUUID(), T0 ) ).resolves.toBeUndefined()
    expect( generate ).not.toHaveBeenCalled()
    expect( warn ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'logs no note text', async () => {
    const id = await claimed()
    const spies = [ 'info', 'warn', 'error', 'debug' ].map( ( level ) => {
      return vi.spyOn( logger, level as 'info' )
    } )

    generate.mockRejectedValue( new MeleteError( 'Question generation was cut off', { usage } ) )
    await generateForNote( id, T0 )

    const logged = JSON.stringify( spies.flatMap( ( spy ) => spy.mock.calls ) )

    expect( logged ).not.toContain( 'generic type' )
    expect( logged ).not.toContain( 'Generics' )
  } )

  it( 'writes nothing to the vault', async () => {
    const id = await claimed()
    const before = await snapshot( vault.vaultPath )

    await generateForNote( id, T0 )

    expect( await snapshot( vault.vaultPath ) ).toEqual( before )
  } )
} )
