const SCAN_INTERVAL_MS = 30_000

let lastScanAt: number | null = null

export const markScanned = ( at: Date ): void => {
  lastScanAt = at.getTime()
}

export const isScanFresh = ( now: Date ): boolean => {
  return lastScanAt !== null && now.getTime() - lastScanAt < SCAN_INTERVAL_MS
}

// The learning root changed, so what the last scan saw no longer applies
export const resetScanClock = (): void => {
  lastScanAt = null
}
