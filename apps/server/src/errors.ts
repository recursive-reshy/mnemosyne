// Express
import { NextFunction, Request, Response } from 'express'
// Packages
import { ZodError } from 'zod'
// Shared
import { ErrorResponse } from '@mnemosyne/shared'

export class ValidationError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'ConflictError'
  }
}

export class UnprocessableError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'UnprocessableError'
  }
}

export class BadGatewayError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'BadGatewayError'
  }
}

const sendError = ( res: Response, status: number, body: ErrorResponse ): void => {
  res.status( status ).json( body )
}

const isTooLarge = ( error: unknown ): boolean => {
  return typeof error === 'object'
    && error !== null
    && 'type' in error
    && error.type === 'entity.too.large'
}

const isJsonParseFailure = ( error: unknown ): boolean => {
  return typeof error === 'object'
    && error !== null
    && 'type' in error
    && error.type === 'entity.parse.failed'
}

export const notFoundHandler = ( _req: Request, res: Response ): void => {
  sendError( res, 404, { error: 'Not Found' } )
}

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if( res.headersSent ) {
    next( error )
    return
  }

  if( error instanceof ValidationError ) {
    sendError( res, 400, { error: error.message } )
  } else if( error instanceof NotFoundError ) {
    sendError( res, 404, { error: error.message } )
  } else if( error instanceof ConflictError ) {
    sendError( res, 409, { error: error.message } )
  } else if( error instanceof UnprocessableError ) {
    sendError( res, 422, { error: error.message } )
  } else if( error instanceof BadGatewayError ) {
    sendError( res, 502, { error: error.message } )
  } else if( isTooLarge( error ) ) {
    sendError( res, 413, { error: 'Request body is too large' } )
  } else if( isJsonParseFailure( error ) ) {
    sendError( res, 400, { error: 'Invalid JSON' } )
  } else if( error instanceof ZodError ) {
    sendError( res, 400, { error: 'Invalid request', issues: error.issues } )
  } else {
    console.error( error )
    sendError( res, 500, { error: 'Internal Server Error' } )
  }
}
