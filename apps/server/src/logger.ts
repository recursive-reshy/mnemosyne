// Packages
import { pino } from 'pino'
import type { DestinationStream } from 'pino'
// Config
import { config } from './config.js'
// Logging
import { getLogContext } from './logContext.js'

const REDACTED_KEYS = [
  'authorization',
  'token',
  'refresh_token',
  'access_token',
  'apiKey',
  'api_key',
  'secret',
]

export const createLogger = (
  destination?: DestinationStream,
  level: string = config.logLevel,
): pino.Logger => pino( {
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: ( label ) => ( { level: label } ),
  },
  base: { service: 'server' },
  mixin: () => ( { ...getLogContext() } ),
  redact: {
    paths: REDACTED_KEYS.map( ( key ) => `*.${ key }` ),
    censor: '[redacted]',
  },
}, destination )

export const logger = createLogger()
