// Packages
import { z } from 'zod'

const HttpUrl = z.url( { protocol: /^https?$/ } )

export const FeedName = z.string().trim().min( 1 ).max( 100 )
export type FeedName = z.infer< typeof FeedName >

export const Feed = z.object( {
  id: z.uuid(),
  url: z.url(),
  feed_url: z.url(),
  name: z.string(),
  profile_id: z.uuid().nullable(),
  enabled: z.boolean(),
  auto_summarize: z.boolean(),
  last_checked_at: z.iso.datetime().nullable(),
  last_error: z.string().nullable(),
  last_skipped_count: z.int().min( 0 ),
  inbox_count: z.int().min( 0 ),
  created_at: z.iso.datetime(),
} )
export type Feed = z.infer< typeof Feed >

export const PreviewFeedBody = z.object( {
  url: HttpUrl,
} )
export type PreviewFeedBody = z.infer< typeof PreviewFeedBody >

export const PreviewFeedResponse = z.object( {
  feed_url: z.url(),
  title: z.string(),
  latest_item: z.object( {
    title: z.string(),
    published_at: z.iso.datetime().nullable(),
  } ).nullable(),
} )
export type PreviewFeedResponse = z.infer< typeof PreviewFeedResponse >

export const CreateFeedBody = z.object( {
  url: HttpUrl,
  name: FeedName.optional(),
  profile_id: z.uuid().optional(),
  auto_summarize: z.boolean().optional(),
} )
export type CreateFeedBody = z.infer< typeof CreateFeedBody >

export const UpdateFeedBody = z.object( {
  name: FeedName.optional(),
  profile_id: z.uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  auto_summarize: z.boolean().optional(),
} ).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Provide name, profile_id, enabled or auto_summarize' },
)
export type UpdateFeedBody = z.infer< typeof UpdateFeedBody >

export const ListFeedsResponse = z.object( {
  feeds: z.array( Feed ),
} )
export type ListFeedsResponse = z.infer< typeof ListFeedsResponse >

export const FeedResponse = z.object( {
  feed: Feed,
} )
export type FeedResponse = z.infer< typeof FeedResponse >
