// Packages
import TurndownService from 'turndown'

const REMOVED = [
  'img',
  'picture',
  'iframe',
  'script',
  'style',
  'svg',
  'video',
  'audio',
  'form',
  'button',
] as const

export interface HtmlToMarkdownOptions {
  // Articles drop tables. Emails lay themselves out in tables, so for them the cells' content
  // is kept: Turndown already writes table elements as blocks, it only has to stop removing them.
  layoutTables?: 'remove' | 'unwrap'
}

const build = ( removed: readonly string[] ): TurndownService => {
  const service = new TurndownService( {
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  } )

  // Added rules come before the built-in ones, so this also beats the built-in img rule
  for( const tag of removed ) {
    service.addRule( tag, {
      filter: ( node ) => node.nodeName.toLowerCase() === tag,
      replacement: () => '',
    } )
  }

  // A figure is its caption, if it has one
  service.addRule( 'figure', {
    filter: 'figure',
    replacement: ( _content, node ) => {
      const caption = node.querySelector( 'figcaption' )?.textContent.trim()

      return caption === undefined || caption === '' ? '' : `\n\n${ caption }\n\n`
    },
  } )

  return service
}

const dropTables = build( [ ...REMOVED, 'table' ] )
const keepTables = build( REMOVED )

export const htmlToMarkdown = (
  html: string,
  { layoutTables = 'remove' }: HtmlToMarkdownOptions = {},
): string => {
  const service = layoutTables === 'unwrap' ? keepTables : dropTables

  return service.turndown( html ).replace( /\n{3,}/g, '\n\n' ).trim()
}
