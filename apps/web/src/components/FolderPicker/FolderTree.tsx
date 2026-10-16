// React
import type { ReactElement } from 'react'
// App
import type { TreeNode } from './treeNodes'
import styles from './FolderPicker.module.css'

interface FolderTreeProps {
  nodes: TreeNode[]
  chosenPath: string
  onSelect: ( path: string ) => void
}

export function FolderTree( { nodes, chosenPath, onSelect }: FolderTreeProps ): ReactElement {
  return (
    <ul className={ styles.tree }>
      { nodes.map( ( node ) => (
        <li key={ node.path }>
          <button
            type="button"
            className={ styles.folder }
            aria-pressed={ node.path === chosenPath }
            onClick={ () => onSelect( node.path ) }
          >
            { node.name }
          </button>
          { node.isNew && <span className={ styles.badge }>(new)</span> }
          { node.children.length > 0 && (
            <FolderTree nodes={ node.children } chosenPath={ chosenPath } onSelect={ onSelect } />
          ) }
        </li>
      ) ) }
    </ul>
  )
}
