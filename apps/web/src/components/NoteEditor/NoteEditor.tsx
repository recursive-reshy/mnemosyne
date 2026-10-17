// React
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import { MDXEditor, toolbarPlugin } from '@mdxeditor/editor'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import Paper from '@mui/material/Paper'
import { useColorScheme } from '@mui/material/styles'
import '@mdxeditor/editor/style.css'
// App
import { richBlockText, sourceLineText } from './caretText'
import { noteEditorPlugins, noteMarkdownOptions } from './editorConfig'
import { FormattingToolbar } from './FormattingToolbar'
import { ModeToggle } from './ModeToggle'
import type { NoteEditorMode } from './ModeToggle'

interface NoteEditorProps {
  value: string
  onChange: ( markdown: string ) => void
  onModeChange?: ( mode: NoteEditorMode ) => void
  onBlur?: () => void
  onCaretText?: ( text: string ) => void
}

const WRAPPER_SX = {
  width: '100%',
  overflow: 'hidden',
  '& .noteEditorContent': { minHeight: '12rem', p: 1 },
} as const

const withOneNewline = ( markdown: string ): string => `${ markdown.replace( /\n+$/, '' ) }\n`

export function NoteEditor(
  { value, onChange, onModeChange, onBlur, onCaretText }: NoteEditorProps,
): ReactElement {
  const isDark = useColorScheme().colorScheme === 'dark'
  const editor = useRef< MDXEditorMethods >( null )
  const container = useRef< HTMLDivElement >( null )
  const held = useRef( value )
  const modeCallback = useRef( onModeChange )
  const [ plugins ] = useState( () => [
    ...noteEditorPlugins(),
    toolbarPlugin( {
      toolbarContents: () => (
        <>
          <ModeToggle
            getNote={ () => held.current }
            onModeChange={ ( mode ) => modeCallback.current?.( mode ) }
          />
          <FormattingToolbar />
        </>
      ),
    } ),
  ] )

  // The class prop stays constant on purpose: when it changes, MDXEditor recreates its popup
  // container, which orphans the open Radix popups (the block type dropdown stops opening). So the
  // dark theme is toggled by hand on the editor root and on the popup container instead. Both are
  // created a moment after mount (the popup container under <body>), so they are watched for.
  useEffect( () => {
    const wrapper = container.current

    const apply = (): void => {
      const roots = [
        ...( wrapper?.querySelectorAll( '.mdxeditor' ) ?? [] ),
        ...document.querySelectorAll( '.mdxeditor-popup-container.noteEditor' ),
      ]

      for( const element of roots ) {
        element.classList.toggle( 'dark-theme', isDark )
      }
    }
    const observer = new MutationObserver( apply )

    apply()
    observer.observe( document.body, { childList: true } )

    if( wrapper !== null ) {
      observer.observe( wrapper, { childList: true } )
    }

    return () => observer.disconnect()
  }, [ isDark ] )

  useEffect( () => {
    modeCallback.current = onModeChange
  }, [ onModeChange ] )

  useEffect( () => {
    if( value !== held.current ) {
      held.current = value
      editor.current?.setMarkdown( value )
    }
  }, [ value ] )

  useEffect( () => {
    const root = container.current

    if( root === null || onCaretText === undefined ) {
      return undefined
    }

    const report = (): void => {
      const text = richBlockText( root, document.getSelection() ) ?? sourceLineText( root )

      if( text !== null ) {
        onCaretText( text )
      }
    }

    document.addEventListener( 'selectionchange', report )
    root.addEventListener( 'keyup', report )
    root.addEventListener( 'mouseup', report )

    return () => {
      document.removeEventListener( 'selectionchange', report )
      root.removeEventListener( 'keyup', report )
      root.removeEventListener( 'mouseup', report )
    }
  }, [ onCaretText ] )

  const handleChange = ( markdown: string, isInitialNormalize: boolean ): void => {
    if( isInitialNormalize ) {
      return
    }

    const next = withOneNewline( markdown )

    held.current = next
    onChange( next )
  }

  return (
    <Paper ref={ container } variant="outlined" sx={ WRAPPER_SX }>
      <MDXEditor
        ref={ editor }
        markdown={ value }
        plugins={ plugins }
        toMarkdownOptions={ noteMarkdownOptions }
        onChange={ handleChange }
        onBlur={ onBlur }
        className="noteEditor"
        contentEditableClassName="noteEditorContent"
      />
    </Paper>
  )
}
