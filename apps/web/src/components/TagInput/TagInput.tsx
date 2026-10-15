// React
import { useId, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactElement } from 'react'
// Shared
import { normalizeTag } from '@mnemosyne/shared'
// App
import styles from './TagInput.module.css'

const FIXED_TAG = 'mnemosyne'

interface TagInputProps {
  tags: string[]
  onChange: ( tags: string[] ) => void
}

export function TagInput( { tags, onChange }: TagInputProps ): ReactElement {
  const [ pending, setPending ] = useState( '' )
  const inputId = useId()

  const commit = ( raw: string ): void => {
    const tag = normalizeTag( raw )

    setPending( '' )

    if( tag !== '' && tag !== FIXED_TAG && !tags.includes( tag ) ) {
      onChange( [ ...tags, tag ] )
    }
  }

  const handleChange = ( event: ChangeEvent< HTMLInputElement > ): void => {
    const { value } = event.target

    if( value.endsWith( ',' ) ) {
      commit( value.slice( 0, -1 ) )
    } else {
      setPending( value )
    }
  }

  const handleKeyDown = ( event: KeyboardEvent< HTMLInputElement > ): void => {
    if( event.key === 'Enter' ) {
      event.preventDefault()
      commit( pending )
    }
  }

  return (
    <div className={ styles.field }>
      <label className={ styles.label } htmlFor={ inputId }>Add tag</label>
      <ul className={ styles.tags } aria-label="Tags">
        <li className={ styles.tag }>{ FIXED_TAG }</li>
        { tags.map( ( tag ) => (
          <li key={ tag } className={ styles.tag }>
            { tag }
            <button
              type="button"
              className={ styles.remove }
              aria-label={ `Remove tag ${ tag }` }
              onClick={ () => onChange( tags.filter( ( other ) => other !== tag ) ) }
            >
              ×
            </button>
          </li>
        ) ) }
      </ul>
      <input
        id={ inputId }
        type="text"
        value={ pending }
        onChange={ handleChange }
        onKeyDown={ handleKeyDown }
        onBlur={ () => commit( pending ) }
      />
    </div>
  )
}
