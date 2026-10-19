export const jobKeys = {
  all: [ 'jobs' ] as const,
  detail: ( id: string ) => [ 'jobs', id ] as const,
  source: ( id: string ) => [ 'jobs', id, 'source' ] as const,
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

export const feedKeys = {
  all: [ 'feeds' ] as const,
  inbox: [ 'feed-items' ] as const,
}

export const gmailKeys = {
  account: [ 'gmail', 'account' ] as const,
  labels: [ 'gmail', 'labels' ] as const,
}
