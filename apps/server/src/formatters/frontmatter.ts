export const singleLine = ( value: string ): string => {
  return value.replace( /\r?\n|\r/g, ' ' )
}

export const quoted = ( value: string ): string => {
  const escaped = singleLine( value ).replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' )

  return `"${ escaped }"`
}
