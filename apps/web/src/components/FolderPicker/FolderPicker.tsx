// React
import { useId, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
// Shared
import { isValidFolderName } from '@mnemosyne/shared'
import type { FolderNode } from '@mnemosyne/shared'
// App
import { filterTree, withExtraFolders } from './treeNodes'
import { FolderTree } from './FolderTree'
import styles from './FolderPicker.module.css'

interface FolderPickerProps {
  folders: FolderNode[]
  defaultFolder: string
  value: string | null
  onChange: ( folder: string | null ) => void
}

const NAME_MESSAGE = 'Folder names can\'t be empty, longer than 100 characters, '
  + 'start with a dot or contain / \\ : * ? " < > |.'

export function FolderPicker(
  { folders, defaultFolder, value, onChange }: FolderPickerProps,
): ReactElement {
  const filterId = useId()
  const nameId = useId()
  const [ isOpen, setIsOpen ] = useState( false )
  const [ query, setQuery ] = useState( '' )
  const [ name, setName ] = useState( '' )
  const [ message, setMessage ] = useState< string | null >( null )
  const [ added, setAdded ] = useState< string[] >( [] )

  const chosenPath = value ?? defaultFolder
  const tree = withExtraFolders( folders, [ ...added, defaultFolder, chosenPath ] )
  const visible = filterTree( tree, query )

  const handleSelect = ( path: string ): void => {
    onChange( path === defaultFolder ? null : path )
  }

  const handleCreate = ( event: FormEvent ): void => {
    event.preventDefault()
    const trimmed = name.trim()

    if( !isValidFolderName( trimmed ) ) {
      setMessage( NAME_MESSAGE )

      return
    }

    const path = chosenPath === '' ? trimmed : `${ chosenPath }/${ trimmed }`

    setMessage( null )
    setName( '' )
    setAdded( [ ...added, path ] )
    handleSelect( path )
  }

  return (
    <div className={ styles.picker }>
      <p className={ styles.destination }>
        Folder: <code>{ chosenPath === '' ? 'Vault root' : chosenPath }</code>
        <button
          type="button"
          aria-expanded={ isOpen }
          onClick={ () => setIsOpen( !isOpen ) }
        >
          Change folder
        </button>
      </p>
      { isOpen && (
        <div className={ styles.panel }>
          <label className={ styles.label } htmlFor={ filterId }>Filter folders</label>
          <input
            id={ filterId }
            type="text"
            value={ query }
            onChange={ ( event ) => setQuery( event.target.value ) }
          />
          <button
            type="button"
            className={ styles.folder }
            aria-pressed={ chosenPath === '' }
            onClick={ () => handleSelect( '' ) }
          >
            Vault root
          </button>
          { visible.length === 0
            ? <p>No folders match</p>
            : <FolderTree nodes={ visible } chosenPath={ chosenPath } onSelect={ handleSelect } /> }
          <form className={ styles.create } onSubmit={ handleCreate }>
            <label className={ styles.label } htmlFor={ nameId }>New folder name</label>
            <input
              id={ nameId }
              type="text"
              value={ name }
              onChange={ ( event ) => setName( event.target.value ) }
            />
            <button type="submit">New folder</button>
          </form>
          { message !== null && <p className="alert" role="alert">{ message }</p> }
        </div>
      ) }
    </div>
  )
}
