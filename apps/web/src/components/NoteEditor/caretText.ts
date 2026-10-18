const RICH_BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre'
const RICH_EDITABLE = '.mdxeditor-rich-text-editor [contenteditable="true"]'

// The text of the rich-text block that holds the selection, or null when it is elsewhere.
export const richBlockText = ( root: Element, selection: Selection | null ): string | null => {
  const anchor = selection?.anchorNode ?? null
  const editable = root.querySelector( RICH_EDITABLE )

  if( anchor === null || editable === null || !editable.contains( anchor ) ) {
    return null
  }

  const element = anchor instanceof Element ? anchor : anchor.parentElement

  return element?.closest( RICH_BLOCKS )?.textContent ?? null
}

// The line the cursor is on in source mode, or null when the source editor has no focus or the
// cursor is in the front-matter (its duration reads as a timestamp, and it cites nothing).
export const sourceLineText = ( root: Element ): string | null => {
  if( root.querySelector( '.cm-editor.cm-focused' ) === null ) {
    return null
  }

  const active = root.querySelector( '.cm-activeLine' )
  const lines = [ ...root.querySelectorAll( '.cm-line' ) ]

  if( active === null ) {
    return null
  }

  if( lines[ 0 ]?.textContent === '---' ) {
    const closing = lines.findIndex( ( line, index ) => index > 0 && line.textContent === '---' )

    if( closing === -1 || lines.indexOf( active ) <= closing ) {
      return null
    }
  }

  return active.textContent
}
