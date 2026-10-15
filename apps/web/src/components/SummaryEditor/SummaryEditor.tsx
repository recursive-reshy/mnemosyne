// React
import { useId } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
// App
import styles from './SummaryEditor.module.css'

interface SummaryEditorProps {
  value: string
  onChange: ( value: string ) => void
}

export function SummaryEditor( { value, onChange }: SummaryEditorProps ): ReactElement {
  const editorId = useId()

  const handleChange = ( event: ChangeEvent< HTMLTextAreaElement > ): void => {
    onChange( event.target.value )
  }

  return (
    <div className={ styles.field }>
      <label className={ styles.label } htmlFor={ editorId }>Summary</label>
      <textarea
        id={ editorId }
        className={ styles.editor }
        value={ value }
        onChange={ handleChange }
        spellCheck
      />
    </div>
  )
}
