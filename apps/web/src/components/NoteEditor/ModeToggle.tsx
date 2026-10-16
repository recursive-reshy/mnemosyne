// React
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import { usePublisher, useCellValue, viewMode$ } from '@mdxeditor/editor'
// Shared
import { parseNote } from '@mnemosyne/shared'
// App
import styles from './NoteEditor.module.css'

export type NoteEditorMode = 'rich-text' | 'source'

interface ModeToggleProps {
  getNote: () => string
  onModeChange: ( mode: NoteEditorMode ) => void
}

const MODES = [
  { mode: 'rich-text', label: 'Rich text' },
  { mode: 'source', label: 'Source mode' },
] as const

const hasValidFrontmatter = ( note: string ): boolean => {
  try {
    parseNote( note )

    return true
  } catch{
    return false
  }
}

export function ModeToggle( { getNote, onModeChange }: ModeToggleProps ): ReactElement {
  const current = useCellValue( viewMode$ )
  const setMode = usePublisher( viewMode$ )
  const [ isBlocked, setIsBlocked ] = useState( false )
  const report = useRef( onModeChange )

  useEffect( () => {
    report.current = onModeChange
  }, [ onModeChange ] )

  useEffect( () => {
    if( current === 'rich-text' || current === 'source' ) {
      report.current( current )
    }
  }, [ current ] )

  const handleSelect = ( mode: NoteEditorMode ): void => {
    // The rich editor cannot open YAML that does not parse.
    const canSwitch = mode === 'source' || hasValidFrontmatter( getNote() )

    setIsBlocked( !canSwitch )

    if( canSwitch ) {
      setMode( mode )
    }
  }

  return (
    <div className={ styles.toggle }>
      { MODES.map( ( { mode, label } ) => (
        <button
          key={ mode }
          type="button"
          aria-pressed={ current === mode }
          onClick={ () => handleSelect( mode ) }
        >
          { label }
        </button>
      ) ) }
      { isBlocked && (
        <p className="alert" role="alert">
          Fix the front-matter in source mode before switching to rich text.
        </p>
      ) }
    </div>
  )
}
