// Packages
import { z } from 'zod'

export const BudgetType = z.enum( [ 'fixed', 'hourly' ] )
export type BudgetType = z.infer< typeof BudgetType >

export const PostingDetails = z.object( {
  budget: z.object( {
    type: BudgetType,
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string().nullable(),
  } ).nullable(),
  skills: z.array( z.string() ),
  description: z.string().nullable(),
  experience_level: z.string().nullable(),
  duration: z.string().nullable(),
  proposals: z.string().nullable(),
  client: z.object( {
    country: z.string().nullable(),
    rating: z.number().nullable(),
    total_spent: z.string().nullable(),
    payment_verified: z.boolean().nullable(),
    hires: z.string().nullable(),
  } ).nullable(),
  extra: z.array( z.object( {
    key: z.string(),
    value: z.string(),
  } ) ),
} )
export type PostingDetails = z.infer< typeof PostingDetails >

export const Posting = z.object( {
  id: z.uuid(),
  platform: z.string(),
  platform_job_id: z.string().nullable(),
  title: z.string(),
  url: z.url(),
  posted_at: z.iso.datetime().nullable(),
  first_seen_at: z.iso.datetime(),
  last_seen_at: z.iso.datetime(),
  sightings: z.int().min( 0 ),
  details: PostingDetails,
} )
export type Posting = z.infer< typeof Posting >

const Paging = {
  limit: z.coerce.number().pipe( z.int().min( 1 ).max( 100 ) ).default( 50 ),
  offset: z.coerce.number().pipe( z.int().min( 0 ) ).default( 0 ),
}

export const ListPostingsQuery = z.object( {
  q: z.string().max( 200 ).optional(),
  platform: z.string().optional(),
  ...Paging,
} )
export type ListPostingsQuery = z.infer< typeof ListPostingsQuery >

export const ListPostingsResponse = z.object( {
  postings: z.array( Posting ),
  total: z.int().min( 0 ),
  filtered: z.int().min( 0 ),
  platforms: z.array( z.string() ),
} )
export type ListPostingsResponse = z.infer< typeof ListPostingsResponse >

export const AlertEmailStatus = z.enum( [ 'pending', 'extracted', 'no_jobs', 'failed' ] )
export type AlertEmailStatus = z.infer< typeof AlertEmailStatus >

export const AlertEmail = z.object( {
  id: z.uuid(),
  source_id: z.uuid(),
  source_name: z.string(),
  subject: z.string(),
  sender: z.string(),
  received_at: z.iso.datetime(),
  link: z.url(),
  status: AlertEmailStatus,
  postings_count: z.int().min( 0 ),
  attempts: z.int().min( 0 ),
  error: z.string().nullable(),
} )
export type AlertEmail = z.infer< typeof AlertEmail >

export const ListAlertEmailsQuery = z.object( {
  status: AlertEmailStatus.optional(),
  ...Paging,
} )
export type ListAlertEmailsQuery = z.infer< typeof ListAlertEmailsQuery >

export const ListAlertEmailsResponse = z.object( {
  emails: z.array( AlertEmail ),
  total: z.int().min( 0 ),
} )
export type ListAlertEmailsResponse = z.infer< typeof ListAlertEmailsResponse >

export const PostingSightingsResponse = z.object( {
  emails: z.array( AlertEmail ),
} )
export type PostingSightingsResponse = z.infer< typeof PostingSightingsResponse >
