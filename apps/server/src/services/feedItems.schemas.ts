// Packages
import { z } from 'zod'
// Shared
import { Job, SourceType } from '@mnemosyne/shared'

export const FeedItem = z.object( {
  id: z.uuid(),
  feed_id: z.uuid(),
  feed_name: z.string(),
  title: z.string(),
  link: z.url(),
  published_at: z.iso.datetime().nullable(),
  source_type: SourceType,
  added_at: z.iso.datetime(),
} )
export type FeedItem = z.infer< typeof FeedItem >

export const ListFeedItemsResponse = z.object( {
  items: z.array( FeedItem ),
} )
export type ListFeedItemsResponse = z.infer< typeof ListFeedItemsResponse >

export const SummarizeFeedItemsBody = z.object( {
  ids: z.array( z.uuid() ).min( 1 ).max( 50 ),
  model: z.string().min( 1 ).optional(),
  profile_id: z.uuid().optional(),
} )
export type SummarizeFeedItemsBody = z.infer< typeof SummarizeFeedItemsBody >

export const SummarizeFeedItemsResponse = z.object( {
  jobs: z.array( Job ),
} )
export type SummarizeFeedItemsResponse = z.infer< typeof SummarizeFeedItemsResponse >

export const DismissFeedItemsBody = z.object( {
  ids: z.array( z.uuid() ).min( 1 ).max( 200 ),
} )
export type DismissFeedItemsBody = z.infer< typeof DismissFeedItemsBody >
