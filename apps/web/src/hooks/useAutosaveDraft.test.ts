// Testing Library
import { act } from '@testing-library/react'
// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { Job } from '@mnemosyne/shared'
// App
import { ApiError } from '../api/apiError'
import { updateDraft } from '../api/jobs.api'
import { jobFixture } from '../test-support/job.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { jobKeys } from './queryKeys'
import { useAutosaveDraft } from './useAutosaveDraft'

vi.mock( '../api/jobs.api' )

const mockedUpdateDraft = vi.mocked( updateDraft )

const job = jobFixture( {
  status: 'ready_for_review',
  note_markdown: 'original',
  target_folder: null,
  expires_at: '2026-10-16T10:00:00.000Z',
} )

const saved = ( overrides: Partial< Job > ): Job => ( { ...job, ...overrides } )

const setup = () => renderHookWithClient( () => useAutosaveDraft( job ) )

const deferred = () => {
  let resolve: ( value: Job ) => void = () => undefined
  let reject: ( reason: Error ) => void = () => undefined
  const promise = new Promise< Job >( ( resolver, rejecter ) => {
    resolve = resolver
    reject = rejecter
  } )

  return { promise, resolve, reject }
}

beforeEach( () => {
  vi.useFakeTimers()
  mockedUpdateDraft.mockReset()
  mockedUpdateDraft.mockImplementation(
    ( _id, body ) => {
      return Promise.resolve( saved( { note_markdown: body.note_markdown ?? 'original' } ) )
    },
  )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useAutosaveDraft', () => {
  it( 'starts from the job and is saved', () => {
    const { result } = setup()

    expect( result.current ).toMatchObject( {
      note: 'original',
      folder: null,
      status: 'saved',
      message: null,
    } )
  } )

  it( 'marks an edit unsaved and sends nothing before the debounce', async () => {
    const { result } = setup()

    act( () => result.current.setNote( 'edited' ) )
    await act( () => vi.advanceTimersByTimeAsync( 1499 ) )

    expect( result.current.note ).toBe( 'edited' )
    expect( result.current.status ).toBe( 'unsaved' )
    expect( mockedUpdateDraft ).not.toHaveBeenCalled()
  } )

  it( 'sends one request with the latest text after 1500 ms of quiet', async () => {
    const { result } = setup()

    act( () => result.current.setNote( 'a' ) )
    await act( () => vi.advanceTimersByTimeAsync( 1000 ) )
    act( () => result.current.setNote( 'ab' ) )
    await act( () => vi.advanceTimersByTimeAsync( 1000 ) )

    expect( mockedUpdateDraft ).not.toHaveBeenCalled()

    await act( () => vi.advanceTimersByTimeAsync( 500 ) )

    expect( mockedUpdateDraft ).toHaveBeenCalledExactlyOnceWith( job.id, { note_markdown: 'ab' } )
    expect( result.current.status ).toBe( 'saved' )
  } )

  it( 'flush() sends at once and resolves true', async () => {
    const { result } = setup()
    act( () => result.current.setNote( 'edited' ) )

    let outcome: boolean | undefined
    await act( async () => {
      outcome = await result.current.flush()
    } )

    expect( outcome ).toBe( true )
    expect( mockedUpdateDraft ).toHaveBeenCalledExactlyOnceWith(
      job.id,
      { note_markdown: 'edited' },
    )
  } )

  it( 'flush() with nothing to send resolves true without a request', async () => {
    const { result } = setup()

    let outcome: boolean | undefined
    await act( async () => {
      outcome = await result.current.flush()
    } )

    expect( outcome ).toBe( true )
    expect( mockedUpdateDraft ).not.toHaveBeenCalled()
  } )

  it( 'shows saving, then saved', async () => {
    const request = deferred()
    mockedUpdateDraft.mockReturnValue( request.promise )
    const { result } = setup()

    act( () => result.current.setNote( 'edited' ) )
    await act( () => vi.advanceTimersByTimeAsync( 1500 ) )

    expect( result.current.status ).toBe( 'saving' )

    await act( () => {
      request.resolve( saved( { note_markdown: 'edited' } ) )

      return request.promise
    } )

    expect( result.current.status ).toBe( 'saved' )
  } )

  it( 'keeps one request in flight and sends later edits afterwards, latest wins', async () => {
    const first = deferred()
    mockedUpdateDraft.mockReturnValueOnce( first.promise )
    const { result } = setup()

    act( () => result.current.setNote( 'one' ) )
    await act( () => vi.advanceTimersByTimeAsync( 1500 ) )
    act( () => result.current.setNote( 'two' ) )
    act( () => result.current.setNote( 'three' ) )
    await act( () => vi.advanceTimersByTimeAsync( 1500 ) )

    expect( mockedUpdateDraft ).toHaveBeenCalledTimes( 1 )

    await act( () => {
      first.resolve( saved( { note_markdown: 'one' } ) )

      return first.promise
    } )

    expect( mockedUpdateDraft ).toHaveBeenCalledTimes( 2 )
    expect( mockedUpdateDraft ).toHaveBeenLastCalledWith( job.id, { note_markdown: 'three' } )
    expect( result.current.note ).toBe( 'three' )
    expect( result.current.status ).toBe( 'saved' )
  } )

  it( 'puts the returned job in the cache, with its new expiry', async () => {
    mockedUpdateDraft.mockResolvedValue(
      saved( { note_markdown: 'edited', expires_at: '2026-10-17T10:00:00.000Z' } ),
    )
    const { result, queryClient } = setup()
    act( () => result.current.setNote( 'edited' ) )

    await act( async () => {
      await result.current.flush()
    } )

    expect( queryClient.getQueryData< Job >( jobKeys.detail( job.id ) )?.expires_at )
      .toBe( '2026-10-17T10:00:00.000Z' )
  } )

  it( 'keeps the local text and shows the reason when the server refuses', async () => {
    mockedUpdateDraft.mockRejectedValue(
      new ApiError( 'front-matter invalid: bad YAML', 400 ),
    )
    const { result } = setup()
    act( () => result.current.setNote( 'broken' ) )

    let outcome: boolean | undefined
    await act( async () => {
      outcome = await result.current.flush()
    } )

    expect( outcome ).toBe( false )
    expect( result.current.status ).toBe( 'error' )
    expect( result.current.message ).toBe( 'front-matter invalid: bad YAML' )
    expect( result.current.note ).toBe( 'broken' )
  } )

  it( 'retries on the next edit after an error', async () => {
    mockedUpdateDraft.mockRejectedValueOnce( new ApiError( 'boom', 500 ) )
    const { result } = setup()
    act( () => result.current.setNote( 'broken' ) )
    await act( async () => {
      await result.current.flush()
    } )

    act( () => result.current.setNote( 'fixed' ) )
    await act( () => vi.advanceTimersByTimeAsync( 1500 ) )

    expect( mockedUpdateDraft ).toHaveBeenLastCalledWith( job.id, { note_markdown: 'fixed' } )
    expect( result.current.status ).toBe( 'saved' )
    expect( result.current.message ).toBeNull()
  } )

  it( 'sends a folder change at once, with the folder only', async () => {
    mockedUpdateDraft.mockResolvedValue( saved( { target_folder: 'Learning/AI' } ) )
    const { result } = setup()

    await act( async () => {
      result.current.setFolder( 'Learning/AI' )
      await vi.advanceTimersByTimeAsync( 0 )
    } )

    expect( mockedUpdateDraft ).toHaveBeenCalledExactlyOnceWith(
      job.id,
      { target_folder: 'Learning/AI' },
    )
    expect( result.current.folder ).toBe( 'Learning/AI' )
  } )

  it( 'can clear the folder', async () => {
    mockedUpdateDraft.mockResolvedValue( saved( { target_folder: null } ) )
    const { result } = renderHookWithClient(
      () => useAutosaveDraft( { ...job, target_folder: 'Learning' } ),
    )

    await act( async () => {
      result.current.setFolder( null )
      await vi.advanceTimersByTimeAsync( 0 )
    } )

    expect( mockedUpdateDraft ).toHaveBeenCalledExactlyOnceWith(
      job.id,
      { target_folder: null },
    )
  } )

  it( 'adopts the server note only when nothing is unsent', async () => {
    mockedUpdateDraft.mockResolvedValue( saved( { note_markdown: 'normalized' } ) )
    const { result } = setup()
    act( () => result.current.setNote( 'edited' ) )
    await act( async () => {
      await result.current.flush()
    } )

    act( () => result.current.setNote( 'edited more' ) )
    act( () => result.current.adoptServerNote() )

    expect( result.current.note ).toBe( 'edited more' )

    await act( async () => {
      await result.current.flush()
    } )
    mockedUpdateDraft.mockClear()
    act( () => result.current.adoptServerNote() )

    expect( result.current.note ).toBe( 'normalized' )
    expect( mockedUpdateDraft ).not.toHaveBeenCalled()
  } )

  it( 'sends a pending edit when it unmounts', async () => {
    const { result, unmount } = setup()
    act( () => result.current.setNote( 'edited' ) )

    unmount()
    await vi.advanceTimersByTimeAsync( 0 )

    expect( mockedUpdateDraft ).toHaveBeenCalledExactlyOnceWith(
      job.id,
      { note_markdown: 'edited' },
    )
  } )
} )
