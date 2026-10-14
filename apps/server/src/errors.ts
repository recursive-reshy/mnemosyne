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

function sendError( res: Response, status: number, body: ErrorResponse ): void {
  res.status( status ).json( body )
}

export function notFoundHandler( _req: Request, res: Response ): void {
  sendError( res, 404, { error: 'Not Found' } )
}

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
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
  } else if( error instanceof ZodError ) {
    sendError( res, 400, { error: 'Invalid request', issues: error.issues } )
  } else {
    console.error( error )
    sendError( res, 500, { error: 'Internal Server Error' } )
  }
}
