export const jobKeys = {
  all: [ 'jobs' ] as const,
  detail: ( id: string ) => [ 'jobs', id ] as const,
  transcript: ( id: string ) => [ 'jobs', id, 'transcript' ] as const,
}

export const vaultKeys = {
  folders: [ 'vault', 'folders' ] as const,
}

export const settingsKeys = {
  all: [ 'settings' ] as const,
}

export const modelKeys = {
  all: [ 'models' ] as const,
}

export const promptKeys = {
  profiles: [ 'prompt-profiles' ] as const,
  versions: ( id: string ) => [ 'prompt-profiles', id, 'versions' ] as const,
}
