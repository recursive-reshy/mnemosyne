// Shared
import type { Job } from '@mnemosyne/shared'

export function jobFixture( overrides: Partial< Job > = {} ): Job {
  return {
    id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
    url: 'https://www.youtube.com/watch?v=cFoaK1OQRhw',
    status: 'queued',
    error: null,
    created_at: '2026-10-15T10:00:00.000Z',
    updated_at: '2026-10-15T10:00:00.000Z',
    ...overrides,
  }
}
