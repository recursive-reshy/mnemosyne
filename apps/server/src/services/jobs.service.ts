// Shared
import {
  DownloadFormat,
  Job,
  JobStatus,
  Transcript,
} from '@mnemosyne/shared'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Formatters
import { transcriptFilename } from '../formatters/filename.js'
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatSrt } from '../formatters/srt.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Repositories
import {
  StoredJob,
  findJobById,
  findNextQueuedJob as findNextQueuedStoredJob,
  insertJob,
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

const finishedFrom: JobStatus = 'transcribing'
const finalStatuses: JobStatus[] = [ 'done', 'failed' ]

function toPublicJob( job: StoredJob ): Job {
  return {
    id: job.id,
    url: job.url,
    status: job.status,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
  }
}

function requireJob( id: string ): StoredJob {
  const job = findJobById( id )

  if( job === undefined ) {
    throw new NotFoundError( 'Job not found' )
  }

  return job
}

function moveTo( job: StoredJob, status: JobStatus, changes: Partial< StoredJob > ): Job {
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

function conflict( from: JobStatus, to: JobStatus ): ConflictError {
  return new ConflictError( `Cannot move job from ${ from } to ${ to }` )
}

export function queueJob( url: string ): Job {
  const now = new Date().toISOString()
  const job: StoredJob = {
    id: crypto.randomUUID(),
    url,
    status: 'queued',
    error: null,
    created_at: now,
    updated_at: now,
    transcript: null,
  }

  insertJob( job )

  return toPublicJob( job )
}

export function findJob( id: string ): Job {
  return toPublicJob( requireJob( id ) )
}

export function findNextQueuedJob(): Job | undefined {
  const job = findNextQueuedStoredJob()

  return job === undefined ? undefined : toPublicJob( job )
}

export function markStatus( id: string, status: StepStatus ): Job {
  const job = requireJob( id )
  const allowed = job.status in nextStep
    ? nextStep[ job.status as keyof typeof nextStep ]
    : undefined

  if( allowed !== status ) {
    throw conflict( job.status, status )
  }

  return moveTo( job, status, {} )
}

export function completeJob( id: string, transcript: Transcript ): Job {
  const job = requireJob( id )

  if( job.status !== finishedFrom ) {
    throw conflict( job.status, 'done' )
  }

  return moveTo( job, 'done', { transcript } )
}

export function failJob( id: string, message: string ): Job {
  const job = requireJob( id )

  if( finalStatuses.includes( job.status ) ) {
    throw conflict( job.status, 'failed' )
  }

  return moveTo( job, 'failed', { error: message } )
}

export function renderTranscript( id: string, format: DownloadFormat ): RenderedTranscript {
  const job = requireJob( id )

  if( job.status !== 'done' ) {
    throw new ConflictError( 'Transcript not ready' )
  }

  if( job.transcript === null ) {
    throw new Error( `Job ${ id } is done but has no transcript` )
  }

  const { contentType, formatter } = transcriptFormats[ format ]

  return {
    filename: transcriptFilename( job.transcript.meta.title, format ),
    contentType,
    body: formatter( job.transcript ),
  }
}
