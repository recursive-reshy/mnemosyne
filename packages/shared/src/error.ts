// Packages
import { z } from 'zod'

export const ErrorResponse = z.object( {
  error: z.string(),
  issues: z.array( z.unknown() ).optional(),
} )
export type ErrorResponse = z.infer< typeof ErrorResponse >
