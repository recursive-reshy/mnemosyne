// Packages
import { z } from 'zod'
// Agent
import { SuggestionKind } from './agent.js'
// Job
import { Job } from './job.js'

export const LinkSuggestionStatus = z.enum( [ 'pending', 'accepted', 'rejected', 'superseded' ] )
export type LinkSuggestionStatus = z.infer< typeof LinkSuggestionStatus >

export const StoredLinkSuggestion = z.object( {
  id: z.uuid(),
  job_id: z.uuid(),
  position: z.int().min( 0 ),
  target: z.string().min( 1 ),
  kind: SuggestionKind,
  anchor: z.string().nullable(),
  reason: z.string().min( 1 ),
  status: LinkSuggestionStatus,
  decided_at: z.iso.datetime().nullable(),
} )
export type StoredLinkSuggestion = z.infer< typeof StoredLinkSuggestion >

export const ListLinkSuggestionsResponse = z.object( {
  suggestions: z.array( StoredLinkSuggestion ),
} )
export type ListLinkSuggestionsResponse = z.infer< typeof ListLinkSuggestionsResponse >

export const AcceptLinkSuggestionsBody = z.object( {
  ids: z.array( z.uuid() ).min( 1 ).max( 50 ),
  note_markdown: z.string(),
} )
export type AcceptLinkSuggestionsBody = z.infer< typeof AcceptLinkSuggestionsBody >

export const RejectLinkSuggestionsBody = z.object( {
  ids: z.array( z.uuid() ).min( 1 ).max( 50 ),
} )
export type RejectLinkSuggestionsBody = z.infer< typeof RejectLinkSuggestionsBody >

export const RunLinkingBody = z.object( {
  note_markdown: z.string().optional(),
} )
export type RunLinkingBody = z.infer< typeof RunLinkingBody >

export const LinkSuggestionsResponse = z.object( {
  job: Job,
  suggestions: z.array( StoredLinkSuggestion ),
} )
export type LinkSuggestionsResponse = z.infer< typeof LinkSuggestionsResponse >
