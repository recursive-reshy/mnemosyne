// Packages
import { z } from 'zod'
// Job
import { Job } from './job.js'
// Source
import { SourceType } from './source.js'

export const InboxItemRef = z.object( {
  kind: z.enum( [ 'feed', 'gmail' ] ),
  id: z.uuid(),
} )
export type InboxItemRef = z.infer< typeof InboxItemRef >

export const InboxItem = z.discriminatedUnion( 'kind', [
  z.object( {
    kind: z.literal( 'feed' ),
    id: z.uuid(),
    feed_id: z.uuid(),
    feed_name: z.string(),
    title: z.string(),
    link: z.url(),
    published_at: z.iso.datetime().nullable(),
    source_type: SourceType,
    added_at: z.iso.datetime(),
  } ),
  z.object( {
    kind: z.literal( 'gmail' ),
    id: z.uuid(),
    source_id: z.uuid(),
    source_name: z.string(),
    title: z.string(),
    sender: z.string(),
    link: z.url(),
    published_at: z.iso.datetime(),
    source_type: z.literal( 'article' ),
    added_at: z.iso.datetime(),
  } ),
] )
export type InboxItem = z.infer< typeof InboxItem >

export const ListInboxResponse = z.object( {
  items: z.array( InboxItem ),
} )
export type ListInboxResponse = z.infer< typeof ListInboxResponse >

export const SummarizeInboxBody = z.object( {
  items: z.array( InboxItemRef ).min( 1 ).max( 50 ),
  model: z.string().min( 1 ).optional(),
  profile_id: z.uuid().optional(),
} )
export type SummarizeInboxBody = z.infer< typeof SummarizeInboxBody >

export const SummarizeInboxResponse = z.object( {
  jobs: z.array( Job ),
} )
export type SummarizeInboxResponse = z.infer< typeof SummarizeInboxResponse >

export const DismissInboxBody = z.object( {
  items: z.array( InboxItemRef ).min( 1 ).max( 200 ),
} )
export type DismissInboxBody = z.infer< typeof DismissInboxBody >
