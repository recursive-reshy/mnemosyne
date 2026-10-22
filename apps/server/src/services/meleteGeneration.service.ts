// Node
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
// Clients
import { generateQuestions } from '../clients/claude.client.js'
// Config
import { config } from '../config.js'
// Errors
import { MeleteError } from '../errors.js'
// Melete
import { LOCKED_INSTRUCTIONS_MELETE_QUESTIONS, buildMeleteSystemPrompt } from '../melete/prompts.js'
import { processQuestions } from '../melete/questions.js'
import { bodyHash, noteTitle, splitFrontMatter } from '../melete/scan.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { NoteRecord, findNote, updateNote } from '../repositories/meleteNotes.repository.js'
import { insertQuestions, listForNote } from '../repositories/meleteQuestions.repository.js'
import { insertRun } from '../repositories/meleteRuns.repository.js'
import { findSubject } from '../repositories/meleteSubjects.repository.js'
// Services
import { scanLearningRoot } from './meleteScan.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
import { resolveMeleteQuestionModel } from './settings.service.js'
// Summarizer
import { estimateCostUsd } from '../summarizer/pricing.js'
// Logging
import { logger } from '../logger.js'

const MAX_BODY_CHARACTERS = 60_000

type Usage = { input_tokens: number, output_tokens: number }

type RunDetails = {
  noteId: string
  model: string
  promptVersionId: number
  usage: Usage | undefined
  error?: string
  now: Date
}

const isGone = ( error: unknown ): boolean => {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

const messageOf = ( error: unknown ): string => {
  return error instanceof Error ? error.message : 'Unknown error'
}

const recordRun = ( details: RunDetails ): number => {
  const { noteId, model, promptVersionId, usage, error, now } = details
  const inputTokens = usage?.input_tokens ?? null
  const outputTokens = usage?.output_tokens ?? null

  return insertRun( {
    kind: 'generate',
    note_id: noteId,
    question_id: null,
    model,
    prompt_version_id: promptVersionId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: estimateCostUsd( model, inputTokens, outputTokens ),
    outcome: error === undefined ? 'succeeded' : 'failed',
    error: error ?? null,
    created_at: now.toISOString(),
  } )
}

const failNote = ( noteId: string, message: string, run?: RunDetails ): void => {
  getDatabase().transaction( () => {
    if( run !== undefined ) {
      recordRun( { ...run, error: message } )
    }

    updateNote( noteId, { generation: 'failed', generation_error: message } )
  } )()
  logger.warn( { error: message }, 'Question generation failed' )
}

// The scan applies the edit and missing rules; a note it leaves `generating` has nothing to make
const handBackToScan = async ( noteId: string, now: Date ): Promise< void > => {
  try {
    await scanLearningRoot( { force: true, now } )
  } catch( error ) {
    logger.warn( { error: messageOf( error ) }, 'Scan after a changed note failed' )
  }

  if( findNote( noteId )?.generation === 'generating' ) {
    updateNote( noteId, { generation: 'idle' } )
  }
}

const readCurrent = async (
  note: NoteRecord,
): Promise< { body: string, hash: string, title: string } | 'gone' > => {
  try {
    const text = await readFile( join( config.vaultPath, note.path ), 'utf8' )
    const { frontMatter, body } = splitFrontMatter( text )

    return { body, hash: bodyHash( body ), title: noteTitle( frontMatter, note.path ) }
  } catch( error ) {
    if( isGone( error ) ) {
      return 'gone'
    }

    throw error
  }
}

// Makes the questions for one claimed note; a failure is stored on the note, never thrown
export const generateForNote = async ( noteId: string, now = new Date() ): Promise< void > => {
  const note = findNote( noteId )

  if( note === undefined ) {
    logger.warn( 'Queued note not found' )

    return
  }

  if( !note.enrolled || note.missing_at !== null ) {
    updateNote( noteId, { generation: 'idle' } )

    return
  }

  try {
    const current = await readCurrent( note )

    if( current === 'gone' || current.hash !== note.body_hash ) {
      await handBackToScan( noteId, now )

      return
    }

    const hasQuestions = listForNote( noteId ).some( ( { state, body_hash: hash } ) => {
      return state === 'active' && hash === current.hash
    } )

    if( hasQuestions ) {
      updateNote( noteId, { generation: 'idle' } )

      return
    }

    const model = await resolveMeleteQuestionModel()
    const { version } = resolveMeletePrompt( 'melete_questions' )
    const run = { noteId, model, promptVersionId: version.id, now }

    if( current.body.length > MAX_BODY_CHARACTERS ) {
      failNote(
        noteId,
        `Note is too long for question generation (${ current.body.length } characters, `
          + `limit ${ MAX_BODY_CHARACTERS }). Split it into smaller notes.`,
        { ...run, usage: undefined },
      )

      return
    }

    const subjectName = basename( findSubject( note.subject_id )?.folder ?? '' )
    let outcome: Awaited< ReturnType< typeof generateQuestions > >

    try {
      outcome = await generateQuestions( {
        model,
        system: buildMeleteSystemPrompt( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS, version.guidance ),
        user: `Subject: ${ subjectName }\nTitle: ${ current.title }\n\n${ current.body }`,
      } )
    } catch( error ) {
      failNote(
        noteId,
        messageOf( error ),
        { ...run, usage: error instanceof MeleteError ? error.usage : undefined },
      )

      return
    }

    const questions = processQuestions( outcome.output, current.body )

    if( questions.length === 0 ) {
      failNote( noteId, 'No usable questions came back', { ...run, usage: outcome.usage } )

      return
    }

    try {
      getDatabase().transaction( () => {
        const runId = recordRun( { ...run, usage: outcome.usage } )
        const latest = findNote( noteId )

        // Edited during the call: these questions are stale, and the scan has queued the note
        // again if it is enrolled
        if( latest?.body_hash !== current.hash ) {
          if( latest?.generation === 'generating' ) {
            updateNote( noteId, { generation: 'idle' } )
          }

          return
        }

        insertQuestions( noteId, runId, current.hash, questions )
        updateNote( noteId, { generation: 'idle', generation_error: null } )
      } )()
    } catch( error ) {
      failNote( noteId, messageOf( error ), { ...run, usage: outcome.usage } )
    }
  } catch( error ) {
    failNote( noteId, messageOf( error ) )
  }
}
