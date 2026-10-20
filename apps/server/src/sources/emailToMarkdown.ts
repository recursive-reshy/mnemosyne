// Packages
import { parseHTML } from 'linkedom'
// Sources
import { htmlToMarkdown } from './htmlToMarkdown.js'

export interface EmailBody {
  html: string | null
  text: string | null
}

const REMOVED_TAGS = 'img, picture, style, script, head'
const HIDDEN_STYLE = new RegExp(
  'display\\s*:\\s*none|max-height\\s*:\\s*0(?:px|pt|em)?\\s*(?:[;!]|$)|mso-hide\\s*:\\s*all',
  'i',
)
const PREHEADER_STYLE = /opacity\s*:\s*0(?:\.0+)?\s*(?:[;!]|$)/i
const VIEW_IN_BROWSER = new RegExp(
  '^[\\[(]?\\s*(?:view|read)\\s+(?:this\\s+)?(?:(?:email|message)\\s+)?'
  + '(?:in\\s+(?:your\\s+)?browser|online)',
  'i',
)
const FOOTER_LINK = new RegExp(
  'unsubscribe|manage\\s+(?:your\\s+)?(?:preferences|subscription)|email\\s+preferences',
  'i',
)
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g
const BARE_URL = /https?:\/\/\S+/
const FOOTER_START = 2 / 3

const tidy = ( text: string ): string => text.replace( /\n{3,}/g, '\n\n' ).trim()

// Newsletters hide their preview text and spacers with inline styles, and track opens with pixels.
const clean = ( html: string ): Document => {
  const { document } = parseHTML( html )

  document.querySelectorAll( REMOVED_TAGS ).forEach( ( node ) => node.remove() )
  document.querySelectorAll( '[style]' ).forEach( ( node ) => {
    if( HIDDEN_STYLE.test( node.getAttribute( 'style' ) ?? '' ) ) {
      node.remove()
    }
  } )

  const first = document.body?.firstElementChild
  const firstStyle = first?.getAttribute( 'style' ) ?? ''

  if( PREHEADER_STYLE.test( firstStyle ) ) {
    first?.remove()
  }

  return document
}

// Not Readability: it keeps the block it likes best and drops the other sections of a newsletter
// (ADR 0040). The whole element, not `body`, so a fragment with no <body> is still read.
const fromHtml = ( html: string ): string => {
  const document = clean( html )

  return htmlToMarkdown( document.documentElement.outerHTML, { layoutTables: 'unwrap' } )
}

const fromText = ( text: string ): string => {
  return tidy( text.split( /\r?\n/ ).map( ( line ) => line.trim() ).join( '\n' ) )
}

const dropViewInBrowser = ( text: string ): string => {
  const lines = text.split( '\n' )
  const first = lines.findIndex( ( line ) => line.trim() !== '' )

  if( first === -1 || !VIEW_IN_BROWSER.test( lines[ first ] ?? '' ) ) {
    return text
  }

  return tidy( lines.slice( first + 1 ).join( '\n' ) )
}

const isFooterBlock = ( block: string ): boolean => {
  const links = [ ...block.matchAll( MARKDOWN_LINK ) ]

  if( links.length > 0 ) {
    return links.some( ( [ , label = '', url = '' ] ) => {
      return FOOTER_LINK.test( label ) || FOOTER_LINK.test( url )
    } )
  }

  return BARE_URL.test( block ) && FOOTER_LINK.test( block )
}

// From the last block with an unsubscribe or preferences link to the end, when that block
// starts in the final third: a link earlier on is part of the content.
const dropFooter = ( text: string ): string => {
  const blocks: { start: number, text: string }[] = []

  for( const match of text.matchAll( /[^\n]+(?:\n[^\n]+)*/g ) ) {
    blocks.push( { start: match.index, text: match[ 0 ] } )
  }

  const footer = blocks.findLast( ( block ) => isFooterBlock( block.text ) )

  if( footer === undefined || footer.start < text.length * FOOTER_START ) {
    return text
  }

  return tidy( text.slice( 0, footer.start ) )
}

export const emailToMarkdown = ( { html, text }: EmailBody ): string => {
  const converted = html === null || html.trim() === '' ? '' : tidy( fromHtml( html ) )
  const markdown = converted === '' ? fromText( text ?? '' ) : converted

  return dropFooter( dropViewInBrowser( markdown ) )
}
