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

// The line the cursor is on in source mode, or null when the source editor has no focus.
export const sourceLineText = ( root: Element ): string | null => {
  if( root.querySelector( '.cm-editor.cm-focused' ) === null ) {
    return null
  }

  return root.querySelector( '.cm-activeLine' )?.textContent ?? null
}
