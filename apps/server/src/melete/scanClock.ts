const SCAN_INTERVAL_MS = 30_000

// One clock per user: a scan of someone else's learning root says nothing about yours
const lastScanAt = new Map< string, number >()

export const markScanned = ( userId: string, at: Date ): void => {
  lastScanAt.set( userId, at.getTime() )
}

export const isScanFresh = ( userId: string, now: Date ): boolean => {
  const last = lastScanAt.get( userId )

  return last !== undefined && now.getTime() - last < SCAN_INTERVAL_MS
}

// The learning root changed, so what the last scan saw no longer applies; no user resets everyone
export const resetScanClock = ( userId?: string ): void => {
  if( userId === undefined ) {
    lastScanAt.clear()

    return
  }

  lastScanAt.delete( userId )
}
