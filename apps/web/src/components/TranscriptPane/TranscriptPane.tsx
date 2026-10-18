// React
import { useEffect, useMemo, useRef } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
// Shared
import { formatClock, groupParagraphs } from '@mnemosyne/shared'
import type { Transcript } from '@mnemosyne/shared'
// App

const PANE_SX = {
  position: 'relative',
  minWidth: 0,
  maxHeight: '32rem',
  overflowY: 'auto',
  px: 2,
  py: 1,
} as const

const PARAGRAPH_SX = {
  mb: 2,
  pl: 1,
  borderLeft: 4,
  borderColor: 'transparent',
  '&[aria-current="true"]': { borderColor: 'primary.main', fontWeight: 600 },
} as const

const STAMP_SX = { fontVariantNumeric: 'tabular-nums' } as const

interface TranscriptPaneProps {
  transcript: Transcript | null
  error: string | null
  focusSecond: number | null
}

export function TranscriptPane(
  { transcript, error, focusSecond }: TranscriptPaneProps,
): ReactElement {
  const paneRef = useRef< HTMLDivElement >( null )
  const paragraphs = useMemo( () => {
    return transcript === null ? [] : groupParagraphs( transcript.segments )
  }, [ transcript ] )

  const activeStart = useMemo( () => {
    if( focusSecond === null ) {
      return null
    }

    // The note cites whole seconds, while paragraphs start on a fraction of one.
    const started = paragraphs.filter( ( { start } ) => Math.floor( start ) <= focusSecond )

    return started.at( -1 )?.start ?? null
  }, [ paragraphs, focusSecond ] )

  useEffect( () => {
    if( activeStart === null || paneRef.current === null ) {
      return
    }

    const element = document.getElementById( `transcript-${ Math.floor( activeStart ) }` )

    if( element !== null ) {
      paneRef.current.scrollTop = element.offsetTop
    }
  }, [ activeStart ] )

  return (
    <Paper
      ref={ paneRef }
      component="section"
      variant="outlined"
      aria-label="Transcript"
      sx={ PANE_SX }
    >
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { error === null && transcript === null && (
        <Typography role="status">Loading transcript…</Typography>
      ) }
      { paragraphs.map( ( { start, text } ) => (
        <Typography
          key={ start }
          component="p"
          id={ `transcript-${ Math.floor( start ) }` }
          aria-current={ start === activeStart ? 'true' : undefined }
          sx={ PARAGRAPH_SX }
        >
          <Typography component="span" color="text.secondary" sx={ STAMP_SX }>
            { `[${ formatClock( start ) }]` }
          </Typography>
          { ' ' }
          { text }
        </Typography>
      ) ) }
    </Paper>
  )
}
