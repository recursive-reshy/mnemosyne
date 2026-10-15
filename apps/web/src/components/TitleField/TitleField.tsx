// React
import { useId } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
// App
import styles from './TitleField.module.css'

interface TitleFieldProps {
  value: string
  onChange: ( value: string ) => void
}

export function TitleField( { value, onChange }: TitleFieldProps ): ReactElement {
  const inputId = useId()

  const handleChange = ( event: ChangeEvent< HTMLInputElement > ): void => {
    onChange( event.target.value )
  }

  return (
    <div className={ styles.field }>
      <label className={ styles.label } htmlFor={ inputId }>Title</label>
      <input id={ inputId } type="text" value={ value } onChange={ handleChange } />
    </div>
  )
}
