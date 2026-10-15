// React
import type { ReactElement, ReactNode } from 'react'
// Packages
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// Testing Library
import { render, renderHook } from '@testing-library/react'
import type { RenderHookResult, RenderResult } from '@testing-library/react'
// App
import { createQueryClient } from '#src/queryClient'

interface ClientRender extends RenderResult {
  queryClient: QueryClient
}

type ClientHookRender< Result, Props > = RenderHookResult< Result, Props > & {
  queryClient: QueryClient
}

export const renderWithClient = ( ui: ReactElement ): ClientRender => {
  const queryClient = createQueryClient()

  return {
    ...render( <QueryClientProvider client={ queryClient }>{ ui }</QueryClientProvider> ),
    queryClient,
  }
}

export const renderHookWithClient = < Result, Props = undefined >(
  hook: ( props: Props ) => Result,
  options?: { initialProps?: Props, queryClient?: QueryClient },
): ClientHookRender< Result, Props > => {
  const queryClient = options?.queryClient ?? createQueryClient()
  const wrapper = ( { children }: { children: ReactNode } ): ReactElement => (
    <QueryClientProvider client={ queryClient }>{ children }</QueryClientProvider>
  )

  return {
    ...renderHook( hook, { wrapper, initialProps: options?.initialProps as Props } ),
    queryClient,
  }
}
