// Shared
import { DownloadFormat, noteBasename } from '@mnemosyne/shared'

export const transcriptFilename = ( title: string, format: DownloadFormat ): string => {
  return `${ noteBasename( title, 'transcript' ) }.${ format }`
}
