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
  MeleteQuestion,
  MeleteSubject,
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
