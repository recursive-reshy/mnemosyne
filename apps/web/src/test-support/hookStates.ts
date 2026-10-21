// App
import type { useModels } from '../hooks/useModels'
import type { usePromptProfiles } from '../hooks/usePromptProfiles'
import type { useSettings } from '../hooks/useSettings'
import { mutationStub } from './mutationStub'
import {
  modelsFixture,
  profilesFixture,
  settingsFixture,
} from './summarizer.fixture'

type SettingsState = ReturnType< typeof useSettings >
type ModelsState = ReturnType< typeof useModels >
type ProfilesState = ReturnType< typeof usePromptProfiles >

// Loaded, error-free return values for the Settings hooks, for component tests that mock them.
export const settingsState = ( overrides: Partial< SettingsState > = {} ): SettingsState => ( {
  settings: settingsFixture().settings,
  lockedInstructions: settingsFixture().locked_instructions,
  linkerLockedInstructions: settingsFixture().linker_locked_instructions,
  agentStatus: settingsFixture().agent_status,
  isLoading: false,
  error: null,
  updateSettings: mutationStub(),
  ...overrides,
} )

export const modelsState = ( overrides: Partial< ModelsState > = {} ): ModelsState => ( {
  models: modelsFixture().models,
  source: 'api',
  isLoading: false,
  error: null,
  ...overrides,
} )

export const profilesState = ( overrides: Partial< ProfilesState > = {} ): ProfilesState => ( {
  profiles: profilesFixture(),
  isLoading: false,
  error: null,
  createProfile: mutationStub(),
  renameProfile: mutationStub(),
  deleteProfile: mutationStub(),
  saveVersion: mutationStub(),
  restoreVersion: mutationStub(),
  resetProfile: mutationStub(),
  ...overrides,
} )
