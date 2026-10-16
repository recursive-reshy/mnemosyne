// React
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import { MDXEditor, toolbarPlugin } from '@mdxeditor/editor'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { useColorScheme } from '@mui/material/styles'
import '@mdxeditor/editor/style.css'
// App
import { richBlockText, sourceLineText } from './caretText'
import { noteEditorPlugins, noteMarkdownOptions } from './editorConfig'
import { ModeToggle } from './ModeToggle'
import type { NoteEditorMode } from './ModeToggle'
import styles from './NoteEditor.module.css'

interface NoteEditorProps {
  value: string
  onChange: ( markdown: string ) => void
  onModeChange?: ( mode: NoteEditorMode ) => void
  onBlur?: () => void
  onCaretText?: ( text: string ) => void
}

const withOneNewline = ( markdown: string ): string => `${ markdown.replace( /\n+$/, '' ) }\n`

export function NoteEditor(
  { value, onChange, onModeChange, onBlur, onCaretText }: NoteEditorProps,
): ReactElement {
  const { colorScheme } = useColorScheme()
  const editor = useRef< MDXEditorMethods >( null )
  const container = useRef< HTMLDivElement >( null )
  const held = useRef( value )
  const modeCallback = useRef( onModeChange )
  const [ plugins ] = useState( () => [
    ...noteEditorPlugins(),
    toolbarPlugin( {
      toolbarContents: () => (
        <ModeToggle
          getNote={ () => held.current }
          onModeChange={ ( mode ) => modeCallback.current?.( mode ) }
        />
      ),
    } ),
  ] )

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
    <div ref={ container } className={ styles.editor }>
      <MDXEditor
        ref={ editor }
        markdown={ value }
        plugins={ plugins }
        toMarkdownOptions={ noteMarkdownOptions }
        onChange={ handleChange }
        onBlur={ onBlur }
        className={ colorScheme === 'dark' ? 'noteEditor dark-theme' : 'noteEditor' }
        contentEditableClassName={ styles.content }
      />
    </div>
  )
}
