// Express
import { Request, Response } from 'express'
// Shared
import {
  DismissInboxBody,
  ListInboxResponse,
  SummarizeInboxBody,
  SummarizeInboxResponse,
} from '@mnemosyne/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import { dismissItems, listInbox, summarizeItems } from '../services/inbox.service.js'

export const getInbox = ( _req: Request, res: Response< ListInboxResponse > ): void => {
  res.status( 200 ).json( { items: listInbox() } )
}

export const summarizeInbox = async (
  req: Request,
  res: Response< SummarizeInboxResponse >,
): Promise< void > => {
  const body = SummarizeInboxBody.parse( req.body )

  res.status( 200 ).json( await summarizeItems( currentUser( req ).id, body ) )
}

export const dismissInbox = ( { body }: Request, res: Response ): void => {
  dismissItems( DismissInboxBody.parse( body ).items )

  res.status( 204 ).end()
}
