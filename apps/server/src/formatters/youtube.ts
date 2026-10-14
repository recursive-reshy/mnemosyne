export function youTubeVideoId( url: string ): string | undefined {
  const parsed = URL.parse( url )

  if( parsed === null ) {
    return undefined
  }

  const host = parsed.hostname.replace( /^(www|m)\./, '' )

  if( host === 'youtu.be' ) {
    return parsed.pathname.split( '/' )[ 1 ] || undefined
  }

  if( host !== 'youtube.com' ) {
    return undefined
  }

  if( parsed.pathname === '/watch' ) {
    return parsed.searchParams.get( 'v' ) || undefined
  }

  const [ , section, id ] = parsed.pathname.split( '/' )

  return section === 'shorts' ? id || undefined : undefined
}
