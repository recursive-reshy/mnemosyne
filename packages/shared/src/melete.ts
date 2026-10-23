// Packages
import { z } from 'zod'

export const MeleteRating = z.enum( [ 'again', 'hard', 'good', 'easy' ] )
export type MeleteRating = z.infer< typeof MeleteRating >

export const MeleteReviewMode = z.enum( [ 'typed', 'quick' ] )
export type MeleteReviewMode = z.infer< typeof MeleteReviewMode >

export const MeleteGeneration = z.enum( [ 'idle', 'queued', 'generating', 'failed' ] )
export type MeleteGeneration = z.infer< typeof MeleteGeneration >

export const MeleteQuestionState = z.enum( [ 'active', 'dropped', 'retired' ] )
export type MeleteQuestionState = z.infer< typeof MeleteQuestionState >

export const MeleteFsrsState = z.enum( [ 'new', 'learning', 'review', 'relearning' ] )
export type MeleteFsrsState = z.infer< typeof MeleteFsrsState >

const SuggestedRating = z.enum( [ 'again', 'hard', 'good' ] )

export const MeleteSubject = z.object( {
  id: z.uuid(),
  name: z.string(),
  folder: z.string(),
  auto_enroll: z.boolean(),
  new_per_day: z.int().min( 0 ).max( 100 ),
  note_count: z.int().min( 0 ),
  enrolled_count: z.int().min( 0 ),
  due_count: z.int().min( 0 ),
  new_available: z.int().min( 0 ),
  new_remaining_today: z.int().min( 0 ),
} )
export type MeleteSubject = z.infer< typeof MeleteSubject >

export const MeleteNote = z.object( {
  id: z.uuid(),
  subject_id: z.uuid(),
  path: z.string(),
  title: z.string(),
  enrolled: z.boolean(),
  generation: MeleteGeneration,
  generation_error: z.string().nullable(),
  question_count: z.int().min( 0 ),
  stale: z.boolean(),
  missing: z.boolean(),
} )
export type MeleteNote = z.infer< typeof MeleteNote >

export const MeleteQuestion = z.object( {
  id: z.uuid(),
  note_id: z.uuid(),
  position: z.int().min( 1 ),
  prompt: z.string(),
  answer: z.string(),
  passage: z.string(),
  state: MeleteQuestionState,
  fsrs_state: MeleteFsrsState,
  due: z.iso.datetime().nullable(),
  reps: z.int().min( 0 ),
  lapses: z.int().min( 0 ),
  last_review: z.iso.datetime().nullable(),
} )
export type MeleteQuestion = z.infer< typeof MeleteQuestion >

export const MeleteReviewItem = z.object( {
  question: MeleteQuestion,
  note: z.object( {
    id: z.uuid(),
    title: z.string(),
    path: z.string(),
    subject_name: z.string(),
  } ),
  obsidian_url: z.string().nullable(),
} )
export type MeleteReviewItem = z.infer< typeof MeleteReviewItem >

export const MeleteReviewCounts = z.object( {
  due: z.int().min( 0 ),
  new_remaining: z.int().min( 0 ),
  learning_soon: z.int().min( 0 ),
} )
export type MeleteReviewCounts = z.infer< typeof MeleteReviewCounts >

export const MeleteGrade = z.object( {
  verdict: z.enum( [ 'correct', 'partial', 'incorrect' ] ),
  right: z.array( z.string() ).max( 6 ),
  missed: z.array( z.string() ).max( 6 ),
  feedback: z.string().min( 1 ).max( 600 ),
  suggested_rating: SuggestedRating,
} )
export type MeleteGrade = z.infer< typeof MeleteGrade >

export const MeleteQuestionsOutput = z.object( {
  questions: z.array( z.object( {
    prompt: z.string().min( 1 ).max( 500 ),
    answer: z.string().min( 1 ).max( 1500 ),
    passage: z.string().max( 1500 ),
  } ) ).min( 1 ).max( 10 ),
} )
export type MeleteQuestionsOutput = z.infer< typeof MeleteQuestionsOutput >

export const MeleteGradeOutput = MeleteGrade
export type MeleteGradeOutput = MeleteGrade

export const GetMeleteTodayResponse = z.object( {
  learning_root: z.string().nullable(),
  subjects: z.array( MeleteSubject ),
  totals: MeleteReviewCounts,
} )
export type GetMeleteTodayResponse = z.infer< typeof GetMeleteTodayResponse >

export const GetMeleteSubjectResponse = z.object( {
  subject: MeleteSubject,
  notes: z.array( MeleteNote ),
} )
export type GetMeleteSubjectResponse = z.infer< typeof GetMeleteSubjectResponse >

export const UpdateMeleteSubjectBody = z.object( {
  auto_enroll: z.boolean().optional(),
  new_per_day: z.int().min( 0 ).max( 100 ).optional(),
} ).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  { message: 'Provide auto_enroll or new_per_day' },
)
export type UpdateMeleteSubjectBody = z.infer< typeof UpdateMeleteSubjectBody >

export const EnrollSubjectBody = z.object( { enrolled: z.boolean() } )
export type EnrollSubjectBody = z.infer< typeof EnrollSubjectBody >

export const UpdateMeleteNoteBody = z.object( { enrolled: z.boolean() } )
export type UpdateMeleteNoteBody = z.infer< typeof UpdateMeleteNoteBody >

export const GetMeleteNoteResponse = z.object( {
  note: MeleteNote,
  questions: z.array( MeleteQuestion ),
  obsidian_url: z.string().nullable(),
} )
export type GetMeleteNoteResponse = z.infer< typeof GetMeleteNoteResponse >

export const GetNextReviewResponse = z.object( {
  item: MeleteReviewItem.nullable(),
  counts: MeleteReviewCounts,
} )
export type GetNextReviewResponse = z.infer< typeof GetNextReviewResponse >

export const GradeAnswerBody = z.object( { answer: z.string().max( 4000 ) } )
export type GradeAnswerBody = z.infer< typeof GradeAnswerBody >

export const GradeAnswerResponse = z.discriminatedUnion( 'outcome', [
  z.object( { outcome: z.literal( 'graded' ), grade: MeleteGrade, run_id: z.int() } ),
  z.object( { outcome: z.literal( 'skipped' ), reason: z.literal( 'blank' ) } ),
  z.object( {
    outcome: z.literal( 'failed' ),
    reason: z.string(),
    run_id: z.int().nullable(),
  } ),
] )
export type GradeAnswerResponse = z.infer< typeof GradeAnswerResponse >

export const RecordReviewBody = z.object( {
  rating: MeleteRating,
  mode: MeleteReviewMode,
  answer: z.string().max( 4000 ).optional(),
  grade_run_id: z.int().optional(),
  suggested_rating: SuggestedRating.optional(),
} )
export type RecordReviewBody = z.infer< typeof RecordReviewBody >

export const RecordReviewResponse = z.object( {
  question: MeleteQuestion,
  counts: MeleteReviewCounts,
} )
export type RecordReviewResponse = z.infer< typeof RecordReviewResponse >
