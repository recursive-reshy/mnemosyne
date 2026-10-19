// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import { GetGmailAccountResponse, ListGmailLabelsResponse } from '@mnemosyne/shared'
// Services
import {
  disconnectAccount,
  finishConnect,
  getAccount,
  listLabels,
  startConnect,
} from '../services/gmail.service.js'

const CallbackQuery = z.object( {
  code: z.string().min( 1 ).optional(),
  state: z.string().min( 1 ).optional(),
  error: z.string().min( 1 ).optional(),
} )

export const getGmailAccount = (
  _req: Request,
  res: Response< GetGmailAccountResponse >,
): void => {
  res.status( 200 ).json( { account: getAccount() } )
}

export const connectGmail = ( _req: Request, res: Response ): void => {
  res.redirect( 302, startConnect() )
}

export const gmailCallback = async ( { query }: Request, res: Response ): Promise< void > => {
  const parsed = CallbackQuery.safeParse( query )
  const failure = parsed.success ? await finishConnect( parsed.data ) : 'failed'

  res.redirect(
    302,
    failure === null ? '/settings?gmail=connected' : `/settings?gmail=error&reason=${ failure }`,
  )
}

export const disconnectGmail = async ( _req: Request, res: Response ): Promise< void > => {
  await disconnectAccount()

  res.status( 204 ).end()
}

export const getGmailLabels = async (
  _req: Request,
  res: Response< ListGmailLabelsResponse >,
): Promise< void > => {
  res.status( 200 ).json( { labels: await listLabels() } )
}
