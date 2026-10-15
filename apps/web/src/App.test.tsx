// Testing Library
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import { ApiError } from './api/apiError'
import { createJob } from './api/jobs.api'
import { App } from './App'
import { useJob } from './hooks/useJob'
import type { JobState } from './hooks/useJob'
import { jobFixture } from '#src/test-support/job.fixture'

vi.mock( './hooks/useJob' )
vi.mock( './api/jobs.api', async ( importOriginal ) => ( {
  ...await importOriginal< typeof import( './api/jobs.api' ) >(),
  createJob: vi.fn(),
} ) )

const mockedUseJob = vi.mocked( useJob )
const mockedCreateJob = vi.mocked( createJob )
const jobId = jobFixture().id
const newJobId = '7a1d9e2c-3b4f-4c5d-8e6f-0a1b2c3d4e5f'
const validUrl = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'

const showJob = ( job: Job | null, error: string | null = null ): void => {
  const state: JobState = { job, error }

  mockedUseJob.mockImplementation( ( id ) => id === null ? { job: null, error: null } : state )
}

const lastUseJobArgument = (): string | null | undefined => {
  return mockedUseJob.mock.calls.at( -1 )?.[ 0 ]
}

const startApp = ( search = '' ): ReturnType< typeof userEvent.setup > => {
  window.history.replaceState( null, '', `/${ search }` )
  render( <App /> )

  return userEvent.setup()
}

beforeEach( () => {
  mockedUseJob.mockReset()
  mockedCreateJob.mockReset()
  showJob( null )
} )

afterEach( () => {
  window.history.replaceState( null, '', '/' )
} )

describe( 'App', () => {
  it( 'shows the heading and the form without a job', () => {
    startApp()

    expect( screen.getByRole( 'heading', { level: 1, name: 'Mnemosyne' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'form', { name: 'Transcribe a video' } ) ).toBeInTheDocument()
    expect( lastUseJobArgument() ).toBeNull()
  } )

  it( 'creates a job and puts its id in the address', async () => {
    let resolve: ( id: string ) => void = () => undefined
    mockedCreateJob.mockReturnValue( new Promise< string >( ( resolver ) => {
      resolve = resolver
    } ) )
    showJob( jobFixture( { id: newJobId } ) )
    const user = startApp()

    await user.type( screen.getByRole( 'textbox', { name: 'Video URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( mockedCreateJob ).toHaveBeenCalledWith( validUrl )
    expect( screen.getByRole( 'button', { name: 'Starting…' } ) ).toBeDisabled()

    await act( async () => {
      resolve( newJobId )
      await Promise.resolve()
    } )

    expect( window.location.search ).toBe( `?job=${ newJobId }` )
    expect( lastUseJobArgument() ).toBe( newJobId )
    expect( screen.queryByRole( 'form', { name: 'Transcribe a video' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows a failed submit and lets the user try again', async () => {
    mockedCreateJob.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const user = startApp()

    await user.type( screen.getByRole( 'textbox', { name: 'Video URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( screen.getByRole( 'button', { name: 'Transcribe' } ) ).toBeEnabled()
  } )

  it( 'resumes the job in the address', () => {
    showJob( jobFixture( { status: 'downloading' } ) )
    startApp( `?job=${ jobId }` )

    expect( lastUseJobArgument() ).toBe( jobId )
    expect( screen.queryByRole( 'form', { name: 'Transcribe a video' } ) ).not.toBeInTheDocument()
  } )

  it( 'ignores an invalid job id and cleans the address', () => {
    startApp( '?job=not-a-uuid' )

    expect( screen.getByRole( 'form', { name: 'Transcribe a video' } ) ).toBeInTheDocument()
    expect( lastUseJobArgument() ).toBeNull()
    expect( window.location.pathname + window.location.search ).toBe( '/' )
  } )

  it( 'shows a loading status until the job arrives', () => {
    startApp( `?job=${ jobId }` )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading job…' )
  } )

  it( 'shows a vanished job and starts over', async () => {
    showJob( null, 'This job no longer exists. The server may have restarted.' )
    const user = startApp( `?job=${ jobId }` )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'This job no longer exists' )

    await user.click( screen.getByRole( 'button', { name: 'Start over' } ) )

    expect( screen.getByRole( 'form', { name: 'Transcribe a video' } ) ).toBeInTheDocument()
    expect( window.location.pathname + window.location.search ).toBe( '/' )
  } )

  it( 'shows progress without downloads for a running job', () => {
    showJob( jobFixture( { status: 'transcribing' } ) )
    startApp( `?job=${ jobId }` )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Transcribing…' )
    expect( screen.queryByRole( 'region', { name: 'Download transcript' } ) )
      .not.toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Transcribe another video' } ) )
      .toBeInTheDocument()
  } )

  it( 'shows the download links for a finished job', () => {
    showJob( jobFixture( { status: 'done' } ) )
    startApp( `?job=${ jobId }` )

    expect( screen.getByRole( 'region', { name: 'Download transcript' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Markdown (.md)' } ) )
      .toHaveAttribute( 'href', `/api/jobs/${ jobId }/download?format=md` )
  } )

  it( 'shows a connection error next to the job', () => {
    showJob( jobFixture( { status: 'downloading' } ), 'Could not reach the server' )
    startApp( `?job=${ jobId }` )

    expect( screen.getByRole( 'alert' ) )
      .toHaveTextContent( 'Could not reach the server. Retrying…' )
  } )

  it( 'retries a failed job with its URL', async () => {
    mockedCreateJob.mockResolvedValue( newJobId )
    showJob( jobFixture( { status: 'failed', error: 'Video unavailable' } ) )
    const user = startApp( `?job=${ jobId }` )

    await user.click( screen.getByRole( 'button', { name: 'Try again' } ) )

    expect( mockedCreateJob ).toHaveBeenCalledWith( jobFixture().url )
    expect( window.location.search ).toBe( `?job=${ newJobId }` )
  } )

  it( 'starts over from a finished job', async () => {
    showJob( jobFixture( { status: 'done' } ) )
    const user = startApp( `?job=${ jobId }` )

    await user.click( screen.getByRole( 'button', { name: 'Transcribe another video' } ) )

    expect( screen.getByRole( 'form', { name: 'Transcribe a video' } ) ).toBeInTheDocument()
    expect( window.location.pathname + window.location.search ).toBe( '/' )
    expect( lastUseJobArgument() ).toBeNull()
  } )
} )
