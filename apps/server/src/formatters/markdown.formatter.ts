// Shared
import { Transcript, groupParagraphs } from '@mnemosyne/shared'
// Formatters
import { formatClock } from './timestamps.js'
import { youTubeVideoId } from './youtube.js'

const singleLine = ( value: string ): string => {
  return value.replace( /\r?\n|\r/g, ' ' )
}

const quoted = ( value: string ): string => {
  const escaped = singleLine( value ).replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' )

  return `"${ escaped }"`
}

export const formatMarkdown = ( { meta, segments }: Transcript ): string => {
  const videoId = youTubeVideoId( meta.source )

  const frontmatter = [
    '---',
    `title: ${ quoted( meta.title ) }`,
    `source: ${ quoted( meta.source ) }`,
    `channel: ${ quoted( meta.channel ) }`,
    `duration: ${ quoted( formatClock( meta.duration_seconds ) ) }`,
    `transcribed: ${ meta.transcribed_at.slice( 0, 10 ) }`,
    `model: ${ meta.model }`,
    `tags: [${ videoId === undefined ? 'transcript' : 'transcript, youtube' }]`,
    '---',
  ].join( '\n' )

  const paragraphs = groupParagraphs( segments ).map( ( { start, text } ) => {
    const label = formatClock( start )
    const stamp =
      videoId === undefined
        ? `[${ label }]`
        : `[${ label }](https://youtu.be/${ videoId }?t=${ Math.floor( start ) })`

    return `${ stamp } ${ text }`
  } )

  const blocks = [ frontmatter, `# ${ singleLine( meta.title ) }`, ...paragraphs ]

  return `${ blocks.join( '\n\n' ) }\n`
}
