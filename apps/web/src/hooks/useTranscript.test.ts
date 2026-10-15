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
import type { Transcript } from '@mnemosyne/shared'
// App
import { ApiError } from '../api/apiError'
import { getTranscript } from '../api/jobs.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { jobKeys } from './queryKeys'
import { useTranscript } from './useTranscript'

vi.mock( '../api/jobs.api' )

const mockedGetTranscript = vi.mocked( getTranscript )

const transcript: Transcript = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  segments: [ { start: 0, end: 4, text: 'Hello.' } ],
}

const advance = async ( milliseconds: number ): Promise< void > => {
  await act( async () => {
    await vi.advanceTimersByTimeAsync( milliseconds )
  } )
}

beforeEach( () => {
  vi.useFakeTimers()
  mockedGetTranscript.mockReset()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useTranscript', () => {
  it( 'fetches the transcript once and never polls', async () => {
    mockedGetTranscript.mockResolvedValue( transcript )

    const { result } = renderHookWithClient( () => useTranscript( 'a' ) )
    expect( result.current ).toEqual( { transcript: null, error: null } )

    await advance( 0 )
    await advance( 60_000 )

    expect( result.current ).toEqual( { transcript, error: null } )
    expect( mockedGetTranscript ).toHaveBeenCalledExactlyOnceWith( 'a' )
  } )

  it( 'stores it under the transcript key', async () => {
    mockedGetTranscript.mockResolvedValue( transcript )

    const { queryClient } = renderHookWithClient( () => useTranscript( 'a' ) )
    await advance( 0 )

    expect( queryClient.getQueryData( jobKeys.transcript( 'a' ) ) ).toEqual( transcript )
  } )

  it( 'reports the error message', async () => {
    mockedGetTranscript.mockRejectedValue( new ApiError( 'Transcript not ready', 409 ) )

    const { result } = renderHookWithClient( () => useTranscript( 'a' ) )
    await advance( 0 )

    expect( result.current ).toEqual( { transcript: null, error: 'Transcript not ready' } )
  } )

  it( 'does nothing without an id', async () => {
    renderHookWithClient( () => useTranscript( null ) )
    await advance( 1000 )

    expect( mockedGetTranscript ).not.toHaveBeenCalled()
  } )
} )
