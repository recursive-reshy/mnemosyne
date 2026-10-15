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
import { renderWithClient } from '#src/test-support/renderWithClient'
import { HomePage } from './HomePage'

vi.mock( '#src/api/jobs.api' )

const mockedCreateJob = vi.mocked( createJob )
const newJobId = '7a1d9e2c-3b4f-4c5d-8e6f-0a1b2c3d4e5f'
const validUrl = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'

beforeEach( () => {
  mockedCreateJob.mockReset()
} )

describe( 'HomePage', () => {
  it( 'shows the submit form', () => {
    renderWithClient( <HomePage /> )

    expect( screen.getByRole( 'form', { name: 'Transcribe a video' } ) ).toBeInTheDocument()
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
