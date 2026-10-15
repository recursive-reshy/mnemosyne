// React
import { useMemo } from 'react'
import type { ReactElement } from 'react'
// Shared
import { formatClock, groupParagraphs } from '@mnemosyne/shared'
import type { Transcript } from '@mnemosyne/shared'
// App
import styles from './TranscriptPane.module.css'

interface TranscriptPaneProps {
  transcript: Transcript | null
  error: string | null
}

export function TranscriptPane( { transcript, error }: TranscriptPaneProps ): ReactElement {
  const paragraphs = useMemo( () => {
    return transcript === null ? [] : groupParagraphs( transcript.segments )
  }, [ transcript ] )

  return (
    <section className={ styles.pane } aria-label="Transcript">
      { error !== null && <p className="alert" role="alert">{ error }</p> }
      { error === null && transcript === null && <p role="status">Loading transcript…</p> }
      { paragraphs.map( ( { start, text } ) => (
        <p
          key={ start }
          id={ `transcript-${ Math.floor( start ) }` }
          className={ styles.paragraph }
        >
          <span className={ styles.stamp }>{ `[${ formatClock( start ) }]` }</span>
          { ' ' }
          { text }
        </p>
      ) ) }
    </section>
  )
}
