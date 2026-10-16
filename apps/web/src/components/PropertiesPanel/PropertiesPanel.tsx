// React
import { useId } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
// Shared
import { NoteParseError, parseNote, serializeNote } from '@mnemosyne/shared'
import type { ParsedNote } from '@mnemosyne/shared'
// App
import { TagInput } from '../TagInput'
import styles from './PropertiesPanel.module.css'

const FIXED_TAG = 'mnemosyne'

interface PropertiesPanelProps {
  note: string
  onChange: ( note: string ) => void
}

const tryParse = ( note: string ): ParsedNote | null => {
  try {
    return parseNote( note )
  } catch( error ) {
    if( error instanceof NoteParseError ) {
      return null
    }

    throw error
  }
}

export function PropertiesPanel( { note, onChange }: PropertiesPanelProps ): ReactElement {
  const titleId = useId()
  const parsed = tryParse( note )

  if( parsed === null ) {
    return <p className="alert" role="status">front-matter invalid</p>
  }

  const { properties } = parsed

  const update = ( changes: Partial< ParsedNote[ 'properties' ] > ): void => {
    onChange( serializeNote( { ...parsed, properties: { ...properties, ...changes } } ) )
  }

  const handleTitle = ( event: ChangeEvent< HTMLInputElement > ): void => {
    update( { title: event.target.value } )
  }

  return (
    <div className={ styles.panel }>
      <div className={ styles.field }>
        <label className={ styles.label } htmlFor={ titleId }>Title</label>
        <input
          id={ titleId }
          type="text"
          value={ properties.title }
          onChange={ handleTitle }
        />
      </div>
      <TagInput
        tags={ properties.tags.filter( ( tag ) => tag !== FIXED_TAG ) }
        onChange={ ( tags ) => update( { tags: [ FIXED_TAG, ...tags ] } ) }
      />
      <dl className={ styles.readOnly }>
        <dt>Source</dt>
        <dd>{ properties.source }</dd>
        <dt>Channel</dt>
        <dd>{ properties.channel }</dd>
        <dt>Duration</dt>
        <dd>{ properties.duration }</dd>
        <dt>Created</dt>
        <dd>on save</dd>
      </dl>
    </div>
  )
}
