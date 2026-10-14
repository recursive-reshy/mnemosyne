function pad( value: number, width: number = 2 ): string {
  return String( value ).padStart( width, '0' )
}

export function formatClock( seconds: number ): string {
  const whole = Math.floor( seconds )
  const hours = Math.floor( whole / 3600 )
  const minutes = Math.floor( ( whole % 3600 ) / 60 )
  const rest = whole % 60

  if( hours > 0 ) {
    return `${ hours }:${ pad( minutes ) }:${ pad( rest ) }`
  }

  return `${ pad( minutes ) }:${ pad( rest ) }`
}

export function formatSrtTime( seconds: number ): string {
  const totalMilliseconds = Math.round( seconds * 1000 )
  const hours = Math.floor( totalMilliseconds / 3_600_000 )
  const minutes = Math.floor( ( totalMilliseconds % 3_600_000 ) / 60_000 )
  const rest = Math.floor( ( totalMilliseconds % 60_000 ) / 1000 )
  const milliseconds = totalMilliseconds % 1000

  return `${ pad( hours ) }:${ pad( minutes ) }:${ pad( rest ) },${ pad( milliseconds, 3 ) }`
}
