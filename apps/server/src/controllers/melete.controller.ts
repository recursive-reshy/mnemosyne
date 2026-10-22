// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  EnrollSubjectBody,
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
  GetNextReviewResponse,
  GradeAnswerBody,
  GradeAnswerResponse,
  MeleteQuestion,
  MeleteSubject,
  RecordReviewBody,
  RecordReviewResponse,
  UpdateMeleteNoteBody,
  UpdateMeleteSubjectBody,
} from '@mnemosyne/shared'
// Services
import {
  dropQuestion,
  getNote,
  getSubject,
  getToday,
  regenerateNote,
  retryGeneration,
  setNoteEnrolled,
  setSubjectEnrolled,
  updateSubject,
} from '../services/melete.service.js'
import { getNextReview, gradeAnswer, recordReview } from '../services/meleteReview.service.js'

const Id = z.uuid()

export const getMeleteToday = async (
  _req: Request,
  res: Response< GetMeleteTodayResponse >,
): Promise< void > => {
  res.status( 200 ).json( await getToday() )
}

export const getMeleteSubject = async (
  { params }: Request,
  res: Response< GetMeleteSubjectResponse >,
): Promise< void > => {
  res.status( 200 ).json( await getSubject( Id.parse( params.id ) ) )
}

export const patchMeleteSubject = (
  { params, body }: Request,
  res: Response< { subject: MeleteSubject } >,
): void => {
  const subject = updateSubject( Id.parse( params.id ), UpdateMeleteSubjectBody.parse( body ) )

  res.status( 200 ).json( { subject } )
}

export const postSubjectEnrollment = async (
  { params, body }: Request,
  res: Response< GetMeleteSubjectResponse >,
): Promise< void > => {
  const { enrolled } = EnrollSubjectBody.parse( body )

  res.status( 200 ).json( await setSubjectEnrolled( Id.parse( params.id ), enrolled ) )
}

export const getMeleteNote = (
  { params }: Request,
  res: Response< GetMeleteNoteResponse >,
): void => {
  res.status( 200 ).json( getNote( Id.parse( params.id ) ) )
}

export const patchMeleteNote = (
  { params, body }: Request,
  res: Response< GetMeleteNoteResponse >,
): void => {
  const { enrolled } = UpdateMeleteNoteBody.parse( body )

  res.status( 200 ).json( setNoteEnrolled( Id.parse( params.id ), enrolled ) )
}

export const postRegenerateNote = (
  { params }: Request,
  res: Response< GetMeleteNoteResponse >,
): void => {
  res.status( 202 ).json( regenerateNote( Id.parse( params.id ) ) )
}

export const postRetryGeneration = (
  { params }: Request,
  res: Response< GetMeleteNoteResponse >,
): void => {
  res.status( 202 ).json( retryGeneration( Id.parse( params.id ) ) )
}

export const postDropQuestion = (
  { params }: Request,
  res: Response< { question: MeleteQuestion } >,
): void => {
  res.status( 200 ).json( { question: dropQuestion( Id.parse( params.id ) ) } )
}

export const getReviewNext = async (
  { query }: Request,
  res: Response< GetNextReviewResponse >,
): Promise< void > => {
  const { subject } = z.object( { subject: Id.optional() } ).parse( query )

  res.status( 200 ).json( await getNextReview( { subjectId: subject } ) )
}

export const postGradeAnswer = async (
  { params, body }: Request,
  res: Response< GradeAnswerResponse >,
): Promise< void > => {
  const grade = await gradeAnswer( Id.parse( params.id ), GradeAnswerBody.parse( body ) )

  res.status( 200 ).json( grade )
}

export const postRecordReview = async (
  { params, body }: Request,
  res: Response< RecordReviewResponse >,
): Promise< void > => {
  const review = await recordReview( Id.parse( params.id ), RecordReviewBody.parse( body ) )

  res.status( 200 ).json( review )
}
