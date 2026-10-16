// React
import type { ReactElement } from 'react'
// Shared
import { noteBasename } from '@mnemosyne/shared'
// App
import styles from './FilenamePreview.module.css'

interface FilenamePreviewProps {
  title: string
  folder: string | null
}

export function FilenamePreview( { title, folder }: FilenamePreviewProps ): ReactElement {
  const fileName = `${ noteBasename( title ) }.md`

  if( folder === null ) {
    return (
      <p className={ styles.preview }>
        Saved in the default folder as <code className={ styles.path }>{ fileName }</code>
      </p>
    )
  }

  const path = folder === '' ? fileName : `${ folder }/${ fileName }`

  return (
    <p className={ styles.preview }>
      Saved as <code className={ styles.path }>{ path }</code>
    </p>
  )
}
