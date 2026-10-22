// Clients
import { gradeAnswer as gradeWithClaude } from '../clients/claude.client.js'
// Shared
import { MeleteReviewMode } from '@mnemosyne/shared'
import type {
  GetNextReviewResponse,
  GradeAnswerBody,
  GradeAnswerResponse,
  RecordReviewBody,
  RecordReviewResponse,
} from '@mnemosyne/shared'
// Config
import { config } from '../config.js'
// Errors
import {
  ConflictError,
  MeleteError,
  NotFoundError,
  ValidationError,
} from '../errors.js'
// Melete
import { isBlankAnswer } from '../melete/grading.js'
import { obsidianUrl } from '../melete/obsidian.js'
import {
  LOCKED_INSTRUCTIONS_MELETE_GRADING,
  buildMeleteGradingUser,
  buildMeleteSystemPrompt,
} from '../melete/prompts.js'
import {
  LEARN_AHEAD_MS,
  newRemaining,
  reviewCounts,
} from '../melete/queue.js'
import { recordMeleteRun } from '../melete/runs.js'
import {
  appScheduler,
  fromRow,
  nextCard,
  toRow,
} from '../melete/scheduler.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { findNote } from '../repositories/meleteNotes.repository.js'
import {
  CardRow,
  QueuedQuestion,
  QuestionRecord,
  findQuestion,
  listDue,
  listLearningSoon,
  listNew,
  saveCard,
} from '../repositories/meleteQuestions.repository.js'
import { insertReview } from '../repositories/meleteReviews.repository.js'
import { findRun } from '../repositories/meleteRuns.repository.js'
import { SubjectRecord } from '../repositories/meleteSubjects.repository.js'
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Services
import {
  listSubjectsInRoot,
  requireSubjectInRoot,
  subjectName,
  toMeleteQuestion,
} from './melete.service.js'
import { scanLearningRoot } from './meleteScan.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
import { getLearningRoot, resolveMeleteGradingModel } from './settings.service.js'
// Logging
import { logger } from '../logger.js'

type NextReviewOptions = { subjectId?: string, now?: Date }

// A new question gets its due time when it is first served, so its age starts then; until it
// is rated it stays `new` and, being due, comes back on a reload
const serveNew = ( subjects: SubjectRecord[], now: Date ): QueuedQuestion | undefined => {
  for( const subject of subjects ) {
    const remaining = newRemaining( subject, now )
    const [ question ] = remaining > 0 ? listNew( { subjectId: subject.id, limit: 1 } ) : []

    if( question !== undefined ) {
      const served = { ...question, due: now.toISOString() }

      saveCard( question.id, served )

      return served
    }
  }

  return undefined
}

const pickNext = ( subjects: SubjectRecord[], now: Date ): QueuedQuestion | undefined => {
  const subjectIds = subjects.map( ( { id } ) => id )

  return listDue( { subjectIds, now: now.toISOString() } )[ 0 ]
    ?? serveNew( subjects, now )
    ?? listLearningSoon( {
      subjectIds,
      until: new Date( now.getTime() + LEARN_AHEAD_MS ).toISOString(),
    } )[ 0 ]
}

export const getNextReview = async (
  { subjectId, now = new Date() }: NextReviewOptions = {},
): Promise< GetNextReviewResponse > => {
  const learningRoot = getLearningRoot()

  if( learningRoot === null ) {
    throw new ConflictError( 'Choose a learning root first' )
  }

  await scanLearningRoot( { now } )

  const subjects = subjectId === undefined
    ? await listSubjectsInRoot( learningRoot )
    : [ requireSubjectInRoot( subjectId, learningRoot ) ]
  const next = pickNext( subjects, now )
  const counts = reviewCounts( subjects, now )
  const note = next === undefined ? undefined : findNote( next.note_id )

  if( next === undefined || note === undefined ) {
    return { item: null, counts }
  }

  return {
    item: {
      question: toMeleteQuestion( next ),
      note: {
        id: note.id,
        title: note.title,
        path: note.path,
        subject_name: subjectName(
          subjects.find( ( { id } ) => id === note.subject_id )?.folder ?? '',
        ),
      },
      obsidian_url: obsidianUrl( config.obsidianVaultName, note.path ),
    },
    counts,
  }
}

