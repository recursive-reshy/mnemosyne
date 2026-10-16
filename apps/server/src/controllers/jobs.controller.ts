// Express
import { Request, Response } from 'express'
// Shared
import {
  CreateJobBody,
  CreateJobResponse,
  DownloadFormat,
  GetJobResponse,
  GetTranscriptResponse,
  ListJobsResponse,
  SaveJobBody,
  SaveJobResponse,
  UpdateDraftBody,
  UpdateDraftResponse,
} from '@mnemosyne/shared'
// Services
import {
  discardJob,
  findJob,
  findTranscript,
  listJobs,
  queueJob,
  renderTranscript,
  retrySummary,
  saveJob,
  updateDraft,
} from '../services/jobs.service.js'

export const createJob = ( { body }: Request, res: Response< CreateJobResponse > ): void => {
  const { url } = CreateJobBody.parse( body )

  const job = queueJob( url )

  res
    .status( 202 )
    .location( `/api/jobs/${ job.id }` )
    .json( { job_id: job.id } )
}

export const listActiveJobs = ( _req: Request, res: Response< ListJobsResponse > ): void => {
  res.status( 200 ).json( { jobs: listJobs() } )
}

export const getJob = ( { params }: Request, res: Response< GetJobResponse > ): void => {
  const job = findJob( String( params.id ) )

  res.status( 200 ).json( { job } )
}

export const getTranscript = (
  { params }: Request,
  res: Response< GetTranscriptResponse >,
): void => {
  const transcript = findTranscript( String( params.id ) )

  res.status( 200 ).json( { transcript } )
}

export const updateJobDraft = (
  { params, body }: Request,
  res: Response< UpdateDraftResponse >,
): void => {
  const changes = UpdateDraftBody.parse( body )

  const job = updateDraft( String( params.id ), changes )

  res.status( 200 ).json( { job } )
}

export const saveReviewedJob = async (
  { params, body }: Request,
  res: Response< SaveJobResponse >,
): Promise< void > => {
  const edits = SaveJobBody.parse( body )

  const savedPath = await saveJob( String( params.id ), edits )

  res.status( 200 ).json( { saved_path: savedPath } )
}

export const retryJobSummary = ( { params }: Request, res: Response< GetJobResponse > ): void => {
  const job = retrySummary( String( params.id ) )

  res.status( 202 ).json( { job } )
}

export const discardReviewedJob = ( { params }: Request, res: Response ): void => {
  discardJob( String( params.id ) )

  res.status( 204 ).end()
}

export const downloadTranscript = ( { params, query }: Request, res: Response ): void => {
  const format = DownloadFormat.parse( query.format ?? 'md' )

  const { filename, contentType, body } = renderTranscript( String( params.id ), format )

  res
    .status( 200 )
    .type( contentType )
    .attachment( filename )
    .send( body )
}
