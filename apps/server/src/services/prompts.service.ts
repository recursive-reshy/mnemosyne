// Packages
import { z } from 'zod'
// Shared
import { PromptProfile, PromptVersion } from '@mnemosyne/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Repositories
import {
  ProfileRecord,
  countActiveProfiles,
  findLatestVersion,
  findProfileById,
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
import { SEEDED_PROFILES } from '../summarizer/prompts.js'

const NAME_TAKEN = 'A profile with that name already exists'

const toProfile = ( record: ProfileRecord ): PromptProfile => {
  const current = findLatestVersion( record.id )

  if( current === undefined ) {
    throw new Error( `Profile ${ record.id } has no versions` )
  }

  return {
    id: record.id,
    name: record.name,
    can_reset: record.seed_key !== null,
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

export const listProfiles = (): PromptProfile[] => listActiveProfiles().map( toProfile )

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

export const renameProfile = ( id: string, name: string ): PromptProfile => {
  requireActive( id )

  if( !renameStoredProfile( id, name ).ok ) {
    throw new ConflictError( NAME_TAKEN )
  }

  return findProfile( id )
}

export const deleteProfile = ( id: string ): void => {
  requireActive( id )

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

export const resetProfile = ( id: string ): PromptProfile => {
  const record = requireActive( id )
  const seeded = SEEDED_PROFILES.find( ( { seedKey } ) => seedKey === record.seed_key )

  if( seeded === undefined ) {
    throw new ConflictError( 'Only the profiles the app ships can be reset' )
  }

  insertVersion( id, seeded.guidance, 'reset' )

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

  if( profileId !== null && record === undefined ) {
    console.error( `Prompt profile ${ profileId } not found; using the default profile` )
  }

  record ??= findProfileById( defaultProfileId() )

  if( record === undefined ) {
    throw new Error( 'The default prompt profile is missing' )
  }

  const profile = toProfile( record )

  return { profile, version: profile.current_version }
}
