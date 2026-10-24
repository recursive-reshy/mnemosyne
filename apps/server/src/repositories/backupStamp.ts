// Singapore time from Intl parts, so the container's TZ doesn't matter.
export const backupStamp = ( date: Date ): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat( 'en-GB', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    } ).formatToParts( date ).map( ( part ) => [ part.type, part.value ] ),
  )

  return `${ parts.year }${ parts.month }${ parts.day }`
    + `-${ parts.hour }${ parts.minute }${ parts.second }`
}
