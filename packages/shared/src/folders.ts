const MAX_NAME_LENGTH = 100
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f\u007f]/

export const isValidFolderName = ( name: string ): boolean => {
  return name !== ''
    && name.length <= MAX_NAME_LENGTH
    && !FORBIDDEN.test( name )
    && !name.startsWith( '.' )
}

export const parseFolderPath = ( path: string ): string[] => {
  if( path === '' ) {
    return []
  }

  const segments = path.split( '/' )
  const invalid = segments.find( ( segment ) => !isValidFolderName( segment ) )

  if( invalid !== undefined ) {
    throw new Error( `Invalid folder name "${ invalid }" in "${ path }"` )
  }

  return segments
}
