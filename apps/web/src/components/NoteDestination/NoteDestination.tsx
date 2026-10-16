// React
import type { ReactElement } from 'react'
// App
import { useFolders } from '#src/hooks/useFolders'
import { FilenamePreview } from '../FilenamePreview'
import { FolderPicker } from '../FolderPicker'

interface NoteDestinationProps {
  title: string
  folder: string | null
  onFolderChange: ( folder: string | null ) => void
}

export function NoteDestination(
  { title, folder, onFolderChange }: NoteDestinationProps,
): ReactElement {
  const { defaultFolder, folders, error } = useFolders()

  return (
    <>
      { defaultFolder !== null && (
        <FolderPicker
          folders={ folders }
          defaultFolder={ defaultFolder }
          value={ folder }
          onChange={ onFolderChange }
        />
      ) }
      { error !== null && (
        <p className="alert" role="alert">
          { `Could not load the vault folders: ${ error }. The note goes to the default folder.` }
        </p>
      ) }
      <FilenamePreview title={ title } folder={ folder ?? defaultFolder } />
    </>
  )
}
