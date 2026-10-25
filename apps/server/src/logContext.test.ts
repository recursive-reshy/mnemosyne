// Packages
import { describe, it, expect } from 'vitest'
// Logging
import { getLogContext, withLogContext } from './logContext.js'

describe( 'withLogContext', () => {
  it( 'carries the user ID', () => {
    const seen = withLogContext( { user_id: 'u1' }, () => getLogContext() )

    expect( seen ).toEqual( { user_id: 'u1' } )
  } )

  it( 'has no context outside a call', () => {
    expect( getLogContext() ).toBeUndefined()
  } )

  it( 'exposes the context to the function and what it calls', async () => {
    const seen = await withLogContext( { job_id: 'j1' }, async () => {
      await Promise.resolve()

      return getLogContext()
    } )

    expect( seen ).toEqual( { job_id: 'j1' } )
  } )

  it( 'returns what the function returns and clears the context afterwards', () => {
    expect( withLogContext( { feed_id: 'f1' }, () => 42 ) ).toBe( 42 )
    expect( getLogContext() ).toBeUndefined()
  } )

  it( 'merges a nested context over the outer one', () => {
    const seen = withLogContext( { job_id: 'j1' }, () => {
      return withLogContext( { feed_id: 'f1' }, () => getLogContext() )
    } )

    expect( seen ).toEqual( { job_id: 'j1', feed_id: 'f1' } )
  } )

  it( 'keeps concurrent runs apart', async () => {
    const run = ( id: string, wait: number ): Promise< string | undefined > => {
      return withLogContext( { gmail_source_id: id }, async () => {
        await new Promise( ( resolve ) => setTimeout( resolve, wait ) )

        return getLogContext()?.gmail_source_id
      } )
    }

    expect( await Promise.all( [ run( 'a', 20 ), run( 'b', 1 ) ] ) ).toEqual( [ 'a', 'b' ] )
  } )
} )
