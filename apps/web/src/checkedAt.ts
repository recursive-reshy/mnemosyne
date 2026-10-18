const MINUTE_MS = 60_000
const HOUR_MINUTES = 60
const DAY_HOURS = 24

export const formatChecked = ( checkedAt: string | null, now: number ): string => {
  if( checkedAt === null ) {
    return 'Not checked yet'
  }

  const minutes = Math.floor( ( now - Date.parse( checkedAt ) ) / MINUTE_MS )

  if( minutes < 1 ) {
    return 'Checked just now'
  }

  if( minutes < HOUR_MINUTES ) {
    return `Checked ${ minutes }m ago`
  }

  const hours = Math.floor( minutes / HOUR_MINUTES )

  return hours < DAY_HOURS
    ? `Checked ${ hours }h ago`
    : `Checked ${ Math.floor( hours / DAY_HOURS ) }d ago`
}
