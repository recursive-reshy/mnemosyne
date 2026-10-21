export type AnchorRange = { start: number, end: number }

export type LinkTarget = { target: string, anchor: string | null }

export type InsertLinkOptions = { asRelated?: boolean }

const RELATED_HEADING = '## Related'

const FENCE_OPENING = /^ {0,3}(`{3,}|~{3,})/
const HEADING_LINE = /^ {0,3}#{1,6}(?:[ \t]|$)/
const BLOCKQUOTE_LINE = /^ {0,3}>/
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

const INLINE_CODE = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g
const WIKILINK = /!?\[\[[^\]\n]*\]\]/g
const MARKDOWN_LINK = /!?\[[^\]\n]*\]\([^)\n]*\)/g
const AUTOLINK = /<[a-z][a-z0-9+.-]*:[^>\s]*>/gi
const BARE_URL = /https?:\/\/[^\s<>)\]]+/g

const WORD_BEFORE = /[\p{L}\p{N}]$/u
const WORD_AFTER = /^[\p{L}\p{N}]/u

// Same-length blanks, so offsets in the masked text are offsets in the note
const blank = ( text: string ): string => text.replace( /[^\r\n]/g, ' ' )

const maskMatches = ( text: string, pattern: RegExp ): string => {
  return text.replace( pattern, blank )
}

const maskFrontMatter = ( markdown: string ): string => {
  const match = FRONT_MATTER.exec( markdown )

  return match === null ? markdown : blank( match[ 0 ] ) + markdown.slice( match[ 0 ].length )
}

const maskFences = ( markdown: string ): string => {
  const lines = markdown.split( /(?<=\n)/ )
  let fence: string | undefined

  return lines.map( ( line ) => {
    if( fence === undefined ) {
      const opening = FENCE_OPENING.exec( line )

      if( opening === null ) {
        return line
      }

      fence = opening[ 1 ]

      return blank( line )
    }

    const marker = fence.charAt( 0 )
    const closing = new RegExp( `^ {0,3}${ marker }{${ fence.length },}[ \\t]*\\r?\\n?$` )

    if( closing.test( line ) ) {
      fence = undefined
    }

    return blank( line )
  } ).join( '' )
}

// Front-matter, fenced code and inline code
const maskCode = ( markdown: string ): string => {
  return maskMatches( maskFences( maskFrontMatter( markdown ) ), INLINE_CODE )
}

const maskLines = ( text: string, isExcluded: ( line: string ) => boolean ): string => {
  return text
    .split( /(?<=\n)/ )
    .map( ( line ) => ( isExcluded( line ) ? blank( line ) : line ) )
    .join( '' )
}

// Everything an anchor must never be placed in
const maskForAnchors = ( markdown: string ): string => {
  let masked = maskCode( markdown )

  masked = maskLines(
    masked,
    ( line ) => HEADING_LINE.test( line ) || BLOCKQUOTE_LINE.test( line ),
  )

  for( const pattern of [ WIKILINK, MARKDOWN_LINK, AUTOLINK, BARE_URL ] ) {
    masked = maskMatches( masked, pattern )
  }

  return masked
}

export const findAnchor = ( markdown: string, anchor: string ): AnchorRange | null => {
  if( anchor === '' ) {
    return null
  }

  const masked = maskForAnchors( markdown )
  let from = 0

  for( ;; ) {
    const start = masked.indexOf( anchor, from )

    if( start === -1 ) {
      return null
    }

    const end = start + anchor.length
    const isWholeWord = !WORD_BEFORE.test( masked.slice( Math.max( 0, start - 2 ), start ) )
      && !WORD_AFTER.test( masked.slice( end, end + 2 ) )

    // Blanks in the mask match spaces in the anchor, so check the real text too
    if( isWholeWord && markdown.slice( start, end ) === anchor ) {
      return { start, end }
    }

    from = start + 1
  }
}

export const isStale = ( markdown: string, suggestion: Pick< LinkTarget, 'anchor' > ): boolean => {
  return suggestion.anchor !== null && findAnchor( markdown, suggestion.anchor ) === null
}

const WIKILINK_PARTS = /(?<!!)\[\[([^\]\n]*)\]\]/g

export const hasWikilink = ( markdown: string, target: string ): boolean => {
  const wanted = target.trim().toLowerCase()

  return [ ...maskCode( markdown ).matchAll( WIKILINK_PARTS ) ].some( ( match ) => {
    const name = ( match[ 1 ] ?? '' ).split( /[|#]/ )[ 0 ] ?? ''

    return name.trim().toLowerCase() === wanted
  } )
}

const lastRelatedHeading = ( masked: string ): { end: number } | undefined => {
  let found: { end: number } | undefined
  let offset = 0

  for( const line of masked.split( /(?<=\n)/ ) ) {
    if( line.trimEnd() === RELATED_HEADING ) {
      found = { end: offset + line.trimEnd().length }
    }

    offset += line.length
  }

  return found
}

const nextHeadingStart = ( masked: string, from: number ): number => {
  let offset = from

  for( const line of masked.slice( from ).split( /(?<=\n)/ ) ) {
    if( offset > from && HEADING_LINE.test( line ) ) {
      return offset
    }

    offset += line.length
  }

  return masked.length
}

const addToRelated = ( markdown: string, target: string ): string => {
  const bullet = `- [[${ target }]]`
  const heading = lastRelatedHeading( maskCode( markdown ) )

  if( heading === undefined ) {
    return `${ markdown.trimEnd() }\n\n${ RELATED_HEADING }\n\n${ bullet }\n`
  }

  const sectionEnd = nextHeadingStart( maskCode( markdown ), heading.end )
  const content = markdown.slice( heading.end, sectionEnd ).trimEnd()
  const insertAt = heading.end + content.length
  const separator = content === '' ? '\n\n' : '\n'
  const rest = sectionEnd === markdown.length ? '\n' : markdown.slice( insertAt )

  return `${ markdown.slice( 0, insertAt ) }${ separator }${ bullet }${ rest }`
}

export const insertLink = (
  markdown: string,
  suggestion: LinkTarget,
  options: InsertLinkOptions = {},
): string => {
  const { target, anchor } = suggestion

  if( hasWikilink( markdown, target ) ) {
    return markdown
  }

  if( anchor !== null && options.asRelated !== true ) {
    const range = findAnchor( markdown, anchor )

    if( range !== null ) {
      const link = anchor === target ? `[[${ target }]]` : `[[${ target }|${ anchor }]]`

      return `${ markdown.slice( 0, range.start ) }${ link }${ markdown.slice( range.end ) }`
    }
  }

  return addToRelated( markdown, target )
}
