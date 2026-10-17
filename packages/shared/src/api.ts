// Packages
import { z } from 'zod'
// Job
import { Job } from './job.js'
// Transcript
import { Transcript } from './transcript.js'

export const CreateJobBody = z.object( {
  url: z.url( { protocol: /^https?$/ } ),
  model: z.string().min( 1 ).optional(),
  profile_id: z.uuid().optional(),
} )
export type CreateJobBody = z.infer< typeof CreateJobBody >

export const CreateJobResponse = z.object( {
  job_id: z.uuid(),
} )
export type CreateJobResponse = z.infer< typeof CreateJobResponse >

export const GetJobResponse = z.object( {
  job: Job,
} )
export type GetJobResponse = z.infer< typeof GetJobResponse >

export const ListJobsResponse = z.object( {
  jobs: z.array( Job ),
} )
export type ListJobsResponse = z.infer< typeof ListJobsResponse >

export const GetTranscriptResponse = z.object( {
  transcript: Transcript,
} )
export type GetTranscriptResponse = z.infer< typeof GetTranscriptResponse >

export const SaveJobResponse = z.object( {
  saved_path: z.string().min( 1 ),
} )
export type SaveJobResponse = z.infer< typeof SaveJobResponse >

export const DownloadFormat = z.enum( [ 'md', 'srt', 'txt' ] )
export type DownloadFormat = z.infer< typeof DownloadFormat >

export const FolderNode = z.object( {
  name: z.string(),
  path: z.string(),
  get children(): z.ZodArray< typeof FolderNode > {
    return z.array( FolderNode )
  },
} )
export type FolderNode = z.infer< typeof FolderNode >

export const ListFoldersResponse = z.object( {
  default_folder: z.string(),
  folders: z.array( FolderNode ),
} )
export type ListFoldersResponse = z.infer< typeof ListFoldersResponse >

export const UpdateDraftBody = z
  .object( {
    note_markdown: z.string().optional(),
    target_folder: z.string().nullable().optional(),
  } )
  .refine(
    ( body ) => body.note_markdown !== undefined || body.target_folder !== undefined,
    'Send note_markdown, target_folder or both',
  )
export type UpdateDraftBody = z.infer< typeof UpdateDraftBody >

export const UpdateDraftResponse = z.object( {
  job: Job,
} )
export type UpdateDraftResponse = z.infer< typeof UpdateDraftResponse >
