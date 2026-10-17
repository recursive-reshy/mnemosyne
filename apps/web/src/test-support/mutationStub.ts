// Packages
import { vi } from 'vitest'

type StubOverrides = {
  isSuccess?: boolean
  isError?: boolean
  isPending?: boolean
  error?: Error | null
  data?: unknown
  mutate?: ReturnType< typeof vi.fn >
  mutateAsync?: ReturnType< typeof vi.fn >
  reset?: ReturnType< typeof vi.fn >
}

// Enough of a TanStack mutation result for components that only read its status and call mutate.
// The result type comes from where the stub is used.
export const mutationStub = < Result >( overrides: StubOverrides = {} ): Result => {
  return {
    isSuccess: false,
    isError: false,
    isPending: false,
    error: null,
    data: undefined,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  } as unknown as Result
}
