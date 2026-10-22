// Node
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import { z } from 'zod'
// Shared
import { isValidFolderName } from '@mnemosyne/shared'

const emptyAsUnset = ( value: unknown ): unknown => ( value === '' ? undefined : value )

const defaultWorkDir = join( tmpdir(), 'mnemosyne' )
const defaultDataDir = join( tmpdir(), 'mnemosyne-data' )
const portSchema = z.coerce.number().int().min( 1 ).max( 65535 ).default( 3100 )
const summaryTimeoutSchema = z.coerce.number().int().positive().default( 300_000 )
const reviewTtlSchema = z.coerce.number().positive().default( 24 )
const cleanupIntervalSchema = z.coerce.number().positive().default( 15 )
const statusIntervalSchema = z.coerce.number().positive().default( 2 )
const logLevelSchema = z
  .enum( [ 'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent' ] )
  .default( 'info' )
const agentTimeoutSchema = z.coerce.number().int().positive().default( 120_000 )

const isFolderPath = ( value: string ): boolean => {
  return value.split( '/' ).every( isValidFolderName )
}

const noteFolderSchema = z
  .string()
  .refine( isFolderPath, 'must be a folder path inside the vault, like Notes/Videos' )
  .default( 'Mnemosyne' )

const KEY_MESSAGE = 'TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)'

const isKey = ( value: string ): boolean => {
  return /^[A-Za-z0-9+/]+={0,2}$/.test( value ) && Buffer.from( value, 'base64' ).length === 32
}

const encryptionKeySchema = z
  .string()
  .refine( isKey, KEY_MESSAGE )
  .transform( ( value ) => Buffer.from( value, 'base64' ) )

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
    DEFAULT_NOTE_FOLDER: z.preprocess( emptyAsUnset, noteFolderSchema ),
    LOG_LEVEL: z.preprocess( emptyAsUnset, logLevelSchema ),
    SUMMARY_TIMEOUT_MS: z.preprocess( emptyAsUnset, summaryTimeoutSchema ),
    REVIEW_TTL_HOURS: z.preprocess( emptyAsUnset, reviewTtlSchema ),
    CLEANUP_INTERVAL_MINUTES: z.preprocess( emptyAsUnset, cleanupIntervalSchema ),
    STATUS_CHECK_INTERVAL_MINUTES: z.preprocess( emptyAsUnset, statusIntervalSchema ),
    GOOGLE_CLIENT_ID: z.preprocess( emptyAsUnset, z.string().min( 1 ).optional() ),
    GOOGLE_CLIENT_SECRET: z.preprocess( emptyAsUnset, z.string().min( 1 ).optional() ),
    GOOGLE_REDIRECT_URI: z.preprocess( emptyAsUnset, z.url().optional() ),
    TOKEN_ENCRYPTION_KEY: z.preprocess( emptyAsUnset, encryptionKeySchema.optional() ),
    AGENT_URL: z.preprocess( emptyAsUnset, z.url().default( 'http://localhost:8100' ) ),
    AGENT_SECRET: z.preprocess( emptyAsUnset, z.string().min( 32 ).optional() ),
    AGENT_TIMEOUT_MS: z.preprocess( emptyAsUnset, agentTimeoutSchema ),
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
    defaultNoteFolder: env.DEFAULT_NOTE_FOLDER,
    summaryTimeoutMs: env.SUMMARY_TIMEOUT_MS,
    reviewTtlHours: env.REVIEW_TTL_HOURS,
    cleanupIntervalMinutes: env.CLEANUP_INTERVAL_MINUTES,
    statusCheckIntervalMinutes: env.STATUS_CHECK_INTERVAL_MINUTES,
    logLevel: env.LOG_LEVEL,
    gmail: env.GOOGLE_CLIENT_ID !== undefined
      && env.GOOGLE_CLIENT_SECRET !== undefined
      && env.TOKEN_ENCRYPTION_KEY !== undefined
      ? {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.GOOGLE_REDIRECT_URI
          ?? `http://localhost:${ env.PORT }/api/gmail/oauth/callback`,
        encryptionKey: env.TOKEN_ENCRYPTION_KEY,
      }
      : null,
    agent: env.AGENT_SECRET === undefined
      ? null
      : { url: env.AGENT_URL, secret: env.AGENT_SECRET, timeoutMs: env.AGENT_TIMEOUT_MS },
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
    // eslint-disable-next-line no-console -- runs before the logger, which needs the config
    console.error( error instanceof Error ? error.message : error )
    return process.exit( 1 )
  }
}

export const config: Config = loadConfigOrExit( process.env )
