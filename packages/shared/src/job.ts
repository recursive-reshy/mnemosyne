// Packages
import { z } from 'zod'
// Summarizer
import { SummaryUsage } from './summarizer.js'

export const JobStatus = z.enum( [
  'queued',
  'downloading',
  'converting',
  'transcribing',
  'summarizing',
  'ready_for_review',
  'summary_failed',
  'saved',
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
  note_markdown: z.string().nullable(),
  target_folder: z.string().nullable(),
  expires_at: z.iso.datetime().nullable(),
  saved_path: z.string().nullable(),
  summary_model: z.string().nullable(),
  prompt_profile_id: z.uuid().nullable(),
  summary_usage: SummaryUsage.nullable(),
} )
export type Job = z.infer< typeof Job >
