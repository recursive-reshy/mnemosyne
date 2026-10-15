// Node
import { spawn } from 'node:child_process'
import { join } from 'node:path'
// Packages
import { describe, it, expect } from 'vitest'

const tsxBin = join( import.meta.dirname, '..', 'node_modules', '.bin', 'tsx' )

interface RunResult {
  code: number | null
  stderr: string
  timedOut: boolean
}

const runServer = ( env: Record< string, string > ): Promise< RunResult > => {
  return new Promise( ( resolve ) => {
    const child = spawn( tsxBin, [ '--conditions=development', 'src/server.ts' ], {
      cwd: join( import.meta.dirname, '..' ),
      env: { ...process.env, ...env },
    } )
    let stderr = ''
    let timedOut = false

    const timer = setTimeout( () => {
      timedOut = true
      child.kill( 'SIGKILL' )
    }, 10_000 )

    child.stderr.on( 'data', ( chunk: Buffer ) => {
      stderr += chunk.toString()
    } )
    child.on( 'close', ( code ) => {
      clearTimeout( timer )
      resolve( { code, stderr, timedOut } )
    } )
  } )
}

describe( 'server startup with an invalid environment', () => {
  it( 'prints only the Invalid environment message and exits 1', async () => {
    const { code, stderr, timedOut } = await runServer( { PORT: 'abc' } )

    expect( timedOut ).toBe( false )
    expect( code ).toBe( 1 )
    expect( stderr.startsWith( 'Invalid environment:' ) ).toBe( true )
    expect( stderr ).toContain( 'PORT' )
    expect( stderr ).not.toMatch( /^ {4}at /m )
  }, 15_000 )
} )
