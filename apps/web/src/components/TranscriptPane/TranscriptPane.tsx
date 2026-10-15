// React
import { useEffect, useMemo, useRef } from 'react'
import type { ReactElement } from 'react'
// Shared
import { formatClock, groupParagraphs } from '@mnemosyne/shared'
import type { Transcript } from '@mnemosyne/shared'
// App
import styles from './TranscriptPane.module.css'

interface TranscriptPaneProps {
  transcript: Transcript | null
  error: string | null
  focusSecond: number | null
}

export function TranscriptPane(
  { transcript, error, focusSecond }: TranscriptPaneProps,
): ReactElement {
  const paneRef = useRef< HTMLElement >( null )
  const paragraphs = useMemo( () => {
    return transcript === null ? [] : groupParagraphs( transcript.segments )
  }, [ transcript ] )

  const activeStart = useMemo( () => {
    if( focusSecond === null ) {
      return null
    }

    const started = paragraphs.filter( ( { start } ) => start <= focusSecond )

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
    <section ref={ paneRef } className={ styles.pane } aria-label="Transcript">
      { error !== null && <p className="alert" role="alert">{ error }</p> }
      { error === null && transcript === null && <p role="status">Loading transcript…</p> }
      { paragraphs.map( ( { start, text } ) => (
        <p
          key={ start }
          id={ `transcript-${ Math.floor( start ) }` }
          className={ styles.paragraph }
          aria-current={ start === activeStart ? 'true' : undefined }
        >
          <span className={ styles.stamp }>{ `[${ formatClock( start ) }]` }</span>
          { ' ' }
          { text }
        </p>
      ) ) }
    </section>
  )
}
