// Packages
import { z } from 'zod'
// Job
import { Job } from './job.js'
// Transcript
import { Transcript } from './transcript.js'

export const CreateJobBody = z.object( {
  url: z.url( { protocol: /^https?$/ } ),
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

export const SaveJobBody = z.object( {
  title: z.string().trim().min( 1 ),
  tags: z.array( z.string() ),
  body: z.string(),
} )
export type SaveJobBody = z.infer< typeof SaveJobBody >

export const SaveJobResponse = z.object( {
  saved_path: z.string().min( 1 ),
} )
export type SaveJobResponse = z.infer< typeof SaveJobResponse >

export const DownloadFormat = z.enum( [ 'md', 'srt', 'txt' ] )
export type DownloadFormat = z.infer< typeof DownloadFormat >
