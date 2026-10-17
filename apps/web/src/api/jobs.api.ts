// Shared
import {
  CreateJobResponse,
  GetJobResponse,
  GetTranscriptResponse,
  ListJobsResponse,
  SaveJobResponse,
  UpdateDraftResponse,
} from '@mnemosyne/shared'
import type {
  CreateJobBody,
  DownloadFormat,
  Job,
  RegenerateSummaryBody,
  Transcript,
  UpdateDraftBody,
} from '@mnemosyne/shared'
// App
import { request, send } from './request'

const jobPath = ( id: string ): string => `/api/jobs/${ encodeURIComponent( id ) }`

type SummaryOptions = Pick< CreateJobBody, 'model' | 'profile_id' >

export const createJob = async (
  url: string,
  options: SummaryOptions = {},
): Promise< string > => {
  const body: CreateJobBody = { url }

  if( options.model !== undefined ) {
    body.model = options.model
  }

  if( options.profile_id !== undefined ) {
    body.profile_id = options.profile_id
  }

  const { job_id } = await request( '/api/jobs', CreateJobResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )
  return job_id
}

export const getJob = async ( id: string ): Promise< Job > => {
  const { job } = await request( jobPath( id ), GetJobResponse )
  return job
}

export const listJobs = async (): Promise< Job[] > => {
  const { jobs } = await request( '/api/jobs', ListJobsResponse )
  return jobs
}

export const getTranscript = async ( id: string ): Promise< Transcript > => {
  const { transcript } = await request( `${ jobPath( id ) }/transcript`, GetTranscriptResponse )
  return transcript
}

export const updateDraft = async ( id: string, draft: UpdateDraftBody ): Promise< Job > => {
  const { job } = await request( `${ jobPath( id ) }/draft`, UpdateDraftResponse, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( draft ),
  } )
  return job
}

export const saveJob = async ( id: string ): Promise< string > => {
  const { saved_path } = await request( `${ jobPath( id ) }/save`, SaveJobResponse, {
    method: 'POST',
  } )
  return saved_path
}

export const retrySummary = async ( id: string ): Promise< Job > => {
  const { job } = await request( `${ jobPath( id ) }/retry-summary`, GetJobResponse, {
    method: 'POST',
  } )
  return job
}

export const regenerateSummary = async (
  id: string,
  body: RegenerateSummaryBody,
): Promise< Job > => {
  const { job } = await request( `${ jobPath( id ) }/regenerate-summary`, GetJobResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )
  return job
}

export const discardJob = async ( id: string ): Promise< void > => {
  await send( jobPath( id ), { method: 'DELETE' } )
}

export const downloadUrl = ( id: string, format: DownloadFormat ): string => {
  return `/api/jobs/${ encodeURIComponent( id ) }/download?format=${ format }`
}
