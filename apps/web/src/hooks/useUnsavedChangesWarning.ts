// React
import { useEffect } from 'react'

export function useUnsavedChangesWarning( isDirty: boolean ): void {
  useEffect( () => {
    if( !isDirty ) {
      return undefined
    }

    const handleBeforeUnload = ( event: BeforeUnloadEvent ): void => {
      event.preventDefault()
    }

    window.addEventListener( 'beforeunload', handleBeforeUnload )

    return () => window.removeEventListener( 'beforeunload', handleBeforeUnload )
  }, [ isDirty ] )
}
