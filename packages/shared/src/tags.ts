export const normalizeTag = ( tag: string ): string => {
  return tag
    .toLowerCase()
    .replace( /\s+/g, '-' )
    .replace( /[^a-z0-9-]/g, '' )
    .replace( /-+/g, '-' )
    .replace( /^-|-$/g, '' )
}
