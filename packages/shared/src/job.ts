// Packages
import { z } from 'zod'

export const JobStatus = z.enum( [
  'queued',
  'downloading',
  'converting',
  'transcribing',
  'summarizing',
  'ready_for_review',
  'summary_failed',
  'saved',
  'done',
  'failed',
] )
export type JobStatus = z.infer< typeof JobStatus >

export const Job = z.object( {
  id: z.uuid(),
  url: z.url(),
  status: JobStatus,
  error: z.string().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  title: z.string().nullable(),
  summary_markdown: z.string().nullable(),
  suggested_tags: z.array( z.string() ),
  expires_at: z.iso.datetime().nullable(),
  saved_path: z.string().nullable(),
} )
export type Job = z.infer< typeof Job >
