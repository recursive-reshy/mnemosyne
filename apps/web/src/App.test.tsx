// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useJob } from './hooks/useJob'
import { App } from './App'
import { jobFixture } from '#src/test-support/job.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'

vi.mock( './hooks/useJob' )
vi.mock( './components/SettingsPage', () => ( {
  SettingsPage: () => <h2>Settings</h2>,
} ) )

const mockedUseJob = vi.mocked( useJob )
const jobId = jobFixture().id

beforeEach( () => {
  mockedUseJob.mockReset()
  mockedUseJob.mockReturnValue( { job: null, error: null } )
} )

describe( 'App', () => {
  it( 'shows the heading and the form on the home route', () => {
    renderWithClient( <App /> )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Mnemosyne' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeInTheDocument()
  } )

  it( 'shows the job on /jobs/:id', () => {
    mockedUseJob.mockReturnValue( { job: jobFixture( { status: 'downloading' } ), error: null } )
    renderWithClient( <App />, { route: `/jobs/${ jobId }` } )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Mnemosyne' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Downloading audio…' )
    expect( screen.queryByRole( 'form', { name: 'Add a video or article' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'shows the settings page on /settings', () => {
    renderWithClient( <App />, { route: '/settings' } )

    expect( screen.getByRole( 'heading', { level: 2, name: 'Settings' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'form', { name: 'Add a video or article' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'sends an unknown path to the home route', () => {
    const { location } = renderWithClient( <App />, { route: '/nowhere' } )

    expect( location().pathname ).toBe( '/' )
    expect( screen.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeInTheDocument()
  } )
} )
