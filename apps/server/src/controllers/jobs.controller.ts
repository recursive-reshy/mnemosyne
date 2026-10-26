// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  AcceptLinkSuggestionsBody,
  CreateJobBody,
  CreateJobResponse,
  DownloadFormat,
  GetJobResponse,
  GetSourceResponse,
  LinkSuggestionsResponse,
  ListJobsResponse,
  ListLinkSuggestionsResponse,
  RegenerateSummaryBody,
  RejectLinkSuggestionsBody,
  RunLinkingBody,
  SaveJobResponse,
  SubmitPastedTextBody,
  UpdateDraftBody,
  UpdateDraftResponse,
} from '@mnemosyne/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  acceptSuggestions,
  discardJob,
  findJob,
  findSource,
  listJobs,
  listLinkSuggestions,
  queueJob,
  regenerateSummary,
  rejectSuggestions,
  renderTranscript,
  retrySummary,
  runLinking,
  saveJob,
  submitPastedText,
  updateDraft,
} from '../services/jobs.service.js'

export const createJob = async (
  req: Request,
  res: Response< CreateJobResponse >,
): Promise< void > => {
  const job = await queueJob( currentUser( req ).id, CreateJobBody.parse( req.body ) )

  res
    .status( 202 )
    .location( `/api/jobs/${ job.id }` )
    .json( { job_id: job.id } )
}

export const submitJobText = (
  { params, body }: Request,
  res: Response< GetJobResponse >,
): void => {
  const job = submitPastedText( String( params.id ), SubmitPastedTextBody.parse( body ) )

  res.status( 200 ).json( { job } )
}

export const listActiveJobs = ( _req: Request, res: Response< ListJobsResponse > ): void => {
  res.status( 200 ).json( { jobs: listJobs() } )
}

export const getJob = ( { params }: Request, res: Response< GetJobResponse > ): void => {
  const job = findJob( String( params.id ) )

  res.status( 200 ).json( { job } )
}

export const getSource = (
  { params }: Request,
  res: Response< GetSourceResponse >,
): void => {
  const source = findSource( String( params.id ) )

  res.status( 200 ).json( { source } )
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
  { params }: Request,
  res: Response< SaveJobResponse >,
): Promise< void > => {
  const savedPath = await saveJob( String( params.id ) )

  res.status( 200 ).json( { saved_path: savedPath } )
}

export const retryJobSummary = ( { params }: Request, res: Response< GetJobResponse > ): void => {
  const job = retrySummary( String( params.id ) )

  res.status( 202 ).json( { job } )
}

export const regenerateJobSummary = async (
  req: Request,
  res: Response< GetJobResponse >,
): Promise< void > => {
  const choices = RegenerateSummaryBody.parse( req.body ?? {} )
  const job = await regenerateSummary( currentUser( req ).id, String( req.params.id ), choices )

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

const jobIdParam = ( params: Request[ 'params' ] ): string => z.uuid().parse( params.id )

export const getLinkSuggestions = (
  { params }: Request,
  res: Response< ListLinkSuggestionsResponse >,
): void => {
  res.status( 200 ).json( { suggestions: listLinkSuggestions( jobIdParam( params ) ) } )
}

export const acceptLinkSuggestions = (
  { params, body }: Request,
  res: Response< LinkSuggestionsResponse >,
): void => {
  const result = acceptSuggestions( jobIdParam( params ), AcceptLinkSuggestionsBody.parse( body ) )

  res.status( 200 ).json( result )
}

export const rejectLinkSuggestions = (
  { params, body }: Request,
  res: Response< LinkSuggestionsResponse >,
): void => {
  const result = rejectSuggestions( jobIdParam( params ), RejectLinkSuggestionsBody.parse( body ) )

  res.status( 200 ).json( result )
}

export const runJobLinking = (
  { params, body }: Request,
  res: Response< GetJobResponse >,
): void => {
  const job = runLinking( jobIdParam( params ), RunLinkingBody.parse( body ?? {} ) )

  res.status( 202 ).json( { job } )
}
