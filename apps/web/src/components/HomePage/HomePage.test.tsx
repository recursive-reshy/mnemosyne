// Testing Library
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '#src/api/apiError'
import { createJob } from '#src/api/jobs.api'
import { useJobs } from '#src/hooks/useJobs'
import { jobFixture } from '#src/test-support/job.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { HomePage } from './HomePage'

vi.mock( '#src/api/jobs.api' )
vi.mock( '#src/hooks/useJobs' )

const mockedCreateJob = vi.mocked( createJob )
const mockedUseJobs = vi.mocked( useJobs )
const newJobId = '7a1d9e2c-3b4f-4c5d-8e6f-0a1b2c3d4e5f'
const validUrl = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'

beforeEach( () => {
  mockedCreateJob.mockReset()
  mockedUseJobs.mockReset()
  mockedUseJobs.mockReturnValue( { jobs: [], error: null, updatedAt: 0 } )
} )

describe( 'HomePage', () => {
  it( 'shows the submit form', () => {
    renderWithClient( <HomePage /> )

    expect( screen.getByRole( 'form', { name: 'Transcribe a video' } ) ).toBeInTheDocument()
  } )

  it( 'lists the jobs under the form', () => {
    mockedUseJobs.mockReturnValue( {
      jobs: [ jobFixture( { title: 'How Rust Works', status: 'summarizing' } ) ],
      error: null,
      updatedAt: Date.now(),
    } )
    renderWithClient( <HomePage /> )

    expect( screen.getByRole( 'link', { name: 'How Rust Works' } ) ).toBeInTheDocument()
  } )

  it( 'confirms a save with the vault path', () => {
    renderWithClient( <HomePage />, {
      route: { pathname: '/', state: { savedPath: 'Mnemosyne/How Rust Works.md' } },
    } )

    expect( screen.getByRole( 'status' ) )
      .toHaveTextContent( 'Saved to Mnemosyne/How Rust Works.md' )
  } )

  it( 'shows no confirmation without a saved path', () => {
    renderWithClient( <HomePage /> )

    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'shows no list when there are no jobs', () => {
    renderWithClient( <HomePage /> )

    expect( screen.queryByRole( 'list', { name: 'Jobs' } ) ).not.toBeInTheDocument()
  } )

  it( 'creates a job and navigates to it', async () => {
    let resolve: ( id: string ) => void = () => undefined
    mockedCreateJob.mockReturnValue( new Promise< string >( ( resolver ) => {
      resolve = resolver
    } ) )
    const { location } = renderWithClient( <HomePage /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Video URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( mockedCreateJob ).toHaveBeenCalledWith( validUrl )
    expect( screen.getByRole( 'button', { name: 'Starting…' } ) ).toBeDisabled()

    await act( async () => {
      resolve( newJobId )
      await Promise.resolve()
    } )

    expect( location().pathname ).toBe( `/jobs/${ newJobId }` )
  } )

  it( 'shows a failed submit and lets the user try again', async () => {
    mockedCreateJob.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { location } = renderWithClient( <HomePage /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Video URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( screen.getByRole( 'button', { name: 'Transcribe' } ) ).toBeEnabled()
    expect( location().pathname ).toBe( '/' )
  } )
} )
