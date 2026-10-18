// Testing Library
import { screen, within } from '@testing-library/react'
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
import { useDismissFeedItems } from '#src/hooks/useDismissFeedItems'
import { useFeedInbox } from '#src/hooks/useFeedInbox'
import { useModels } from '#src/hooks/useModels'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { useSummarizeFeedItems } from '#src/hooks/useSummarizeFeedItems'
import { feedItemFixture, ITEM_ID } from '#src/test-support/feed.fixture'
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { FeedInbox } from './FeedInbox'

vi.mock( '#src/hooks/useFeedInbox' )
vi.mock( '#src/hooks/useDismissFeedItems' )
vi.mock( '#src/hooks/useSummarizeFeedItems' )
vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/useModels' )
vi.mock( '#src/hooks/usePromptProfiles' )

const SECOND_ID = '5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e'
const items = [
  feedItemFixture(),
  feedItemFixture( {
    id: SECOND_ID,
    title: 'A video',
    link: 'https://www.youtube.com/watch?v=abc',
    source_type: 'video',
    feed_name: 'A Channel',
    published_at: null,
    added_at: '2026-10-16T09:00:00.000Z',
  } ),
]

const mockInbox = ( list = items ): void => {
  vi.mocked( useFeedInbox ).mockReturnValue( { items: list, isLoading: false, error: null } )
}

const setup = ( { dismiss = vi.fn(), summarize = vi.fn() } = {} ) => {
  vi.mocked( useDismissFeedItems ).mockReturnValue( mutationStub( { mutate: dismiss } ) )
  vi.mocked( useSummarizeFeedItems ).mockReturnValue( mutationStub( { mutate: summarize } ) )
  renderWithClient( <FeedInbox /> )

  return { user: userEvent.setup(), dismiss, summarize }
}

beforeEach( () => {
  mockInbox()
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
} )

describe( 'FeedInbox', () => {
  it( 'shows nothing when the inbox is empty', () => {
    mockInbox( [] )
    setup()

    expect( screen.queryByRole( 'heading' ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'list' ) ).not.toBeInTheDocument()
  } )

  it( 'has a heading with the count', () => {
    setup()

    expect( screen.getByRole( 'heading', { name: 'From feeds (2)' } ) ).toBeInTheDocument()
  } )

  it( 'shows each item\'s feed, title link, date and type', () => {
    setup()
    const [ article, video ] = within( screen.getByRole( 'list', { name: 'Feed items' } ) )
      .getAllByRole( 'listitem' )

    expect( within( article ).getByText( 'Example Blog' ) ).toBeInTheDocument()
    const link = within( article ).getByRole( 'link', { name: 'A new post' } )
    expect( link ).toHaveAttribute( 'href', 'https://blog.example.com/a-new-post' )
    expect( link ).toHaveAttribute( 'target', '_blank' )
    expect( link ).toHaveAttribute( 'rel', 'noopener noreferrer' )
    expect( within( article ).getByText( '2026-10-17' ) ).toBeInTheDocument()
    expect( within( article ).getByRole( 'img', { name: 'Article' } ) ).toBeInTheDocument()
    expect( within( video ).getByRole( 'img', { name: 'Video' } ) ).toBeInTheDocument()
    expect( within( video ).getByText( '2026-10-16' ) ).toBeInTheDocument()
  } )

  it( 'disables Summarize and Dismiss until something is selected', () => {
    setup()

    expect( screen.getByRole( 'button', { name: 'Summarize selected' } ) ).toBeDisabled()
    expect( screen.getByRole( 'button', { name: 'Dismiss selected' } ) ).toBeDisabled()
  } )

  it( 'selects one item, then all, then none', async () => {
    const { user } = setup()
    const all = screen.getByRole( 'checkbox', { name: 'Select all' } )

    await user.click( screen.getByRole( 'checkbox', { name: 'Select A new post' } ) )
    expect( screen.getByRole( 'button', { name: 'Summarize selected' } ) ).toBeEnabled()
    expect( all ).toHaveAttribute( 'data-indeterminate', 'true' )

    await user.click( all )
    expect( screen.getByRole( 'checkbox', { name: 'Select A video' } ) ).toBeChecked()
    expect( all ).toBeChecked()

    await user.click( all )
    expect( screen.getByRole( 'checkbox', { name: 'Select A video' } ) ).not.toBeChecked()
    expect( screen.getByRole( 'button', { name: 'Dismiss selected' } ) ).toBeDisabled()
  } )

  it( 'dismisses the selected items', async () => {
    const { user, dismiss } = setup()

    await user.click( screen.getByRole( 'checkbox', { name: 'Select all' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Dismiss selected' } ) )

    expect( dismiss ).toHaveBeenCalledWith( [ ITEM_ID, SECOND_ID ], expect.any( Object ) )
  } )

  it( 'dismisses one item from its own button', async () => {
    const { user, dismiss } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Dismiss A video' } ) )

    expect( dismiss ).toHaveBeenCalledWith( [ SECOND_ID ], expect.any( Object ) )
  } )

  it( 'drops items that left the inbox from the selection', async () => {
    vi.mocked( useDismissFeedItems ).mockReturnValue( mutationStub() )
    vi.mocked( useSummarizeFeedItems ).mockReturnValue( mutationStub() )
    const user = userEvent.setup()
    const { rerender } = renderWithClient( <FeedInbox /> )
    await user.click( screen.getByRole( 'checkbox', { name: 'Select all' } ) )

    mockInbox( [ items[ 0 ] ] )
    rerender( <FeedInbox /> )
    await user.click( screen.getByRole( 'button', { name: 'Summarize selected' } ) )

    expect( screen.getByText( '1 item will become a job.' ) ).toBeInTheDocument()
  } )

  it( 'shows a dismiss error', () => {
    vi.mocked( useDismissFeedItems ).mockReturnValue(
      mutationStub( { isError: true, error: new Error( 'Could not reach the server' ) } ),
    )
    vi.mocked( useSummarizeFeedItems ).mockReturnValue( mutationStub() )
    renderWithClient( <FeedInbox /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
  } )

  it( 'summarizes the selection through the dialog', async () => {
    const { user, summarize } = setup()

    await user.click( screen.getByRole( 'checkbox', { name: 'Select all' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Summarize selected' } ) )
    expect( screen.getByText( '2 items will become jobs.' ) ).toBeInTheDocument()
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( summarize ).toHaveBeenCalledWith(
      { ids: [ ITEM_ID, SECOND_ID ] },
      expect.any( Object ),
    )
  } )

  it( 'summarizes one item from its own button', async () => {
    const { user, summarize } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Summarize A video' } ) )
    expect( screen.getByText( '1 item will become a job.' ) ).toBeInTheDocument()
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( summarize ).toHaveBeenCalledWith( { ids: [ SECOND_ID ] }, expect.any( Object ) )
  } )

  it( 'closes the dialog on cancel without summarizing', async () => {
    const { user, summarize } = setup()

    await user.click( screen.getByRole( 'button', { name: 'Summarize A video' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    await vi.waitFor( () => expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument() )
    expect( summarize ).not.toHaveBeenCalled()
  } )
} )
