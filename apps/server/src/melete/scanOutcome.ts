// What the last scan could not read, for each user. In memory only: it is advisory, per process,
// and the next scan replaces it.
const lastSkippedPaths = new Map< string, string[] >()

export const rememberSkipped = ( userId: string, paths: string[] ): void => {
  lastSkippedPaths.set( userId, [ ...paths ] )
}

export const lastSkipped = ( userId: string ): string[] => {
  return [ ...lastSkippedPaths.get( userId ) ?? [] ]
}

export const resetScanOutcome = ( userId?: string ): void => {
  if( userId === undefined ) {
    lastSkippedPaths.clear()

    return
  }

  lastSkippedPaths.delete( userId )
}
