// Sources
import type { SourceAdapter } from './adapter.js'
import { fetchArticle } from './extractArticle.js'

export const articleAdapter: SourceAdapter = {
  acquire: async ( { job, markStatus } ) => {
    markStatus( 'fetching' )

    return await fetchArticle( job.url )
  },
}
