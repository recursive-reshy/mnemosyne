// Packages
import { z } from 'zod'

export const Segment = z
  .object( {
    start: z.number().min( 0 ),
    end: z.number().min( 0 ),
    text: z.string(),
  } )
  .refine( ( { start, end } ) => end >= start, {
    message: 'end must be greater than or equal to start',
    path: [ 'end' ],
  } )
export type Segment = z.infer< typeof Segment >

export const TranscriptMeta = z.object( {
  title: z.string().min( 1 ),
  source: z.url(),
  channel: z.string(),
  duration_seconds: z.number().int().min( 0 ),
  transcribed_at: z.iso.datetime(),
  model: z.string().min( 1 ),
} )
export type TranscriptMeta = z.infer< typeof TranscriptMeta >

export const Transcript = z.object( {
  meta: TranscriptMeta,
  segments: z.array( Segment ),
} )
export type Transcript = z.infer< typeof Transcript >
