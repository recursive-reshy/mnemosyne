// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
// Shared
import { insertLink, isStale } from '@mnemosyne/shared'
import type { Job, SourceDocument, StoredLinkSuggestion } from '@mnemosyne/shared'
// App
import type { AutosaveState } from '#src/hooks/useAutosaveDraft'
import { useAcceptLinkSuggestions } from '#src/hooks/useAcceptLinkSuggestions'
import { useDebouncedValue } from '#src/hooks/useDebouncedValue'
import { useLinkSuggestions } from '#src/hooks/useLinkSuggestions'
import { useRejectLinkSuggestions } from '#src/hooks/useRejectLinkSuggestions'
import { LinkSuggestionsPanel } from '../LinkSuggestionsPanel'
import { SourcePane } from '../SourcePane'

const STALE_DEBOUNCE_MS = 300

type TabName = 'links' | 'source'

interface LinkReviewProps {
  job: Job
  autosave: AutosaveState
  source: SourceDocument | null
  sourceError: string | null
  focusSecond: number | null
}

const applyLinks = ( note: string, suggestions: StoredLinkSuggestion[] ): string => {
  return suggestions.reduce(
    ( text, suggestion ) => insertLink( text, suggestion, {
      asRelated: isStale( text, suggestion ),
    } ),
    note,
  )
}

export function LinkReview(
  { job, autosave, source, sourceError, focusSecond }: LinkReviewProps,
): ReactElement {
  const hasLinks = job.link_state === 'linked'
  const { suggestions, isLoading } = useLinkSuggestions( job.id, { enabled: hasLinks } )
  const accept = useAcceptLinkSuggestions( job.id )
  const reject = useRejectLinkSuggestions( job.id )
  const { note } = autosave
  const shownNote = useDebouncedValue( note, STALE_DEBOUNCE_MS )
  const [ selected, setSelected ] = useState< TabName | null >( null )

  const pending = suggestions
    .filter( ( { status } ) => status === 'pending' )
    .sort( ( a, b ) => a.position - b.position )

  if( selected === null && hasLinks && !isLoading && pending.length > 0 ) {
    setSelected( 'links' )
  }

  const tab = selected ?? 'source'
  const sourcePane = (
    <SourcePane
      source={ source }
      sourceType={ job.source_type }
      error={ sourceError }
      focusSecond={ focusSecond }
    />
  )

  if( job.status === 'summary_failed' ) {
    return sourcePane
  }

  const handleAccept = ( chosen: StoredLinkSuggestion[] ): void => {
    const next = applyLinks( note, chosen )

    reject.reset()
    autosave.replaceNote( next )
    accept.mutate(
      { ids: chosen.map( ( { id } ) => id ), note_markdown: next },
      { onSuccess: () => autosave.markSaved( next ) },
    )
  }

  const handleReject = ( chosen: StoredLinkSuggestion[] ): void => {
    accept.reset()
    reject.mutate( { ids: chosen.map( ( { id } ) => id ) } )
  }

  return (
    <Box sx={ { minWidth: 0 } }>
      <Tabs value={ tab } onChange={ ( _event, value: TabName ) => setSelected( value ) }>
        <Tab value="links" label={ `Suggested links (${ pending.length } pending)` } />
        <Tab value="source" label="Source" />
      </Tabs>
      <Box hidden={ tab !== 'links' } sx={ { pt: 2 } }>
        <LinkSuggestionsPanel
          suggestions={ suggestions }
          note={ shownNote }
          isBusy={ accept.isPending || reject.isPending }
          error={ accept.error?.message ?? reject.error?.message ?? null }
          onAccept={ ( suggestion ) => handleAccept( [ suggestion ] ) }
          onReject={ ( suggestion ) => handleReject( [ suggestion ] ) }
          onAcceptAll={ () => handleAccept( pending ) }
          onRejectAll={ () => handleReject( pending ) }
        />
      </Box>
      <Box hidden={ tab !== 'source' } sx={ { pt: 2 } }>
        { sourcePane }
      </Box>
    </Box>
  )
}
