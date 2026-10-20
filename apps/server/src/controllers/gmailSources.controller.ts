// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  CreateGmailSourceBody,
  GmailSourceResponse,
  ListGmailSourcesResponse,
  PreviewGmailSourceBody,
  PreviewGmailSourceResponse,
  UpdateGmailSourceBody,
} from '@mnemosyne/shared'
// Services
import {
  checkAllSources,
  checkSource,
  createSource,
  deleteSource,
  listGmailSources,
  previewSource,
  updateSource,
} from '../services/gmailSources.service.js'

const SourceId = z.uuid()

const DeleteQuery = z.object( {
  remove_inbox_items: z.enum( [ 'true', 'false' ] ).default( 'false' ),
} )

export const getGmailSources = async (
  _req: Request,
  res: Response< ListGmailSourcesResponse >,
): Promise< void > => {
  res.status( 200 ).json( { sources: await listGmailSources() } )
}

export const previewGmailSource = async (
  { body }: Request,
  res: Response< PreviewGmailSourceResponse >,
): Promise< void > => {
  const { match } = PreviewGmailSourceBody.parse( body )

  res.status( 200 ).json( await previewSource( match ) )
}

export const addGmailSource = async (
  { body }: Request,
  res: Response< GmailSourceResponse >,
): Promise< void > => {
  const source = await createSource( CreateGmailSourceBody.parse( body ) )

  res.status( 201 ).json( { source } )
}

export const patchGmailSource = async (
  { params, body }: Request,
  res: Response< GmailSourceResponse >,
): Promise< void > => {
  const source = await updateSource(
    SourceId.parse( params.id ),
    UpdateGmailSourceBody.parse( body ),
  )

  res.status( 200 ).json( { source } )
}

export const removeGmailSource = ( { params, query }: Request, res: Response ): void => {
  const { remove_inbox_items } = DeleteQuery.parse( query )

  deleteSource(
    SourceId.parse( params.id ),
    { removeInboxItems: remove_inbox_items === 'true' },
  )

  res.status( 204 ).end()
}

export const checkOneGmailSource = async (
  { params }: Request,
  res: Response< GmailSourceResponse >,
): Promise< void > => {
  res.status( 200 ).json( { source: await checkSource( SourceId.parse( params.id ) ) } )
}

export const checkEveryGmailSource = async (
  _req: Request,
  res: Response< ListGmailSourcesResponse >,
): Promise< void > => {
  res.status( 200 ).json( { sources: await checkAllSources() } )
}
