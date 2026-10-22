// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import { GetNextReviewResponse } from '@mnemosyne/shared'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Repositories
import { listNotesUnder } from '../repositories/meleteNotes.repository.js'
import { findQuestion } from '../repositories/meleteQuestions.repository.js'
import { insertReview } from '../repositories/meleteReviews.repository.js'
import { listSubjects } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { setNoteEnrolled, setSubjectEnrolled, updateSubject } from './melete.service.js'
import { getNextReview } from './meleteReview.service.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
// Test support
import { addQuestion } from '../test-support/meleteData.fixture.js'
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'

const configMock = vi.hoisted( () => ( {
  logLevel: 'silent',
  vaultPath: '',
  timeZone: 'Asia/Singapore',
  obsidianVaultName: undefined as string | undefined,
  melete: { requestRetention: 0.9, dayStartHour: 4, gradingTimeoutMs: 20_000 },
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )

// 18:00 in Singapore, so the day started at 2026-10-21T20:00Z
const NOW = new Date( '2026-10-22T10:00:00.000Z' )
const at = ( seconds: number ): Date => new Date( NOW.getTime() + seconds * 1000 )
const iso = ( seconds: number ): string => at( seconds ).toISOString()

const GENERICS = 'TypeScript/Generics.md'
const CONDITIONAL = 'TypeScript/Advanced/Conditional Types.md'
const OWNERSHIP = 'Rust/Ownership.md'

let vault: MeleteVault

const noteId = ( path: string ): string => {
  const found = listNotesUnder( 'Learning' ).find( ( note ) => {
    return note.path === `Learning/${ path }` && note.missing_at === null
  } )

  if( found === undefined ) {
    throw new Error( `No note ${ path }` )
  }

  return found.id
}

const subjectId = ( name: string ): string => {
  const found = listSubjects().find( ( { folder } ) => folder === `Learning/${ name }` )

  if( found === undefined ) {
    throw new Error( `No subject ${ name }` )
  }

  return found.id
}

const reviewNew = ( questionId: string, atTime: string ): void => {
  insertReview( {
    question_id: questionId,
    reviewed_at: atTime,
    mode: 'quick',
    rating: 'good',
    suggested_rating: null,
    answer: null,
    grade_run_id: null,
    was_new: true,
    before_state: '{}',
  } )
}

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultPath = vault.vaultPath
  configMock.obsidianVaultName = undefined
  configMock.melete.dayStartHour = 4
  setSetting( 'melete_learning_root', 'Learning' )
  resetScanClock()
  await scanLearningRoot( { force: true, now: at( -60 ) } )
  await setSubjectEnrolled( subjectId( 'TypeScript' ), true, at( -50 ) )
  await setSubjectEnrolled( subjectId( 'Rust' ), true, at( -50 ) )
} )

afterEach( async () => {
  await vault.cleanup()
} )

