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
} )
export type Job = z.infer< typeof Job >
