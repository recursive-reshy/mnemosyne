export const obsidianUrl = (
  vaultName: string | null | undefined,
  path: string,
): string | null => {
  if( vaultName === null || vaultName === undefined ) {
    return null
  }

  return `obsidian://open?vault=${ encodeURIComponent( vaultName ) }`
    + `&file=${ encodeURIComponent( path.replace( /\.md$/, '' ) ) }`
}
