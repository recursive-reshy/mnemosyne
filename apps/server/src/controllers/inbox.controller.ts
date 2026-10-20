// Express
import { Request, Response } from 'express'
// Shared
import {
  DismissInboxBody,
  ListInboxResponse,
  SummarizeInboxBody,
  SummarizeInboxResponse,
} from '@mnemosyne/shared'
// Services
import { dismissItems, listInbox, summarizeItems } from '../services/inbox.service.js'

export const getInbox = ( _req: Request, res: Response< ListInboxResponse > ): void => {
  res.status( 200 ).json( { items: listInbox() } )
}

export const summarizeInbox = async (
  { body }: Request,
  res: Response< SummarizeInboxResponse >,
): Promise< void > => {
  res.status( 200 ).json( await summarizeItems( SummarizeInboxBody.parse( body ) ) )
}

export const dismissInbox = ( { body }: Request, res: Response ): void => {
  dismissItems( DismissInboxBody.parse( body ).items )

  res.status( 204 ).end()
}
