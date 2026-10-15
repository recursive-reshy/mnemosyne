// Shared
import {
  DownloadFormat,
  Job,
  JobStatus,
  SaveJobBody,
  Transcript,
} from '@mnemosyne/shared'
// Clients
import { writeNote } from '../clients/vault.client.js'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Formatters
import { transcriptFilename } from '../formatters/filename.js'
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatNote } from '../formatters/note.formatter.js'
import { formatSrt } from '../formatters/srt.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Repositories
import {
  StoredJob,
  findJobById,
  findNextRunnableJob as findNextRunnableStoredJob,
  insertJob,
  listActiveJobs,
  markInterruptedJobs,
  updateJob,
} from '../repositories/jobStore.repository.js'

type StepStatus = 'downloading' | 'converting' | 'transcribing'

const nextStep = {
  queued: 'downloading',
  downloading: 'converting',
  converting: 'transcribing',
} as const

const transcriptFormats = {
  md: { contentType: 'text/markdown; charset=utf-8', formatter: formatMarkdown },
  srt: { contentType: 'application/x-subrip; charset=utf-8', formatter: formatSrt },
  txt: { contentType: 'text/plain; charset=utf-8', formatter: formatTxt },
} as const

type RenderedTranscript = {
  filename: string
  contentType: string
  body: string
}

const finalStatuses: JobStatus[] = [
  'failed',
  'ready_for_review',
  'summary_failed',
  'saved',
]
const downloadableStatuses: JobStatus[] = [ 'ready_for_review', 'summary_failed' ]
const HOUR_MS = 3_600_000

const expiryFromNow = (): string => {
  return new Date( Date.now() + config.reviewTtlHours * HOUR_MS ).toISOString()
}

const toPublicJob = ( job: StoredJob ): Job => {
  return {
    id: job.id,
    url: job.url,
    status: job.status,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
    title: job.title,
    summary_markdown: job.summary_markdown,
    suggested_tags: job.suggested_tags,
    expires_at: job.expires_at,
    saved_path: job.saved_path,
  }
}

const requireJob = ( id: string ): StoredJob => {
  const job = findJobById( id )

  if( job === undefined ) {
    throw new NotFoundError( 'Job not found' )
  }

  return job
}

const moveTo = ( job: StoredJob, status: JobStatus, changes: Partial< StoredJob > ): Job => {
  const updated = updateJob( job.id, {
    ...changes,
    status,
    updated_at: new Date().toISOString(),
  } )

  if( updated === undefined ) {
    throw new NotFoundError( 'Job not found' )
  }

  return toPublicJob( updated )
}

const conflict = ( from: JobStatus, to: JobStatus ): ConflictError => {
  return new ConflictError( `Cannot move job from ${ from } to ${ to }` )
}

export const queueJob = ( url: string ): Job => {
  const now = new Date().toISOString()
  const job: StoredJob = {
    id: crypto.randomUUID(),
    url,
    status: 'queued',
    error: null,
    created_at: now,
    updated_at: now,
    title: null,
    summary_markdown: null,
    suggested_tags: [],
    expires_at: null,
    saved_path: null,
    transcript: null,
  }

  insertJob( job )

  return toPublicJob( job )
}

export const findJob = ( id: string ): Job => {
  return toPublicJob( requireJob( id ) )
}

export const listJobs = (): Job[] => {
  return listActiveJobs().map( toPublicJob )
}

export const findNextRunnableJob = (): Job | undefined => {
  const job = findNextRunnableStoredJob()

  return job === undefined ? undefined : toPublicJob( job )
}

export const markStatus = ( id: string, status: StepStatus ): Job => {
  const job = requireJob( id )
  const allowed = job.status in nextStep
    ? nextStep[ job.status as keyof typeof nextStep ]
    : undefined

  if( allowed !== status ) {
    throw conflict( job.status, status )
  }

  return moveTo( job, status, {} )
}

export const completeTranscription = ( id: string, transcript: Transcript ): Job => {
  const job = requireJob( id )

  if( job.status !== 'transcribing' ) {
    throw conflict( job.status, 'summarizing' )
  }

  return moveTo( job, 'summarizing', { transcript, title: transcript.meta.title } )
}

export const completeSummary = (
  id: string,
  summaryMarkdown: string,
  suggestedTags: string[],
): Job => {
  const job = requireJob( id )

  if( job.status !== 'summarizing' ) {
    throw conflict( job.status, 'ready_for_review' )
  }

  return moveTo( job, 'ready_for_review', {
    summary_markdown: summaryMarkdown,
    suggested_tags: suggestedTags,
    error: null,
    expires_at: expiryFromNow(),
  } )
}

export const failSummary = ( id: string, message: string ): Job => {
  const job = requireJob( id )

  if( job.status !== 'summarizing' ) {
    throw conflict( job.status, 'summary_failed' )
  }

  return moveTo( job, 'summary_failed', { error: message, expires_at: expiryFromNow() } )
}

export const retrySummary = ( id: string ): Job => {
  const job = requireJob( id )

  if( job.status !== 'summary_failed' ) {
    throw conflict( job.status, 'summarizing' )
  }

  return moveTo( job, 'summarizing', { error: null, expires_at: null } )
}

export const getTranscript = ( id: string ): Transcript => {
  const job = requireJob( id )

  if( job.transcript === null ) {
    throw new Error( `Job ${ id } has no transcript` )
  }

  return job.transcript
}

export const failJob = ( id: string, message: string ): Job => {
  const job = requireJob( id )

  if( finalStatuses.includes( job.status ) ) {
    throw conflict( job.status, 'failed' )
  }

  return moveTo( job, 'failed', { error: message } )
}

export const recoverInterruptedJobs = (): number => {
  return markInterruptedJobs( 'Interrupted by restart', new Date().toISOString() )
}

export const findTranscript = ( id: string ): Transcript => {
  const job = requireJob( id )

  if( !downloadableStatuses.includes( job.status ) ) {
    throw new ConflictError( 'Transcript not ready' )
  }

  if( job.transcript === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  return job.transcript
}

export const saveJob = async ( id: string, edits: SaveJobBody ): Promise< string > => {
  const job = requireJob( id )

  if( job.status !== 'ready_for_review' ) {
    throw conflict( job.status, 'saved' )
  }

  if( job.transcript === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  const note = formatNote( {
    ...edits,
    meta: job.transcript.meta,
    created: new Date().toISOString().slice( 0, 10 ),
  } )

  const savedPath = await writeNote( config.vaultPath, edits.title, note )

  moveTo( job, 'saved', {
    saved_path: savedPath,
    title: edits.title,
    transcript: null,
    expires_at: null,
  } )

  return savedPath
}

export const renderTranscript = ( id: string, format: DownloadFormat ): RenderedTranscript => {
  const transcript = findTranscript( id )
  const { contentType, formatter } = transcriptFormats[ format ]

  return {
    filename: transcriptFilename( transcript.meta.title, format ),
    contentType,
    body: formatter( transcript ),
  }
}
