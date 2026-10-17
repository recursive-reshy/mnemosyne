// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  CreatePromptProfileBody,
  ListPromptProfilesResponse,
  ListPromptVersionsResponse,
  PromptProfileResponse,
  RenamePromptProfileBody,
  SavePromptVersionBody,
} from '@mnemosyne/shared'
// Services
import {
  createProfile,
  deleteProfile,
  listProfiles,
  listVersions,
  renameProfile,
  resetProfile,
  restoreVersion,
  saveVersion,
} from '../services/prompts.service.js'

const VersionId = z.coerce.number().int().positive()

export const getProfiles = ( _req: Request, res: Response< ListPromptProfilesResponse > ): void => {
  res.status( 200 ).json( { profiles: listProfiles() } )
}

export const postProfile = (
  { body }: Request,
  res: Response< PromptProfileResponse >,
): void => {
  const profile = createProfile( CreatePromptProfileBody.parse( body ) )

  res.status( 201 ).json( { profile } )
}

export const patchProfile = (
  { params, body }: Request,
  res: Response< PromptProfileResponse >,
): void => {
  const { name } = RenamePromptProfileBody.parse( body )

  res.status( 200 ).json( { profile: renameProfile( String( params.id ), name ) } )
}

export const removeProfile = ( { params }: Request, res: Response ): void => {
  deleteProfile( String( params.id ) )

  res.status( 204 ).end()
}

export const getVersions = (
  { params }: Request,
  res: Response< ListPromptVersionsResponse >,
): void => {
  res.status( 200 ).json( { versions: listVersions( String( params.id ) ) } )
}

export const postVersion = (
  { params, body }: Request,
  res: Response< PromptProfileResponse >,
): void => {
  const { guidance } = SavePromptVersionBody.parse( body )

  res.status( 200 ).json( { profile: saveVersion( String( params.id ), guidance ) } )
}

export const postRestore = (
  { params }: Request,
  res: Response< PromptProfileResponse >,
): void => {
  const versionId = VersionId.parse( params.versionId )

  res.status( 200 ).json( { profile: restoreVersion( String( params.id ), versionId ) } )
}

export const postReset = ( { params }: Request, res: Response< PromptProfileResponse > ): void => {
  res.status( 200 ).json( { profile: resetProfile( String( params.id ) ) } )
}
