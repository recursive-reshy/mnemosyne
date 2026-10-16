const STAMP = /(?<![\d:])(?:(\d+):)?(\d{1,2}):(\d{2})(?![\d:])/

export const parseTimestampSeconds = ( line: string ): number | null => {
  const match = STAMP.exec( line )

  if( match === null ) {
    return null
  }

  const [ , hours = '0', minutes = '0', seconds = '0' ] = match

  if( Number( minutes ) > 59 || Number( seconds ) > 59 ) {
    return null
  }

  return Number( hours ) * 3600 + Number( minutes ) * 60 + Number( seconds )
}

export const lineAt = ( text: string, index: number ): string => {
  const start = text.lastIndexOf( '\n', index - 1 ) + 1
  const newline = text.indexOf( '\n', index )

  return text.slice( start, newline === -1 ? text.length : newline )
}
