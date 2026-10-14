// Express
import { NextFunction, Request, Response } from 'express'
// Packages
import { ZodError } from 'zod'

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

export function notFoundHandler( _req: Request, res: Response ): void {
  res.status( 404 ).json( { error: 'Not Found' } )
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
    res.status( 400 ).json( { error: error.message } )
  } else if( error instanceof NotFoundError ) {
    res.status( 404 ).json( { error: error.message } )
  } else if( error instanceof ConflictError ) {
    res.status( 409 ).json( { error: error.message } )
  } else if( error instanceof ZodError ) {
    res.status( 400 ).json( { error: 'Invalid request', issues: error.issues } )
  } else {
    console.error( error )
    res.status( 500 ).json( { error: 'Internal Server Error' } )
  }
}