const requireReviewable = ( questionId: string ): QuestionRecord => {
  const question = findQuestion( questionId )

  if( question === undefined ) {
    throw new NotFoundError( 'Question not found' )
  }

  const note = findNote( question.note_id )

  const inQueue = note !== undefined && note.enrolled && note.missing_at === null

  if( question.state !== 'active' || !inQueue ) {
    throw new ConflictError( 'This question is not in the review queue' )
  }

  return question
}

// Grading never throws for a model problem: the screen falls back to self-rating
export const gradeAnswer = async (
  questionId: string,
  { answer: learnerAnswer }: GradeAnswerBody,
  now = new Date(),
): Promise< GradeAnswerResponse > => {
  const question = requireReviewable( questionId )

  if( isBlankAnswer( learnerAnswer ) ) {
    return { outcome: 'skipped', reason: 'blank' }
  }

  try {
    const model = await resolveMeleteGradingModel()
    const { version } = resolveMeletePrompt( 'melete_grading' )
    const run = { kind: 'grade' as const, questionId, model, promptVersionId: version.id, now }

    try {
      const { output, usage } = await gradeWithClaude( {
        model,
        system: buildMeleteSystemPrompt( LOCKED_INSTRUCTIONS_MELETE_GRADING, version.guidance ),
        user: buildMeleteGradingUser( {
          question: question.prompt,
          answer: question.answer,
          passage: question.passage,
          learnerAnswer,
        } ),
      } )

      return {
        outcome: 'graded',
        grade: output,
        run_id: recordMeleteRun( { ...run, usage } ),
      }
    } catch( error ) {
      if( !( error instanceof MeleteError ) ) {
        throw error
      }

      logger.warn( { error: error.message }, 'Grading failed' )

      return {
        outcome: 'failed',
        reason: error.message,
        run_id: recordMeleteRun( { ...run, usage: error.usage, error: error.message } ),
      }
    }
  } catch( error ) {
    logger.error( { err: error }, 'Grading failed unexpectedly' )

    return { outcome: 'failed', reason: 'Grading failed', run_id: null }
  }
}

const requireGradeRun = ( runId: number, questionId: string ): void => {
  const run = findRun( runId )

  if( run?.kind !== 'grade' || run.question_id !== questionId ) {
    throw new ValidationError( 'That grading run is not for this question' )
  }
}

export const recordReview = async (
  questionId: string,
  body: RecordReviewBody,
  now = new Date(),
  scheduler = appScheduler(),
): Promise< RecordReviewResponse > => {
  const question = requireReviewable( questionId )

  if( body.grade_run_id !== undefined ) {
    requireGradeRun( body.grade_run_id, questionId )
  }

  getDatabase().transaction( () => {
    const before = CardRow.parse( question )

    saveCard( questionId, toRow( nextCard( fromRow( before, now ), body.rating, now, scheduler ) ) )
    insertReview( {
      question_id: questionId,
      reviewed_at: now.toISOString(),
      mode: body.mode,
      rating: body.rating,
      suggested_rating: body.suggested_rating ?? null,
      answer: body.answer ?? null,
      grade_run_id: body.grade_run_id ?? null,
      was_new: before.fsrs_state === 'new',
      before_state: JSON.stringify( before ),
    } )

    const mode = MeleteReviewMode.catch( 'typed' ).parse( getSetting( 'melete_review_mode' ) )

    if( mode !== body.mode ) {
      setSetting( 'melete_review_mode', body.mode )
    }
  } )()

  const learningRoot = getLearningRoot()
  const subjects = learningRoot === null ? [] : await listSubjectsInRoot( learningRoot )
  const updated = findQuestion( questionId )

  if( updated === undefined ) {
    throw new NotFoundError( 'Question not found' )
  }

  return { question: toMeleteQuestion( updated ), counts: reviewCounts( subjects, now ) }
}
