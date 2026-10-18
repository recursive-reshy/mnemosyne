// Packages
import TurndownService from 'turndown'

const REMOVED = [
  'img',
  'picture',
  'table',
  'iframe',
  'script',
  'style',
  'svg',
  'video',
  'audio',
  'form',
  'button',
] as const

const turndown = new TurndownService( {
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
} )

// Added rules come before the built-in ones, so this also beats the built-in img rule
for( const tag of REMOVED ) {
  turndown.addRule( tag, {
    filter: ( node ) => node.nodeName.toLowerCase() === tag,
    replacement: () => '',
  } )
}

// A figure is its caption, if it has one
turndown.addRule( 'figure', {
  filter: 'figure',
  replacement: ( _content, node ) => {
    const caption = node.querySelector( 'figcaption' )?.textContent.trim()

    return caption === undefined || caption === '' ? '' : `\n\n${ caption }\n\n`
  },
} )

export const htmlToMarkdown = ( html: string ): string => {
  return turndown.turndown( html ).replace( /\n{3,}/g, '\n\n' ).trim()
}
