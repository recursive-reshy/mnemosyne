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
import { useModels } from '#src/hooks/useModels'
import { modelsState } from '#src/test-support/hookStates'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { BUSINESS_ID } from '#src/test-support/summarizer.fixture'
import { SummaryInfo } from './SummaryInfo'

vi.mock( '#src/hooks/useModels' )

const usage = ( overrides: Record< string, unknown > = {} ) => ( {
  last_run: {
    model: 'claude-sonnet-5-5',
    profile_id: BUSINESS_ID,
    profile_name: 'Business ideas',
    prompt_version: 3,
    input_tokens: 31_200,
    output_tokens: 1_400,
    cost_usd: 0.1243,
    outcome: 'succeeded' as const,
    created_at: '2026-10-17T10:00:00.000Z',
  },
  run_count: 1,
  total_input_tokens: 31_200,
  total_output_tokens: 1_400,
  total_cost_usd: 0.1243,
  ...overrides,
} )

beforeEach( () => {
  vi.mocked( useModels ).mockReturnValue( modelsState() )
} )

describe( 'SummaryInfo', () => {
  it( 'shows how the summary was made, with the model\'s display name', () => {
    renderWithClient( <SummaryInfo usage={ usage() } /> )

    expect( screen.getByText(
      'Claude Sonnet 5.5 · Business ideas v3 · 31.2k in / 1.4k out · ~US$0.12',
    ) ).toBeInTheDocument()
  } )

  it( 'falls back to the model id when the model is not listed', () => {
    const retired = usage()
    retired.last_run.model = 'claude-retired-1'
    renderWithClient( <SummaryInfo usage={ retired } /> )

    expect( screen.getByText( /^claude-retired-1 · Business ideas v3/ ) ).toBeInTheDocument()
  } )

  it( 'falls back to the model id while the model list is loading', () => {
    vi.mocked( useModels ).mockReturnValue(
      modelsState( { models: [], source: null, isLoading: true } ),
    )
    renderWithClient( <SummaryInfo usage={ usage() } /> )

    expect( screen.getByText( /^claude-sonnet-5-5 · Business ideas v3/ ) ).toBeInTheDocument()
  } )

  it( 'adds the attempts and the total when there was more than one', () => {
    renderWithClient( <SummaryInfo usage={ usage( { run_count: 2, total_cost_usd: 0.25 } ) } /> )

    expect( screen.getByText( '2 attempts, ~US$0.25 total' ) ).toBeInTheDocument()
  } )

  it( 'shows no attempts line for a single attempt', () => {
    renderWithClient( <SummaryInfo usage={ usage() } /> )

    expect( screen.queryByText( /attempts/ ) ).not.toBeInTheDocument()
  } )
} )
