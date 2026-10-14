// Packages
import { z } from 'zod'
// Job
import { Job } from './job.js'

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

export const DownloadFormat = z.enum( [ 'md', 'srt', 'txt' ] )
export type DownloadFormat = z.infer< typeof DownloadFormat >
