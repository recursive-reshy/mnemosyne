// React
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import { MDXEditor, toolbarPlugin } from '@mdxeditor/editor'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
// App
import { noteEditorPlugins, noteMarkdownOptions } from './editorConfig'
import { ModeToggle } from './ModeToggle'
import type { NoteEditorMode } from './ModeToggle'
import styles from './NoteEditor.module.css'

interface NoteEditorProps {
  value: string
  onChange: ( markdown: string ) => void
  onModeChange?: ( mode: NoteEditorMode ) => void
  onBlur?: () => void
}

const withOneNewline = ( markdown: string ): string => `${ markdown.replace( /\n+$/, '' ) }\n`

export function NoteEditor(
  { value, onChange, onModeChange, onBlur }: NoteEditorProps,
): ReactElement {
  const editor = useRef< MDXEditorMethods >( null )
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

  const handleChange = ( markdown: string, isInitialNormalize: boolean ): void => {
    if( isInitialNormalize ) {
      return
    }

    const next = withOneNewline( markdown )

    held.current = next
    onChange( next )
  }

  return (
    <div className={ styles.editor }>
      <MDXEditor
        ref={ editor }
        markdown={ value }
        plugins={ plugins }
        toMarkdownOptions={ noteMarkdownOptions }
        onChange={ handleChange }
        onBlur={ onBlur }
        contentEditableClassName={ styles.content }
      />
    </div>
  )
}
