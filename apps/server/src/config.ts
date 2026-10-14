// Node
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import { z } from 'zod'

const emptyAsUnset = ( value: unknown ): unknown => ( value === '' ? undefined : value )

const defaultWorkDir = join( tmpdir(), 'mnemosyne' )
const portSchema = z.coerce.number().int().min( 1 ).max( 65535 ).default( 3100 )

const EnvSchema = z
  .object( {
    PORT: z.preprocess( emptyAsUnset, portSchema ),
    WHISPER_URL: z.preprocess( emptyAsUnset, z.url().default( 'http://localhost:8178' ) ),
    WORK_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).default( defaultWorkDir ) ),
  } )
  .transform( ( env ) => ( {
    port: env.PORT,
    whisperUrl: env.WHISPER_URL,
    workDir: env.WORK_DIR,
  } ) )

export type Config = z.infer< typeof EnvSchema >

export function loadConfig( env: NodeJS.ProcessEnv ): Config {
  const result = EnvSchema.safeParse( env )

  if( !result.success ) {
    throw new Error( `Invalid environment:\n${ z.prettifyError( result.error ) }` )
  }

  return result.data
}

export const config: Config = loadConfig( process.env )
