const MAX_LENGTH = 100

export const noteBasename = ( title: string, fallback = 'Untitled' ): string => {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace( /[/\\:*?"<>|#^[\]\u0000-\u001f\u007f-\u009f]/g, ' ' )
    .replace( /\s+/g, ' ' )
    .trim()
    .replace( /\.+$/, '' )

  let cut = cleaned.slice( 0, MAX_LENGTH )
  const last = cut.charCodeAt( cut.length - 1 )

  if( cut.length < cleaned.length && last >= 0xd800 && last <= 0xdbff ) {
    cut = cut.slice( 0, -1 )
  }

  const name = cut.trim().replace( /[\s.]+$/, '' )

  return name === '' ? fallback : name
}
