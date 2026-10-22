// Packages
import { z } from 'zod'

export const HealthKind = z.enum( [
  'feed',
  'gmail_source',
  'gmail_connection',
  'agent',
  'whisper',
  'backup',
] )
export type HealthKind = z.infer< typeof HealthKind >

export const HealthState = z.enum( [ 'ok', 'failing', 'off' ] )
export type HealthState = z.infer< typeof HealthState >

// Singleton subjects (gmail_connection, agent, whisper, backup) use the id "default".
export const StatusRow = z.object( {
  kind: HealthKind,
  id: z.string().min( 1 ),
  name: z.string().min( 1 ),
  state: HealthState,
  last_checked_at: z.iso.datetime().nullable(),
  last_success_at: z.iso.datetime().nullable(),
  last_error: z.string().nullable(),
  failing_since: z.iso.datetime().nullable(),
  detail: z.string().nullable(),
} )
export type StatusRow = z.infer< typeof StatusRow >

export const GetStatusResponse = z.object( {
  rows: z.array( StatusRow ),
  failing_count: z.number().int().nonnegative(),
} )
export type GetStatusResponse = z.infer< typeof GetStatusResponse >

export const HealthError = z.object( {
  at: z.iso.datetime(),
  message: z.string(),
} )
export type HealthError = z.infer< typeof HealthError >

export const GetHealthErrorsResponse = z.object( {
  errors: z.array( HealthError ),
} )
export type GetHealthErrorsResponse = z.infer< typeof GetHealthErrorsResponse >

export const BackupResult = z.object( {
  file: z.string().min( 1 ),
  bytes: z.number().int().nonnegative(),
  at: z.iso.datetime(),
} )
export type BackupResult = z.infer< typeof BackupResult >
