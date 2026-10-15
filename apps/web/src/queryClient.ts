// Packages
import { QueryClient } from '@tanstack/react-query'

export const createQueryClient = (): QueryClient => {
  return new QueryClient( {
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  } )
}
