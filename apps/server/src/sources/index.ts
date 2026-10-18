// Shared
import type { SourceType } from '@mnemosyne/shared'
// Sources
import type { SourceAdapter } from './adapter.js'
import { videoAdapter } from './video.adapter.js'

export const adapterFor = ( sourceType: SourceType ): SourceAdapter => {
  if( sourceType === 'video' ) {
    return videoAdapter
  }

  throw new Error( `No adapter for ${ sourceType } jobs yet` )
}
