// Shared
import {
  CreateJobBody,
  DownloadFormat,
  Job,
  JobStatus,
  SummaryUsage,
  NoteParseError,
  SourceDocument,
  SourceType,
  SubmitPastedTextBody,
  Transcript,
  UpdateDraftBody,
  applyLockedProperties,
  detectSourceType,
  lockedPropertiesFor,
  parseFolderPath,
  parseNote,
  serializeNote,
} from '@mnemosyne/shared'
// Clients
import type { TokenUsage } from '../clients/claude.client.js'
import { writeNote } from '../clients/vault.client.js'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Formatters
import { transcriptFilename } from '../formatters/filename.js'
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatNote } from '../formatters/note.formatter.js'
import { formatSrt } from '../formatters/srt.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Repositories
import {
  StoredJob,
  deleteJob,
  findExpiredJobs,
  findJobById,
  findNextRunnableJob as findNextRunnableStoredJob,
  insertJob,
  listActiveJobs,
  markInterruptedJobs,
  updateJob,
} from '../repositories/jobStore.repository.js'
import { findProfileById, findVersionById } from '../repositories/promptProfiles.repository.js'
import { insertSummaryRun, listRunsForJob } from '../repositories/summaryRuns.repository.js'
// Sources
import { articleFromText } from '../sources/text.js'
// Summarizer
import { estimateCostUsd } from '../summarizer/pricing.js'
// Services
import { assertKnownModel } from './models.service.js'
import { assertActiveProfile } from './prompts.service.js'

export type StepStatus = 'fetching' | 'downloading' | 'converting' | 'transcribing'

const nextStep: Record< SourceType, Partial< Record< JobStatus, StepStatus > > > = {
  video: {
    queued: 'downloading',
    downloading: 'converting',
    converting: 'transcribing',
  },
  article: { queued: 'fetching' },
}

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

const toSummaryUsage = ( jobId: string ): SummaryUsage | null => {
  const runs = listRunsForJob( jobId )
  const last = runs.at( -1 )

  if( last === undefined ) {
    return null
  }

  const version = findVersionById( last.prompt_version_id )
  const profile = version === undefined ? undefined : findProfileById( version.profile_id )

  if( version === undefined || profile === undefined ) {
    throw new Error( `Summary run for job ${ jobId } points at a missing prompt version` )
  }

  const hasUnpricedTokens = runs.some(
    ( run ) => run.input_tokens !== null && run.cost_usd === null,
  )

  return {
    last_run: {
      model: last.model,
      profile_id: profile.id,
      profile_name: profile.name,
      prompt_version: version.version,
      input_tokens: last.input_tokens,
      output_tokens: last.output_tokens,
      cost_usd: last.cost_usd,
      outcome: last.outcome,
      created_at: last.created_at,
    },
    run_count: runs.length,
    total_input_tokens: runs.reduce( ( sum, run ) => sum + ( run.input_tokens ?? 0 ), 0 ),
    total_output_tokens: runs.reduce( ( sum, run ) => sum + ( run.output_tokens ?? 0 ), 0 ),
    total_cost_usd: hasUnpricedTokens
      ? null
      : runs.reduce( ( sum, run ) => sum + ( run.cost_usd ?? 0 ), 0 ),
  }
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
    note_markdown: job.note_markdown,
    target_folder: job.target_folder,
    expires_at: job.expires_at,
    saved_path: job.saved_path,
    summary_model: job.summary_model,
    prompt_profile_id: job.prompt_profile_id,
    summary_usage: toSummaryUsage( job.id ),
    source_type: job.source_type,
    feed_id: job.feed_id,
    feed_name: job.feed_name,
  }
}

