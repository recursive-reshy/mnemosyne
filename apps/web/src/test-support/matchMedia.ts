const WIDE_WIDTH = 1280
const NARROW_WIDTH = 500

interface MatchMediaOptions {
  isWide?: boolean
  isDark?: boolean
}

interface MatchMediaControls {
  setWide: ( isWide: boolean ) => void
  setDark: ( isDark: boolean ) => void
}

type Listener = ( event: MediaQueryListEvent ) => void

const PIXELS = /\((min|max)-width:\s*([\d.]+)px\)/

export const mockMatchMedia = (
  { isWide = true, isDark = false }: MatchMediaOptions = {},
): MatchMediaControls => {
  const state = { width: isWide ? WIDE_WIDTH : NARROW_WIDTH, isDark }
  const lists = new Set< { query: string, matches: boolean, listeners: Set< Listener > } >()

  const evaluate = ( query: string ): boolean => {
    const text = query.replace( /^@media\s*/, '' )

    if( text.includes( 'prefers-color-scheme: dark' ) ) {
      return state.isDark
    }

    const pixels = PIXELS.exec( text )

    if( pixels === null ) {
      return false
    }

    const limit = Number( pixels[ 2 ] )

    return pixels[ 1 ] === 'min' ? state.width >= limit : state.width <= limit
  }

  const refresh = (): void => {
    for( const list of lists ) {
      const matches = evaluate( list.query )

      if( matches !== list.matches ) {
        list.matches = matches

        for( const listener of list.listeners ) {
          listener( { matches, media: list.query } as MediaQueryListEvent )
        }
      }
    }
  }

  window.matchMedia = ( query: string ): MediaQueryList => {
    const list = { query, matches: evaluate( query ), listeners: new Set< Listener >() }
    lists.add( list )

    return {
      get matches() {
        return list.matches
      },
      media: query,
      onchange: null,
      addEventListener: ( _type: string, listener: Listener ) => {
        list.listeners.add( listener )
      },
      removeEventListener: ( _type: string, listener: Listener ) => {
        list.listeners.delete( listener )
      },
      addListener: ( listener: Listener ) => {
        list.listeners.add( listener )
      },
      removeListener: ( listener: Listener ) => {
        list.listeners.delete( listener )
      },
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }

  return {
    setWide: ( wide ) => {
      state.width = wide ? WIDE_WIDTH : NARROW_WIDTH
      refresh()
    },
    setDark: ( dark ) => {
      state.isDark = dark
      refresh()
    },
  }
}
