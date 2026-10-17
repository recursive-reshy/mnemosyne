// Express
import { Router } from 'express'
// Controllers
import {
  getProfiles,
  getVersions,
  patchProfile,
  postProfile,
  postReset,
  postRestore,
  postVersion,
  removeProfile,
} from '../controllers/promptProfiles.controller.js'

export const promptProfilesRoutes: Router = Router()

promptProfilesRoutes.get( '/prompt-profiles', getProfiles )
promptProfilesRoutes.post( '/prompt-profiles', postProfile )
promptProfilesRoutes.patch( '/prompt-profiles/:id', patchProfile )
promptProfilesRoutes.delete( '/prompt-profiles/:id', removeProfile )
promptProfilesRoutes.get( '/prompt-profiles/:id/versions', getVersions )
promptProfilesRoutes.post( '/prompt-profiles/:id/versions', postVersion )
promptProfilesRoutes.post( '/prompt-profiles/:id/versions/:versionId/restore', postRestore )
promptProfilesRoutes.post( '/prompt-profiles/:id/reset', postReset )
