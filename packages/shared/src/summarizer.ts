// Packages
import { z } from 'zod'

export const ModelOption = z.object( {
  id: z.string().min( 1 ),
  display_name: z.string().min( 1 ),
} )
export type ModelOption = z.infer< typeof ModelOption >

export const ListModelsResponse = z.object( {
  models: z.array( ModelOption ),
  source: z.enum( [ 'api', 'fallback' ] ),
} )
export type ListModelsResponse = z.infer< typeof ListModelsResponse >

export const FeedCheckInterval = z.union( [
  z.literal( 15 ),
  z.literal( 30 ),
  z.literal( 60 ),
  z.literal( 180 ),
  z.literal( 360 ),
  z.literal( 1440 ),
] )
export type FeedCheckInterval = z.infer< typeof FeedCheckInterval >

export const Settings = z.object( {
  default_model: z.string().min( 1 ),
  extraction_model: z.string().min( 1 ),
  default_profile_id: z.uuid(),
  feed_check_interval_minutes: FeedCheckInterval,
  linking_enabled: z.boolean(),
  linking_model: z.string().min( 1 ),
  linker_profile_id: z.uuid(),
} )
export type Settings = z.infer< typeof Settings >

export const AgentStatus = z.enum( [ 'ok', 'unavailable', 'not_configured' ] )
export type AgentStatus = z.infer< typeof AgentStatus >

export const GetSettingsResponse = z.object( {
  settings: Settings,
  locked_instructions: z.object( {
    video: z.string(),
    article: z.string(),
  } ),
  linker_locked_instructions: z.string().nullable(),
  agent_status: AgentStatus,
} )
export type GetSettingsResponse = z.infer< typeof GetSettingsResponse >

export const UpdateSettingsBody = z.object( {
  default_model: z.string().min( 1 ).optional(),
  extraction_model: z.string().min( 1 ).optional(),
  default_profile_id: z.uuid().optional(),
  feed_check_interval_minutes: FeedCheckInterval.optional(),
  linking_enabled: z.boolean().optional(),
  linking_model: z.string().min( 1 ).optional(),
} ).refine(
  ( body ) => Object.values( body ).some( ( value ) => value !== undefined ),
  {
    message: [
      'Provide default_model, extraction_model, default_profile_id,',
      'feed_check_interval_minutes, linking_enabled or linking_model',
    ].join( ' ' ),
  },
)
export type UpdateSettingsBody = z.infer< typeof UpdateSettingsBody >

export const PromptVersionSource = z.enum( [ 'seed', 'edit', 'restore', 'reset' ] )
export type PromptVersionSource = z.infer< typeof PromptVersionSource >

export const PromptVersion = z.object( {
  id: z.int(),
  profile_id: z.uuid(),
  version: z.int().min( 1 ),
  guidance: z.string(),
  source: PromptVersionSource,
  created_at: z.iso.datetime(),
} )
export type PromptVersion = z.infer< typeof PromptVersion >

export const PromptProfile = z.object( {
  id: z.uuid(),
  name: z.string(),
  can_reset: z.boolean(),
  current_version: PromptVersion,
  created_at: z.iso.datetime(),
} )
export type PromptProfile = z.infer< typeof PromptProfile >

export const Guidance = z.string().trim().min( 1 ).max( 20_000 )
export type Guidance = z.infer< typeof Guidance >

export const ProfileName = z.string().trim().min( 1 ).max( 60 )
export type ProfileName = z.infer< typeof ProfileName >

export const ListPromptProfilesResponse = z.object( {
  profiles: z.array( PromptProfile ),
} )
export type ListPromptProfilesResponse = z.infer< typeof ListPromptProfilesResponse >

export const PromptProfileResponse = z.object( {
  profile: PromptProfile,
} )
export type PromptProfileResponse = z.infer< typeof PromptProfileResponse >

export const CreatePromptProfileBody = z.object( {
  name: ProfileName,
  guidance: Guidance,
} )
export type CreatePromptProfileBody = z.infer< typeof CreatePromptProfileBody >

export const RenamePromptProfileBody = z.object( {
  name: ProfileName,
} )
export type RenamePromptProfileBody = z.infer< typeof RenamePromptProfileBody >

export const SavePromptVersionBody = z.object( {
  guidance: Guidance,
} )
export type SavePromptVersionBody = z.infer< typeof SavePromptVersionBody >

export const ListPromptVersionsResponse = z.object( {
  versions: z.array( PromptVersion ),
} )
export type ListPromptVersionsResponse = z.infer< typeof ListPromptVersionsResponse >

export const SummaryRun = z.object( {
  model: z.string(),
  profile_id: z.uuid(),
  profile_name: z.string(),
  prompt_version: z.int().min( 1 ),
  input_tokens: z.int().nullable(),
  output_tokens: z.int().nullable(),
  cost_usd: z.number().nullable(),
  outcome: z.enum( [ 'succeeded', 'failed' ] ),
  created_at: z.iso.datetime(),
} )
export type SummaryRun = z.infer< typeof SummaryRun >

export const SummaryUsage = z.object( {
  last_run: SummaryRun,
  run_count: z.int().min( 1 ),
  total_input_tokens: z.int(),
  total_output_tokens: z.int(),
  total_cost_usd: z.number().nullable(),
} )
export type SummaryUsage = z.infer< typeof SummaryUsage >

export const RegenerateSummaryBody = z.object( {
  model: z.string().min( 1 ).optional(),
  profile_id: z.uuid().optional(),
} )
export type RegenerateSummaryBody = z.infer< typeof RegenerateSummaryBody >
