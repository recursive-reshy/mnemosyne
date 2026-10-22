// Packages
import { z } from 'zod'
// Shared
import { PromptProfile, PromptPurpose, PromptVersion } from '@mnemosyne/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  MELETE_GRADING_SEED_KEY,
  MELETE_QUESTIONS_SEED_KEY,
} from '../melete/prompts.js'
// Repositories
import {
  ProfileRecord,
  countActiveProfiles,
  findLatestVersion,
  findProfileById,
  findProfileBySeedKey,
  findVersionById,
  insertProfile,
  insertVersion,
  listActiveProfiles,
  listVersions as listStoredVersions,
  markProfileDeleted,
  renameProfile as renameStoredProfile,
} from '../repositories/promptProfiles.repository.js'
import { getSetting } from '../repositories/settings.repository.js'
// Summarizer
import {
  DEFAULT_LINKER_GUIDANCE,
  LINKER_SEED_KEY,
  SEEDED_PROFILES,
} from '../summarizer/prompts.js'
// Logging
import { logger } from '../logger.js'

const NAME_TAKEN = 'A profile with that name already exists'
const LINKER_LOCKED = 'The linker prompt can\'t be renamed or deleted'
const MELETE_LOCKED = 'The Melete prompts can\'t be renamed or deleted'

const toProfile = ( record: ProfileRecord ): PromptProfile => {
  const current = findLatestVersion( record.id )

  if( current === undefined ) {
    throw new Error( `Profile ${ record.id } has no versions` )
  }

  return {
    id: record.id,
    name: record.name,
    can_reset: record.seed_key !== null,
    purpose: record.purpose,
    current_version: current,
    created_at: record.created_at,
  }
}

const requireActive = ( id: string ): ProfileRecord => {
  const record = findProfileById( id )

  if( record === undefined || record.deleted_at !== null ) {
    throw new NotFoundError( 'Prompt profile not found' )
  }

  return record
}

const defaultProfileId = (): string => z.string().parse( getSetting( 'default_profile_id' ) )

const PURPOSE_ORDER: PromptPurpose[] = [
  'summary',
  'linker',
  'melete_questions',
  'melete_grading',
]

// Summary profiles unless asked: the pickers use this list and know no other purpose
export const listProfiles = ( purpose: PromptPurpose | 'all' = 'summary' ): PromptProfile[] => {
  const purposes = purpose === 'all' ? PURPOSE_ORDER : [ purpose ]

  return purposes.flatMap( ( each ) => listActiveProfiles( each ).map( toProfile ) )
}

export const findProfile = ( id: string ): PromptProfile => toProfile( requireActive( id ) )

export const assertActiveProfile = ( id: string ): void => {
  if( !listActiveProfiles().some( ( record ) => record.id === id ) ) {
    throw new ValidationError( 'Unknown prompt profile' )
  }
}

export const createProfile = (
  { name, guidance }: { name: string, guidance: string },
): PromptProfile => {
  const id = crypto.randomUUID()
  const result = insertProfile( {
    id,
    name,
    seed_key: null,
    created_at: new Date().toISOString(),
  } )

  if( !result.ok ) {
    throw new ConflictError( NAME_TAKEN )
  }

  insertVersion( id, guidance, 'edit' )

  return findProfile( id )
}

const requireRenamable = ( record: ProfileRecord ): void => {
  if( record.purpose === 'linker' ) {
    throw new ConflictError( LINKER_LOCKED )
  }

  if( record.purpose !== 'summary' ) {
    throw new ConflictError( MELETE_LOCKED )
  }
}

export const renameProfile = ( id: string, name: string ): PromptProfile => {
  requireRenamable( requireActive( id ) )

  if( !renameStoredProfile( id, name ).ok ) {
    throw new ConflictError( NAME_TAKEN )
  }

  return findProfile( id )
}

export const deleteProfile = ( id: string ): void => {
  requireRenamable( requireActive( id ) )

  if( id === defaultProfileId() ) {
    throw new ConflictError( 'The default profile cannot be deleted' )
  }

  if( countActiveProfiles() <= 1 ) {
    throw new ConflictError( 'The last remaining profile cannot be deleted' )
  }

  markProfileDeleted( id, new Date().toISOString() )
}

export const saveVersion = ( id: string, guidance: string ): PromptProfile => {
  const profile = findProfile( id )

  if( guidance.trim() === profile.current_version.guidance.trim() ) {
    return profile
  }

  insertVersion( id, guidance, 'edit' )

  return findProfile( id )
}

export const restoreVersion = ( id: string, versionId: number ): PromptProfile => {
  requireActive( id )
  const version = findVersionById( versionId )

  if( version === undefined || version.profile_id !== id ) {
    throw new NotFoundError( 'Prompt version not found' )
  }

  insertVersion( id, version.guidance, 'restore' )

  return findProfile( id )
}

const resetGuidance = ( { purpose, seed_key }: ProfileRecord ): string | undefined => {
  switch( purpose ) {
    case 'linker':
      return DEFAULT_LINKER_GUIDANCE
    case 'melete_questions':
      return DEFAULT_MELETE_QUESTIONS_GUIDANCE
    case 'melete_grading':
      return DEFAULT_MELETE_GRADING_GUIDANCE
    case 'summary':
      return SEEDED_PROFILES.find( ( { seedKey } ) => seedKey === seed_key )?.guidance
  }
}

export const resetProfile = ( id: string ): PromptProfile => {
  const record = requireActive( id )
  const guidance = resetGuidance( record )

  if( guidance === undefined ) {
    throw new ConflictError( 'Only the profiles the app ships can be reset' )
  }

  insertVersion( id, guidance, 'reset' )

  return findProfile( id )
}

export const listVersions = ( id: string ): PromptVersion[] => {
  requireActive( id )

  return listStoredVersions( id )
}

export const resolvePrompt = (
  profileId: string | null,
): { profile: PromptProfile, version: PromptVersion } => {
  let record = profileId === null ? undefined : findProfileById( profileId )

  // The linker and Melete prompts are never summary prompts
  if( record !== undefined && record.purpose !== 'summary' ) {
    record = undefined
  }

  if( profileId !== null && record === undefined ) {
    logger.error(
      { profile_id: profileId },
      'Prompt profile not found; using the default profile',
    )
  }

  record ??= findProfileById( defaultProfileId() )

  if( record === undefined ) {
    throw new Error( 'The default prompt profile is missing' )
  }

  const profile = toProfile( record )

  return { profile, version: profile.current_version }
}

export const resolveLinkerPrompt = (): { profile: PromptProfile, version: PromptVersion } => {
  const record = findProfileBySeedKey( LINKER_SEED_KEY )

  if( record === undefined ) {
    throw new Error( 'The linker prompt profile is missing' )
  }

  const profile = toProfile( record )

  return { profile, version: profile.current_version }
}

export const resolveMeletePrompt = (
  purpose: 'melete_questions' | 'melete_grading',
): { profile: PromptProfile, version: PromptVersion } => {
  const seedKey = purpose === 'melete_questions'
    ? MELETE_QUESTIONS_SEED_KEY
    : MELETE_GRADING_SEED_KEY
  const record = findProfileBySeedKey( seedKey )

  if( record === undefined ) {
    throw new Error( `The ${ purpose } prompt profile is missing` )
  }

  const profile = toProfile( record )

  return { profile, version: profile.current_version }
}
