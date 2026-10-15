export const jobKeys = {
  all: [ 'jobs' ] as const,
  detail: ( id: string ) => [ 'jobs', id ] as const,
  transcript: ( id: string ) => [ 'jobs', id, 'transcript' ] as const,
}
