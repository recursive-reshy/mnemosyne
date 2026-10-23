// React
import { createContext, useContext, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
// Packages
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import type { InitialEntry, Location } from 'react-router'
// Testing Library
import { render, renderHook } from '@testing-library/react'
import type { RenderHookResult, RenderResult } from '@testing-library/react'
// App
import { createQueryClient } from '#src/queryClient'
import { theme } from '#src/theme'

interface ClientRender extends RenderResult {
  queryClient: QueryClient
  location: () => Location
}

type ClientHookRender< Result, Props > = RenderHookResult< Result, Props > & {
  queryClient: QueryClient
}

const ContentContext = createContext< ReactNode >( null )

function Content( { onLocation }: { onLocation?: ( location: Location ) => void } ): ReactElement {
  const content = useContext( ContentContext )
  const location = useLocation()

  onLocation?.( location )

  return <>{ content }</>
}

interface HarnessProps {
  queryClient: QueryClient
  route: InitialEntry
  path?: string
  onLocation?: ( location: Location ) => void
  children: ReactNode
}

// A memory data router (useBlocker needs one) that shows `children` on every path, or on `path`
// when a route component needs its URL params. The router is
// created once, so rerendering with new children keeps their state.
function Harness(
  { queryClient, route, path = '*', onLocation, children }: HarnessProps,
): ReactElement {
  const [ router ] = useState( () => createMemoryRouter(
    [ { path, element: <Content onLocation={ onLocation } /> } ],
    { initialEntries: [ route ] },
  ) )

  return (
    <ThemeProvider theme={ theme } defaultMode="system" noSsr>
      <QueryClientProvider client={ queryClient }>
        <ContentContext.Provider value={ children }>
          <RouterProvider router={ router } />
        </ContentContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export const renderWithClient = (
  ui: ReactElement,
  { route = '/', path }: { route?: InitialEntry, path?: string } = {},
): ClientRender => {
  const queryClient = createQueryClient()
  let current: Location | undefined
  const onLocation = ( next: Location ): void => {
    current = next
  }

  const wrap = ( content: ReactNode ): ReactElement => (
    <Harness queryClient={ queryClient } route={ route } path={ path } onLocation={ onLocation }>
      { content }
    </Harness>
  )
  const result = render( wrap( ui ) )

  return {
    ...result,
    // Rerender inside the same providers, so the component keeps its state.
    rerender: ( next ) => result.rerender( wrap( next ) ),
    queryClient,
    location: () => {
      if( current === undefined ) {
        throw new Error( 'The router has not rendered yet' )
      }

      return current
    },
  }
}

export const renderHookWithClient = < Result, Props = undefined >(
  hook: ( props: Props ) => Result,
  options?: { initialProps?: Props, queryClient?: QueryClient },
): ClientHookRender< Result, Props > => {
  const queryClient = options?.queryClient ?? createQueryClient()
  const wrapper = ( { children }: { children: ReactNode } ): ReactElement => (
    <Harness queryClient={ queryClient } route="/">{ children }</Harness>
  )

  return {
    ...renderHook( hook, { wrapper, initialProps: options?.initialProps as Props } ),
    queryClient,
  }
}
