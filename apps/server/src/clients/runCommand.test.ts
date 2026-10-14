// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
import { execFile } from 'node:child_process'
// Clients
import { runCommand } from './runCommand.js'

vi.mock( 'node:child_process' )

type Callback = ( error: Error | null, stdout: string, stderr: string ) => void

function mockExecFile( error: Error | null, stdout: string = '', stderr: string = '' ): void {
  vi.mocked( execFile ).mockImplementation( ( ( ...params: unknown[] ) => {
    const callback = params[ params.length - 1 ] as Callback

    callback( error, stdout, stderr )
  } ) as unknown as typeof execFile )
}

function failure( properties: Record< string, unknown > ): Error {
  return Object.assign( new Error( 'Command failed' ), properties )
}

beforeEach( () => {
  vi.mocked( execFile ).mockReset()
} )

describe( 'runCommand', () => {
  it( 'resolves with stdout and stderr', async () => {
    mockExecFile( null, 'out', 'err' )

    const result = await runCommand( 'tool', [ 'a' ], 1000 )

    expect( result ).toEqual( { stdout: 'out', stderr: 'err' } )
  } )

  it( 'passes the command and args array straight through with the timeout', async () => {
    mockExecFile( null )

    await runCommand( 'tool', [ '--flag', 'value' ], 1500 )

    const [ command, args, options ] = vi.mocked( execFile ).mock.calls[ 0 ] as unknown as [
      string,
      string[],
      Record< string, unknown >,
    ]
    expect( command ).toBe( 'tool' )
    expect( args ).toEqual( [ '--flag', 'value' ] )
    expect( options ).toEqual( { timeout: 1500, maxBuffer: 10 * 1024 * 1024 } )
  } )

  it( 'does not alter arguments containing spaces, quotes or semicolons', async () => {
    mockExecFile( null )
    const tricky = [ 'a b', '"quoted"', 'x; rm -rf /', '$(id)' ]

    await runCommand( 'tool', tricky, 1000 )

    const args = vi.mocked( execFile ).mock.calls[ 0 ]?.[ 1 ]
    expect( args ).toEqual( tricky )
  } )

  it( 'reports a missing command', async () => {
    mockExecFile( failure( { code: 'ENOENT' } ) )

    await expect( runCommand( 'tool', [], 1000 ) ).rejects.toThrow(
      new Error( 'tool is not installed or not on the PATH' ),
    )
  } )

  it( 'reports a timeout', async () => {
    mockExecFile( failure( { killed: true, signal: 'SIGTERM', code: null } ) )

    await expect( runCommand( 'tool', [], 5000 ) ).rejects.toThrow(
      new Error( 'tool timed out after 5 seconds' ),
    )
  } )

  it( 'reports the last non-empty stderr line on a non-zero exit', async () => {
    mockExecFile( failure( { code: 1 } ), '', 'first\nERROR: boom \n\n' )

    await expect( runCommand( 'tool', [], 1000 ) ).rejects.toThrow(
      new Error( 'tool failed: ERROR: boom' ),
    )
  } )

  it( 'reports the exit code when stderr is empty', async () => {
    mockExecFile( failure( { code: 2 } ), '', '  \n' )

    await expect( runCommand( 'tool', [], 1000 ) ).rejects.toThrow(
      new Error( 'tool failed with exit code 2' ),
    )
  } )
} )
