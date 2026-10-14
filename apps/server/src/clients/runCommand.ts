// Packages
import { execFile } from 'node:child_process'

const MAX_BUFFER_BYTES = 10 * 1024 * 1024

function describeFailure(
  command: string,
  error: Error,
  stderr: string,
  timeoutMs: number,
): Error {
  const { code, killed } = error as { code?: unknown, killed?: boolean }

  if( code === 'ENOENT' ) {
    return new Error( `${ command } is not installed or not on the PATH` )
  }

  if( killed === true ) {
    return new Error( `${ command } timed out after ${ timeoutMs / 1000 } seconds` )
  }

  const lastLine = stderr
    .split( '\n' )
    .map( ( line ) => line.trim() )
    .filter( ( line ) => line !== '' )
    .at( -1 )

  if( lastLine !== undefined ) {
    return new Error( `${ command } failed: ${ lastLine }` )
  }

  return new Error( `${ command } failed with exit code ${ String( code ) }` )
}

export function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise< { stdout: string, stderr: string } > {
  return new Promise( ( resolve, reject ) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: MAX_BUFFER_BYTES },
      ( error, stdout, stderr ) => {
        if( error !== null ) {
          reject( describeFailure( command, error, stderr, timeoutMs ) )

          return
        }

        resolve( { stdout, stderr } )
      },
    )
  } )
}
