// Packages
import {
  describe,
  it,
  expect,
  vi,
  afterEach,
} from 'vitest'
import request from 'supertest'
import express, {
  Express,
  NextFunction,
  Request,
  Response,
} from 'express'
import { z } from 'zod'
// Errors
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  errorMiddleware,
  notFoundHandler,
} from './errors.js'

function buildApp(): Express {
  const testApp: Express = express()

  testApp.get( '/validation', () => {
    throw new ValidationError( 'Bad url' )
  } )
  testApp.get( '/not-found', () => {
    throw new NotFoundError( 'Job not found' )
  } )
  testApp.get( '/conflict', () => {
    throw new ConflictError( 'Job not done' )
  } )
  testApp.get( '/zod', () => {
    z.object( { url: z.string() } ).parse( { url: 42 } )
  } )
  testApp.get( '/boom', () => {
    throw new Error( 'boom' )
  } )
  testApp.get( '/async', async () => {
    await Promise.reject( new NotFoundError( 'Job not found' ) )
  } )

  testApp.use( '/api', notFoundHandler )
  testApp.use( errorMiddleware )

  return testApp
}

afterEach( () => {
  vi.restoreAllMocks()
} )

describe( 'errorMiddleware', () => {
  it( 'maps ValidationError to 400', async () => {
    const response = await request( buildApp() ).get( '/validation' )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Bad url' } )
  } )

  it( 'maps NotFoundError to 404', async () => {
    const response = await request( buildApp() ).get( '/not-found' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Job not found' } )
  } )

  it( 'maps ConflictError to 409', async () => {
    const response = await request( buildApp() ).get( '/conflict' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Job not done' } )
  } )

  it( 'maps ZodError to 400 with its issues', async () => {
    const response = await request( buildApp() ).get( '/zod' )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( {
      error: 'Invalid request',
      issues: [ expect.objectContaining( { code: 'invalid_type', path: [ 'url' ] } ) ],
    } )
  } )

  it( 'logs an unexpected error and responds with a generic 500', async () => {
    const consoleError = vi.spyOn( console, 'error' ).mockImplementation( () => {} )

    const response = await request( buildApp() ).get( '/boom' )

    expect( response.status ).toBe( 500 )
    expect( response.body ).toEqual( { error: 'Internal Server Error' } )
    expect( response.text ).not.toContain( 'boom' )
    expect( consoleError ).toHaveBeenCalledWith( expect.objectContaining( { message: 'boom' } ) )
  } )

  it( 'forwards a rejected async handler to the middleware', async () => {
    const response = await request( buildApp() ).get( '/async' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Job not found' } )
  } )

  it( 'passes the error to next when headers were already sent', () => {
    const error = new Error( 'late failure' )
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() }
    const next = vi.fn()

    errorMiddleware( error, {} as Request, res as unknown as Response, next as NextFunction )

    expect( next ).toHaveBeenCalledWith( error )
    expect( res.status ).not.toHaveBeenCalled()
    expect( res.json ).not.toHaveBeenCalled()
  } )
} )