describe( 'getNextReview', () => {
  it( 'asks for a learning root first', async () => {
    setSetting( 'melete_learning_root', null )

    await expect( getNextReview( { now: at( 0 ) } ) ).rejects.toThrow( ConflictError )
  } )

  it( 'has nothing to show when there are no questions', async () => {
    expect( await getNextReview( { now: at( 0 ) } ) ).toEqual( {
      item: null,
      counts: { due: 0, new_remaining: 0, learning_soon: 0 },
    } )
  } )

  it( 'serves a due question before a new one', async () => {
    const generics = noteId( GENERICS )
    addQuestion( generics, { position: 1 } )
    const due = addQuestion( generics, { position: 2, fsrsState: 'review', due: iso( -60 ) } )

    const { item } = await getNextReview( { now: at( 0 ) } )

    expect( item?.question.id ).toBe( due )
  } )

  it( 'serves learning and relearning questions before review ones', async () => {
    const generics = noteId( GENERICS )
    addQuestion( generics, { position: 1, fsrsState: 'review', due: iso( -3600 ) } )
    const relearning = addQuestion( generics, {
      position: 2,
      fsrsState: 'relearning',
      due: iso( -60 ),
    } )

    const { item } = await getNextReview( { now: at( 0 ) } )

    expect( item?.question.id ).toBe( relearning )
  } )

  it( 'serves the earliest due question first among those of the same kind', async () => {
    const generics = noteId( GENERICS )
    addQuestion( generics, { position: 1, fsrsState: 'review', due: iso( -60 ) } )
    const earlier = addQuestion( generics, { position: 2, fsrsState: 'review', due: iso( -600 ) } )

    expect( ( await getNextReview( { now: at( 0 ) } ) ).item?.question.id ).toBe( earlier )
  } )

  it( 'serves new questions by note path then position, stamping the first', async () => {
    const conditional = noteId( CONDITIONAL )
    const generics = noteId( GENERICS )
    addQuestion( generics, { position: 1 } )
    const first = addQuestion( conditional, { position: 1 } )
    addQuestion( conditional, { position: 2 } )

    const { item, counts } = await getNextReview( { now: at( 0 ) } )

    expect( item?.question.id ).toBe( first )
    expect( item?.question ).toMatchObject( { fsrs_state: 'new', due: iso( 0 ) } )
    expect( findQuestion( first ) ).toMatchObject( { fsrs_state: 'new', due: iso( 0 ) } )
    expect( counts ).toEqual( { due: 1, new_remaining: 2, learning_soon: 0 } )
  } )

  it( 'serves the same new question again until it is rated', async () => {
    const generics = noteId( GENERICS )
    const first = addQuestion( generics, { position: 1 } )
    addQuestion( generics, { position: 2 } )

    await getNextReview( { now: at( 0 ) } )
    const again = await getNextReview( { now: at( 30 ) } )

    expect( again.item?.question.id ).toBe( first )
    expect( findQuestion( first )?.due ).toBe( iso( 0 ) )
  } )

  it( 'stops serving new questions once the subject\'s limit for the day is used', async () => {
    const generics = noteId( GENERICS )
    updateSubject( subjectId( 'TypeScript' ), { new_per_day: 2 } )
    const reviewed = [ 1, 2 ].map( ( position ) => {
      return addQuestion( generics, { position, fsrsState: 'review', due: iso( 86_400 ) } )
    } )
    addQuestion( generics, { position: 3 } )
    reviewed.forEach( ( id ) => reviewNew( id, '2026-10-21T21:00:00.000Z' ) )

    expect( await getNextReview( { now: at( 0 ) } ) ).toEqual( {
      item: null,
      counts: { due: 0, new_remaining: 0, learning_soon: 0 },
    } )
  } )

  it( 'does not count new questions reviewed before the day started', async () => {
    const generics = noteId( GENERICS )
    updateSubject( subjectId( 'TypeScript' ), { new_per_day: 1 } )
    const old = addQuestion( generics, { position: 1, fsrsState: 'review', due: iso( 86_400 ) } )
    const next = addQuestion( generics, { position: 2 } )
    reviewNew( old, '2026-10-21T19:59:00.000Z' )

    const { item } = await getNextReview( { now: at( 0 ) } )

    expect( item?.question.id ).toBe( next )
  } )

  it( 'starts the day at midnight when the start hour is 0', async () => {
    const generics = noteId( GENERICS )
    configMock.melete.dayStartHour = 0
    updateSubject( subjectId( 'TypeScript' ), { new_per_day: 1 } )
    const old = addQuestion( generics, { position: 1, fsrsState: 'review', due: iso( 86_400 ) } )
    addQuestion( generics, { position: 2 } )
    reviewNew( old, '2026-10-21T19:59:00.000Z' )

    expect( ( await getNextReview( { now: at( 0 ) } ) ).item ).toBeNull()
  } )

  it( 'serves no new questions when the limit is 0', async () => {
    updateSubject( subjectId( 'TypeScript' ), { new_per_day: 0 } )
    addQuestion( noteId( GENERICS ) )

    const { item, counts } = await getNextReview( { now: at( 0 ) } )

    expect( item ).toBeNull()
    expect( counts.new_remaining ).toBe( 0 )
  } )

  it( 'leaves out unenrolled and missing notes and dropped and retired questions', async () => {
    const generics = noteId( GENERICS )
    const conditional = noteId( CONDITIONAL )
    const ownership = noteId( OWNERSHIP )
    addQuestion( generics, { position: 1, state: 'dropped', fsrsState: 'review', due: iso( -60 ) } )
    addQuestion( generics, { position: 2, state: 'retired', fsrsState: 'review', due: iso( -60 ) } )
    addQuestion( conditional, { fsrsState: 'review', due: iso( -60 ) } )
    addQuestion( ownership, { fsrsState: 'review', due: iso( -60 ) } )
    setNoteEnrolled( conditional, false, at( 0 ) )
    await vault.remove( 'Learning/Rust/Ownership.md' )
    resetScanClock()

    expect( ( await getNextReview( { now: at( 0 ) } ) ).item ).toBeNull()
  } )

  it( 'brings a learning question back a few minutes early, and not a distant one', async () => {
    const generics = noteId( GENERICS )
    const soon = addQuestion( generics, { fsrsState: 'learning', due: iso( 10 * 60 ) } )

    const found = await getNextReview( { now: at( 0 ) } )

    expect( found.item?.question.id ).toBe( soon )
    expect( found.counts ).toEqual( { due: 0, new_remaining: 0, learning_soon: 1 } )
    expect( ( await getNextReview( { now: at( -15 * 60 ) } ) ).item ).toBeNull()
  } )

  it( 'serves a new question before a learning one that is only coming up', async () => {
    const generics = noteId( GENERICS )
    addQuestion( generics, { position: 1, fsrsState: 'learning', due: iso( 5 * 60 ) } )
    const fresh = addQuestion( generics, { position: 2 } )

    expect( ( await getNextReview( { now: at( 0 ) } ) ).item?.question.id ).toBe( fresh )
  } )

  it( 'limits everything to one subject when asked', async () => {
    const typescript = subjectId( 'TypeScript' )
    const rust = subjectId( 'Rust' )
    addQuestion( noteId( GENERICS ), { fsrsState: 'review', due: iso( -600 ) } )
    const ownership = addQuestion( noteId( OWNERSHIP ), { fsrsState: 'review', due: iso( -60 ) } )

    const scoped = await getNextReview( { subjectId: rust, now: at( 0 ) } )

    expect( scoped.item?.question.id ).toBe( ownership )
    expect( scoped.counts.due ).toBe( 1 )
    const other = await getNextReview( { subjectId: typescript, now: at( 0 ) } )

    expect( other.counts.due ).toBe( 1 )
    expect( ( await getNextReview( { now: at( 0 ) } ) ).counts.due ).toBe( 2 )
  } )

  it( 'refuses an unknown subject', async () => {
    await expect( getNextReview( { subjectId: crypto.randomUUID(), now: at( 0 ) } ) )
      .rejects.toThrow( NotFoundError )
  } )

  it( 'refuses a subject that is no longer in the learning root', async () => {
    const rust = subjectId( 'Rust' )

    setSetting( 'melete_learning_root', 'Inbox' )
    resetScanClock()

    await expect( getNextReview( { subjectId: rust, now: at( 0 ) } ) )
      .rejects.toThrow( NotFoundError )
  } )

  it( 'describes the note and links to it in Obsidian when the vault is named', async () => {
    configMock.obsidianVaultName = 'Brain'
    addQuestion( noteId( GENERICS ), { fsrsState: 'review', due: iso( -60 ) } )

    const response = GetNextReviewResponse.parse( await getNextReview( { now: at( 0 ) } ) )

    expect( response.item?.note ).toMatchObject( {
      title: 'Generics in TypeScript',
      path: 'Learning/TypeScript/Generics.md',
      subject_name: 'TypeScript',
    } )
    expect( response.item?.obsidian_url )
      .toBe( 'obsidian://open?vault=Brain&file=Learning%2FTypeScript%2FGenerics' )
  } )

  it( 'has no Obsidian link when the vault is not named', async () => {
    addQuestion( noteId( GENERICS ), { fsrsState: 'review', due: iso( -60 ) } )

    expect( ( await getNextReview( { now: at( 0 ) } ) ).item?.obsidian_url ).toBeNull()
  } )

  it( 'notices a note edited in the vault before building the queue', async () => {
    const generics = noteId( GENERICS )
    addQuestion( generics, { fsrsState: 'review', due: iso( -60 ), hash: 'old' } )
    await vault.write( 'Learning/TypeScript/Generics.md', '# Generics\n\nChanged.\n' )
    resetScanClock()

    await getNextReview( { now: at( 60 ) } )

    expect( listNotesUnder( 'Learning' ).find( ( { id } ) => id === generics )?.generation )
      .toBe( 'queued' )
  } )
} )
