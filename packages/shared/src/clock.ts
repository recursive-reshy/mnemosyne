const pad = ( value: number ): string => String( value ).padStart( 2, '0' )

export const formatClock = ( seconds: number ): string => {
  const whole = Math.floor( seconds )
  const hours = Math.floor( whole / 3600 )
  const minutes = Math.floor( ( whole % 3600 ) / 60 )
  const rest = whole % 60

  if( hours > 0 ) {
    return `${ hours }:${ pad( minutes ) }:${ pad( rest ) }`
  }

  return `${ pad( minutes ) }:${ pad( rest ) }`
}
