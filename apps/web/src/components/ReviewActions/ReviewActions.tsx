// React
import type { ReactElement } from 'react'
// App
import styles from './ReviewActions.module.css'

interface ReviewActionsProps {
  hasFailed: boolean
  canSave: boolean
  isSaving: boolean
  isRetrying: boolean
  isDiscarding: boolean
  onSave: () => void
  onRetry: () => void
  onDiscard: () => void
}

export function ReviewActions(
  {
    hasFailed,
    canSave,
    isSaving,
    isRetrying,
    isDiscarding,
    onSave,
    onRetry,
    onDiscard,
  }: ReviewActionsProps,
): ReactElement {
  return (
    <div className={ styles.actions }>
      { hasFailed
        ? (
          <button
            type="button"
            className={ styles.primary }
            disabled={ isRetrying }
            onClick={ onRetry }
          >
            { isRetrying ? 'Retrying…' : 'Retry summary' }
          </button>
        )
        : (
          <button
            type="button"
            className={ styles.primary }
            disabled={ isSaving || !canSave }
            onClick={ onSave }
          >
            { isSaving ? 'Saving…' : 'Save to vault' }
          </button>
        ) }
      <button
        type="button"
        className={ styles.secondary }
        disabled={ isDiscarding }
        onClick={ onDiscard }
      >
        Discard
      </button>
    </div>
  )
}
