// Transcript
import { Segment } from './transcript.js'

export type Paragraph = { start: number, text: string }

const GAP_SECONDS = 2
const SOFT_SPAN_SECONDS = 45
const HARD_SPAN_SECONDS = 90

export const cleanText = ( text: string ): string => {
  return text.replace( /\s+/g, ' ' ).trim()
}

export const groupParagraphs = ( segments: Segment[] ): Paragraph[] => {
  const paragraphs: Paragraph[] = []
  let texts: string[] = []
  let start = 0
  let previous: { end: number, text: string } | undefined

  for( const segment of segments ) {
    const text = cleanText( segment.text )

    if( text === '' ) {
      continue
    }

    if( previous !== undefined && texts.length > 0 ) {
      const gap = segment.start - previous.end
      const span = previous.end - start
      const sentenceEnded = /[.!?]$/.test( previous.text )
      const startNew =
        gap >= GAP_SECONDS ||
        ( span >= SOFT_SPAN_SECONDS && sentenceEnded ) ||
        segment.end - start > HARD_SPAN_SECONDS

      if( startNew ) {
        paragraphs.push( { start, text: texts.join( ' ' ) } )
        texts = []
      }
    }

    if( texts.length === 0 ) {
      start = segment.start
    }

    texts.push( text )
    previous = { end: segment.end, text }
  }

  if( texts.length > 0 ) {
    paragraphs.push( { start, text: texts.join( ' ' ) } )
  }

  return paragraphs
}
