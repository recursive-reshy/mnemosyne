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
import { getGmailAccount } from './api/gmail.api'
import { useJob } from './hooks/useJob'
import { useMeleteToday } from './hooks/useMeleteToday'
import { gmailAccountFixture } from '#src/test-support/gmail.fixture'
import { jobFixture } from '#src/test-support/job.fixture'
import { meleteTodayFixture } from '#src/test-support/melete.fixture'
import { renderWithRouter } from '#src/test-support/renderWithRouter'

vi.mock( './api/gmail.api' )
vi.mock( './hooks/useJob' )
vi.mock( './hooks/useMeleteToday' )
vi.mock( './components/SettingsLayout', () => ( {
  SettingsLayout: () => <h2>Settings</h2>,
} ) )

const mockedUseJob = vi.mocked( useJob )
const jobId = jobFixture().id

beforeEach( () => {
  mockedUseJob.mockReset()
  vi.mocked( getGmailAccount ).mockResolvedValue( gmailAccountFixture() )
  mockedUseJob.mockReturnValue( { job: null, error: null } )
} )

describe( 'App', () => {
  it( 'shows the heading and the form on the home route', () => {
    renderWithRouter( '/' )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Mnemosyne' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeInTheDocument()
  } )

  it( 'shows Melete\'s Today on /melete', () => {
    vi.mocked( useMeleteToday ).mockReturnValue(
      { today: meleteTodayFixture(), isLoading: false, error: null },
    )
    renderWithRouter( '/melete' )

    expect( screen.getByRole( 'heading', { name: 'Today' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Start review' } ) ).toBeInTheDocument()
  } )

  it( 'shows the job on /jobs/:id', () => {
    mockedUseJob.mockReturnValue( { job: jobFixture( { status: 'downloading' } ), error: null } )
    renderWithRouter( `/jobs/${ jobId }` )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Mnemosyne' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Downloading audio…' )
    expect( screen.queryByRole( 'form', { name: 'Add a video or article' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'shows the settings page on /settings', () => {
    renderWithRouter( '/settings' )

    expect( screen.getByRole( 'heading', { level: 2, name: 'Settings' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'form', { name: 'Add a video or article' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'sends an unknown path to the home route', () => {
    const { location } = renderWithRouter( '/nowhere' )

    expect( location().pathname ).toBe( '/' )
    expect( screen.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeInTheDocument()
  } )
} )
