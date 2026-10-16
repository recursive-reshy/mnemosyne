export const jobKeys = {
  all: [ 'jobs' ] as const,
  detail: ( id: string ) => [ 'jobs', id ] as const,
  transcript: ( id: string ) => [ 'jobs', id, 'transcript' ] as const,
}

export const vaultKeys = {
  folders: [ 'vault', 'folders' ] as const,
}