const toTranscript = ( id: string, document: SourceDocument ): Transcript => {
  if( document.kind !== 'video' ) {
    throw new Error( `Job ${ id } is an article, not a video` )
  }

  return { meta: document.meta, segments: document.segments }
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

type SummaryChoices = { model?: string | undefined, profile_id?: string | undefined }

const validateChoices = async ( { model, profile_id }: SummaryChoices ): Promise< void > => {
  if( model !== undefined ) {
    await assertKnownModel( model )
  }

  if( profile_id !== undefined ) {
    assertActiveProfile( profile_id )
  }
}

export const queueJob = async (
  body: CreateJobBody,
  extra: { feed_id?: string } = {},
): Promise< Job > => {
  const { url, text, title } = body
  const sourceType = body.source_type ?? detectSourceType( url )

  await validateChoices( body )

  if( text !== undefined && sourceType !== 'article' ) {
    throw new ValidationError( 'Pasted text is only for articles' )
  }

  const document = text === undefined
    ? null
    : articleFromText( { url, text, title, origin: 'pasted' } )
  const now = new Date().toISOString()
  const job: StoredJob = {
    id: crypto.randomUUID(),
    url,
    status: document === null ? 'queued' : 'summarizing',
    error: null,
    created_at: now,
    updated_at: now,
    title: document?.meta.title ?? null,
    note_markdown: null,
    target_folder: null,
    expires_at: null,
    saved_path: null,
    summary_model: body.model ?? null,
    prompt_profile_id: body.profile_id ?? null,
    source_document: document,
    source_type: sourceType,
    feed_id: extra.feed_id ?? null,
    feed_name: null,
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
  const allowed = nextStep[ job.source_type ][ job.status ]

  if( allowed !== status ) {
    throw conflict( job.status, status )
  }

  return moveTo( job, status, {} )
}

export const completeAcquisition = ( id: string, document: SourceDocument ): Job => {
  const job = requireJob( id )

  const expected = document.kind === 'video' ? 'transcribing' : 'fetching'

  if( job.status !== expected || job.source_type !== document.kind ) {
    throw conflict( job.status, 'summarizing' )
  }

  return moveTo( job, 'summarizing', {
    source_document: document,
    title: document.meta.title,
  } )
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

  const document = getSource( id )

  return moveTo( job, 'ready_for_review', {
    note_markdown: formatNote( {
      title: job.title ?? document.meta.title,
      tags: suggestedTags,
      body: summaryMarkdown,
      document,
      created: new Date().toISOString().slice( 0, 10 ),
    } ),
    error: null,
    expires_at: expiryFromNow(),
  } )
}

export const recordSummaryRun = (
  jobId: string,
  run: {
    model: string
    promptVersionId: number
    usage: TokenUsage | undefined
    error?: string
  },
): void => {
  const inputTokens = run.usage?.input_tokens ?? null
  const outputTokens = run.usage?.output_tokens ?? null

  insertSummaryRun( {
    job_id: jobId,
    model: run.model,
    prompt_version_id: run.promptVersionId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: estimateCostUsd( run.model, inputTokens, outputTokens ),
    outcome: run.error === undefined ? 'succeeded' : 'failed',
    error: run.error ?? null,
    created_at: new Date().toISOString(),
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

export const regenerateSummary = async (
  id: string,
  choices: SummaryChoices,
): Promise< Job > => {
  const job = requireJob( id )

  if( job.status !== 'ready_for_review' ) {
    throw conflict( job.status, 'summarizing' )
  }

  await validateChoices( choices )

  return moveTo( job, 'summarizing', {
    summary_model: choices.model ?? job.summary_model,
    prompt_profile_id: choices.profile_id ?? job.prompt_profile_id,
    error: null,
    expires_at: null,
  } )
}

export const discardJob = ( id: string ): void => {
  const job = requireJob( id )

  if( !downloadableStatuses.includes( job.status ) ) {
    throw new ConflictError( `Cannot discard a job that is ${ job.status }` )
  }

  deleteJob( id )
}

export const deleteExpiredJobs = (): number => {
  const expired = findExpiredJobs( new Date().toISOString() )

  for( const { id } of expired ) {
    deleteJob( id )
  }

  return expired.length
}

export const getSource = ( id: string ): SourceDocument => {
  const job = requireJob( id )

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } has no transcript` )
  }

  return job.source_document
}

export const submitPastedText = (
  id: string,
  { text, title }: SubmitPastedTextBody,
): Job => {
  const job = requireJob( id )

  if( job.source_type !== 'article' || job.status !== 'failed' ) {
    throw new ConflictError( 'Pasted text can only continue a failed article job' )
  }

  const document = articleFromText( { url: job.url, text, title, origin: 'pasted' } )

  return moveTo( job, 'summarizing', {
    source_document: document,
    title: document.meta.title,
    error: null,
  } )
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

export const findSource = ( id: string ): SourceDocument => {
  const job = requireJob( id )

  if( !downloadableStatuses.includes( job.status ) ) {
    throw new ConflictError( 'Transcript not ready' )
  }

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  return job.source_document
}

const today = (): string => new Date().toISOString().slice( 0, 10 )

export const updateDraft = ( id: string, body: UpdateDraftBody ): Job => {
  const job = requireJob( id )

  if( job.status !== 'ready_for_review' ) {
    throw conflict( job.status, 'ready_for_review' )
  }

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  const changes: Partial< StoredJob > = { expires_at: expiryFromNow() }

  if( body.note_markdown !== undefined ) {
    let created = today()

    try {
      if( job.note_markdown !== null ) {
        created = parseNote( job.note_markdown ).properties.created
      }

      const note = applyLockedProperties(
        parseNote( body.note_markdown ),
        lockedPropertiesFor( job.source_document, created ),
      )

      changes.note_markdown = serializeNote( note )
      changes.title = note.properties.title
    } catch( error ) {
      if( !( error instanceof NoteParseError ) ) {
        throw error
      }

      throw new ValidationError( `front-matter invalid: ${ error.message }` )
    }
  }

  if( body.target_folder !== undefined ) {
    if( body.target_folder !== null ) {
      try {
        parseFolderPath( body.target_folder )
      } catch( error ) {
        throw new ValidationError( error instanceof Error ? error.message : 'Invalid folder' )
      }
    }

    changes.target_folder = body.target_folder
  }

  return moveTo( job, job.status, changes )
}

export const saveJob = async ( id: string ): Promise< string > => {
  const job = requireJob( id )

  if( job.status !== 'ready_for_review' ) {
    throw conflict( job.status, 'saved' )
  }

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  if( job.note_markdown === null ) {
    throw new ConflictError( 'The job has no draft to save' )
  }

  const note = applyLockedProperties(
    parseNote( job.note_markdown ),
    lockedPropertiesFor( job.source_document, today() ),
  )

  const savedPath = await writeNote(
    config.vaultPath,
    job.target_folder ?? config.defaultNoteFolder,
    note.properties.title,
    serializeNote( note ),
  )

  moveTo( job, 'saved', {
    saved_path: savedPath,
    title: note.properties.title,
    source_document: null,
    expires_at: null,
  } )

  return savedPath
}

export const renderTranscript = ( id: string, format: DownloadFormat ): RenderedTranscript => {
  const document = findSource( id )

  if( document.kind === 'article' ) {
    if( format !== 'md' ) {
      throw new ConflictError( 'Only Markdown is available for articles' )
    }

    return {
      filename: transcriptFilename( document.meta.title, format ),
      contentType: transcriptFormats.md.contentType,
      body: `# ${ document.meta.title }\n\n${ document.meta.source }\n\n${ document.markdown }`,
    }
  }

  const transcript = toTranscript( id, document )
  const { contentType, formatter } = transcriptFormats[ format ]

  return {
    filename: transcriptFilename( transcript.meta.title, format ),
    contentType,
    body: formatter( transcript ),
  }
}
