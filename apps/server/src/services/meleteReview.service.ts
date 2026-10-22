// Shared
import type { GetNextReviewResponse } from '@mnemosyne/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError } from '../errors.js'
// Melete
import { obsidianUrl } from '../melete/obsidian.js'
import {
  LEARN_AHEAD_MS,
  newRemaining,
  reviewCounts,
} from '../melete/queue.js'
// Repositories
import { findNote } from '../repositories/meleteNotes.repository.js'
import {
  QueuedQuestion,
  listDue,
  listLearningSoon,
  listNew,
  saveCard,
} from '../repositories/meleteQuestions.repository.js'
import { SubjectRecord } from '../repositories/meleteSubjects.repository.js'
// Services
import {
  listSubjectsInRoot,
  requireSubjectInRoot,
  subjectName,
  toMeleteQuestion,
} from './melete.service.js'
import { scanLearningRoot } from './meleteScan.service.js'
import { getLearningRoot } from './settings.service.js'

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
