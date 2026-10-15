// Node
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import { z } from 'zod'

const emptyAsUnset = ( value: unknown ): unknown => ( value === '' ? undefined : value )

const defaultWorkDir = join( tmpdir(), 'mnemosyne' )
const defaultDataDir = join( tmpdir(), 'mnemosyne-data' )
const portSchema = z.coerce.number().int().min( 1 ).max( 65535 ).default( 3100 )
const summaryTimeoutSchema = z.coerce.number().int().positive().default( 300_000 )
const reviewTtlSchema = z.coerce.number().positive().default( 24 )

const EnvSchema = z
  .object( {
    PORT: z.preprocess( emptyAsUnset, portSchema ),
    WHISPER_URL: z.preprocess( emptyAsUnset, z.url().default( 'http://localhost:8178' ) ),
    WORK_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).default( defaultWorkDir ) ),
    DATA_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).default( defaultDataDir ) ),
    WHISPER_MODEL: z.preprocess( emptyAsUnset, z.string().min( 1 ).default( 'large-v3-turbo' ) ),
    WEB_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).optional() ),
    ANTHROPIC_API_KEY: z.string().min( 1 ),
    VAULT_PATH: z.string().min( 1 ),
    SUMMARY_TIMEOUT_MS: z.preprocess( emptyAsUnset, summaryTimeoutSchema ),
    REVIEW_TTL_HOURS: z.preprocess( emptyAsUnset, reviewTtlSchema ),
  } )
  .transform( ( env ) => ( {
    port: env.PORT,
    whisperUrl: env.WHISPER_URL,
    workDir: env.WORK_DIR,
    dataDir: env.DATA_DIR,
    whisperModel: env.WHISPER_MODEL,
    webDir: env.WEB_DIR,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    vaultPath: env.VAULT_PATH,
    summaryTimeoutMs: env.SUMMARY_TIMEOUT_MS,
    reviewTtlHours: env.REVIEW_TTL_HOURS,
  } ) )

export type Config = z.infer< typeof EnvSchema >

export const loadConfig = ( env: NodeJS.ProcessEnv ): Config => {
  const result = EnvSchema.safeParse( env )

  if( !result.success ) {
    throw new Error( `Invalid environment:\n${ z.prettifyError( result.error ) }` )
  }

  return result.data
}

const loadConfigOrExit = ( env: NodeJS.ProcessEnv ): Config => {
  try {
    return loadConfig( env )
  } catch( error ) {
    console.error( error instanceof Error ? error.message : error )
    return process.exit( 1 )
  }
}

export const config: Config = loadConfigOrExit( process.env )
