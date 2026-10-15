// React
import { useId } from 'react'
import type { ChangeEvent, ReactElement, SyntheticEvent } from 'react'
// App
import { lineAt } from '#src/timestamp'
import styles from './SummaryEditor.module.css'

interface SummaryEditorProps {
  value: string
  onChange: ( value: string ) => void
  onCaretLine: ( line: string ) => void
}

export function SummaryEditor(
  { value, onChange, onCaretLine }: SummaryEditorProps,
): ReactElement {
  const editorId = useId()

  const handleChange = ( event: ChangeEvent< HTMLTextAreaElement > ): void => {
    onChange( event.target.value )
  }

  const handleSelect = ( event: SyntheticEvent< HTMLTextAreaElement > ): void => {
    const { value: text, selectionStart } = event.currentTarget

    onCaretLine( lineAt( text, selectionStart ) )
  }

  return (
    <div className={ styles.field }>
      <label className={ styles.label } htmlFor={ editorId }>Summary</label>
      <textarea
        id={ editorId }
        className={ styles.editor }
        value={ value }
        onChange={ handleChange }
        onSelect={ handleSelect }
        spellCheck
      />
    </div>
  )
}
