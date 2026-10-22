// Express
import { Router } from 'express'
// Controllers
import {
  getMeleteNote,
  getMeleteSubject,
  getMeleteToday,
  patchMeleteNote,
  patchMeleteSubject,
  postDropQuestion,
  postRegenerateNote,
  postRetryGeneration,
  postSubjectEnrollment,
} from '../controllers/melete.controller.js'

export const meleteRoutes: Router = Router()

meleteRoutes.get( '/melete/today', getMeleteToday )
meleteRoutes.get( '/melete/subjects/:id', getMeleteSubject )
meleteRoutes.patch( '/melete/subjects/:id', patchMeleteSubject )
meleteRoutes.post( '/melete/subjects/:id/enrollment', postSubjectEnrollment )
meleteRoutes.get( '/melete/notes/:id', getMeleteNote )
meleteRoutes.patch( '/melete/notes/:id', patchMeleteNote )
meleteRoutes.post( '/melete/notes/:id/regenerate', postRegenerateNote )
meleteRoutes.post( '/melete/notes/:id/retry', postRetryGeneration )
meleteRoutes.post( '/melete/questions/:id/drop', postDropQuestion )
