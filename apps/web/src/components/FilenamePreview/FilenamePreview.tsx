// React
import type { ReactElement } from 'react'
// Shared
import { noteBasename } from '@mnemosyne/shared'
// App
import styles from './FilenamePreview.module.css'

interface FilenamePreviewProps {
  title: string
}

export function FilenamePreview( { title }: FilenamePreviewProps ): ReactElement {
  return (
    <p className={ styles.preview }>
      Saved as <code className={ styles.path }>{ `Mnemosyne/${ noteBasename( title ) }.md` }</code>
    </p>
  )
}
