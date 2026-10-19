// Packages
import { z } from 'zod'

export const GmailConnectionStatus = z.enum( [
  'not_configured',
  'not_connected',
  'connected',
  'reconnect_needed',
] )
export type GmailConnectionStatus = z.infer< typeof GmailConnectionStatus >

export const GmailAccount = z.object( {
  status: GmailConnectionStatus,
  email: z.string().nullable(),
  connected_at: z.iso.datetime().nullable(),
  error: z.string().nullable(),
} )
export type GmailAccount = z.infer< typeof GmailAccount >

export const GetGmailAccountResponse = z.object( {
  account: GmailAccount,
} )
export type GetGmailAccountResponse = z.infer< typeof GetGmailAccountResponse >

export const GmailLabel = z.object( {
  id: z.string(),
  name: z.string(),
  type: z.enum( [ 'system', 'user' ] ),
} )
export type GmailLabel = z.infer< typeof GmailLabel >

export const ListGmailLabelsResponse = z.object( {
  labels: z.array( GmailLabel ),
} )
export type ListGmailLabelsResponse = z.infer< typeof ListGmailLabelsResponse >

export const GmailDestination = z.enum( [ 'newsletter', 'jobs' ] )
export type GmailDestination = z.infer< typeof GmailDestination >

export const GmailMatch = z.discriminatedUnion( 'kind', [
  z.object( {
    kind: z.literal( 'labels' ),
    label_ids: z.array( z.string().min( 1 ) ).min( 1 ).max( 10 ),
  } ),
  z.object( {
    kind: z.literal( 'query' ),
    query: z.string().trim().min( 1 ).max( 500 ),
  } ),
] )
export type GmailMatch = z.infer< typeof GmailMatch >

export const Backfill = z.enum( [ 'none', '30d', '90d', 'all' ] )
export type Backfill = z.infer< typeof Backfill >

export const SourceName = z.string().trim().min( 1 ).max( 100 )
export type SourceName = z.infer< typeof SourceName >

export const GmailSource = z.object( {
  id: z.uuid(),
  name: z.string(),
  match: GmailMatch,
  label_names: z.array( z.string() ),
  destination: GmailDestination,
  profile_id: z.uuid().nullable(),
  auto_summarize: z.boolean(),
  enabled: z.boolean(),
  sync_from: z.iso.datetime(),
  last_checked_at: z.iso.datetime().nullable(),
  last_error: z.string().nullable(),
  last_skipped_count: z.int().min( 0 ),
  inbox_count: z.int().min( 0 ),
  postings_count: z.int().min( 0 ),
  created_at: z.iso.datetime(),
} )
export type GmailSource = z.infer< typeof GmailSource >

export const PreviewGmailSourceBody = z.object( {
  match: GmailMatch,
} )
export type PreviewGmailSourceBody = z.infer< typeof PreviewGmailSourceBody >

export const PreviewGmailSourceResponse = z.object( {
  count: z.int().min( 0 ),
  count_capped: z.boolean(),
  newest: z.object( {
    subject: z.string(),
    from: z.string(),
    received_at: z.iso.datetime(),
  } ).nullable(),
  overlaps: z.array( z.object( {
    id: z.uuid(),
    name: z.string(),
  } ) ),
} )
export type PreviewGmailSourceResponse = z.infer< typeof PreviewGmailSourceResponse >

export const CreateGmailSourceBody = z.object( {
  name: SourceName,
  match: GmailMatch,
  destination: GmailDestination,
  profile_id: z.uuid().optional(),
  auto_summarize: z.boolean().optional(),
  backfill: Backfill.optional(),
} ).refine(
  ( body ) => body.destination === 'newsletter'
    || ( body.profile_id === undefined
      && body.auto_summarize === undefined
      && body.backfill === undefined ),
  { message: 'profile_id, auto_summarize and backfill apply to newsletter sources only' },
)
export type CreateGmailSourceBody = z.infer< typeof CreateGmailSourceBody >

export const UpdateGmailSourceBody = z.object( {
  name: SourceName.optional(),
  match: GmailMatch.optional(),
  profile_id: z.uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  auto_summarize: z.boolean().optional(),
} ).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Provide name, match, profile_id, enabled or auto_summarize' },
)
export type UpdateGmailSourceBody = z.infer< typeof UpdateGmailSourceBody >

export const ListGmailSourcesResponse = z.object( {
  sources: z.array( GmailSource ),
} )
export type ListGmailSourcesResponse = z.infer< typeof ListGmailSourcesResponse >

export const GmailSourceResponse = z.object( {
  source: GmailSource,
} )
export type GmailSourceResponse = z.infer< typeof GmailSourceResponse >
