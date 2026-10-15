const pad = ( value: number, width: number = 2 ): string => {
  return String( value ).padStart( width, '0' )
}

export const formatSrtTime = ( seconds: number ): string => {
  const totalMilliseconds = Math.round( seconds * 1000 )
  const hours = Math.floor( totalMilliseconds / 3_600_000 )
  const minutes = Math.floor( ( totalMilliseconds % 3_600_000 ) / 60_000 )
  const rest = Math.floor( ( totalMilliseconds % 60_000 ) / 1000 )
  const milliseconds = totalMilliseconds % 1000

  return `${ pad( hours ) }:${ pad( minutes ) }:${ pad( rest ) },${ pad( milliseconds, 3 ) }`
}
