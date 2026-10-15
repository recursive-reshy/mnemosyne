// Testing Library
import { act, renderHook } from '@testing-library/react'
// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { clearDraft, useDraft } from './useDraft'

const KEY = 'mnemosyne:draft:job-1'
const initial = { title: 'Original', tags: [ 'rust' ], body: '## Summary' }

beforeEach( () => {
  window.localStorage.clear()
} )

afterEach( () => {
  vi.restoreAllMocks()
} )

describe( 'useDraft', () => {
  it( 'starts from the initial values and writes nothing until an edit', () => {
    const { result } = renderHook( () => useDraft( 'job-1', initial ) )

    expect( result.current.draft ).toEqual( initial )
    expect( window.localStorage.getItem( KEY ) ).toBeNull()
  } )

  it( 'mirrors each edit to localStorage', () => {
    const { result } = renderHook( () => useDraft( 'job-1', initial ) )

    act( () => result.current.setTitle( 'Edited' ) )
    act( () => result.current.setTags( [ 'rust', 'go' ] ) )
    act( () => result.current.setBody( 'New body' ) )

    const expected = { title: 'Edited', tags: [ 'rust', 'go' ], body: 'New body' }

    expect( result.current.draft ).toEqual( expected )
    expect( JSON.parse( window.localStorage.getItem( KEY ) ?? 'null' ) ).toEqual( expected )
  } )

  it( 'prefers a stored draft over the initial values on mount', () => {
    const stored = { title: 'Saved edit', tags: [], body: 'Draft body' }
    window.localStorage.setItem( KEY, JSON.stringify( stored ) )

    const { result } = renderHook( () => useDraft( 'job-1', initial ) )

    expect( result.current.draft ).toEqual( stored )
  } )

  it.each( [ 'not json', '{"title":1}', '[]', 'null' ] )(
    'ignores an invalid stored value (%s)',
    ( value ) => {
      window.localStorage.setItem( KEY, value )

      const { result } = renderHook( () => useDraft( 'job-1', initial ) )

      expect( result.current.draft ).toEqual( initial )
    },
  )

  it( 'keeps drafts of different jobs apart', () => {
    window.localStorage.setItem(
      'mnemosyne:draft:job-2',
      JSON.stringify( { title: 'Other', tags: [], body: '' } ),
    )

    const { result } = renderHook( () => useDraft( 'job-1', initial ) )

    expect( result.current.draft ).toEqual( initial )
  } )

  it( 'clear removes the stored draft and returns to the initial values', () => {
    const { result } = renderHook( () => useDraft( 'job-1', initial ) )
    act( () => result.current.setTitle( 'Edited' ) )

    act( () => result.current.clear() )

    expect( result.current.draft ).toEqual( initial )
    expect( window.localStorage.getItem( KEY ) ).toBeNull()
  } )

  it( 'still works when reading storage throws', () => {
    vi.spyOn( Storage.prototype, 'getItem' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )

    const { result } = renderHook( () => useDraft( 'job-1', initial ) )

    expect( result.current.draft ).toEqual( initial )
  } )

  it( 'still edits and clears when writing storage throws', () => {
    vi.spyOn( Storage.prototype, 'setItem' ).mockImplementation( () => {
      throw new Error( 'quota' )
    } )
    vi.spyOn( Storage.prototype, 'removeItem' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )
    const { result } = renderHook( () => useDraft( 'job-1', initial ) )

    act( () => result.current.setTitle( 'Edited' ) )
    expect( result.current.draft.title ).toBe( 'Edited' )

    act( () => result.current.clear() )
    expect( result.current.draft ).toEqual( initial )
  } )
} )

describe( 'clearDraft', () => {
  it( 'removes the stored draft of a job', () => {
    window.localStorage.setItem( KEY, '{}' )

    clearDraft( 'job-1' )

    expect( window.localStorage.getItem( KEY ) ).toBeNull()
  } )

  it( 'does not throw when storage is unavailable', () => {
    vi.spyOn( Storage.prototype, 'removeItem' ).mockImplementation( () => {
      throw new Error( 'blocked' )
    } )

    expect( () => clearDraft( 'job-1' ) ).not.toThrow()
  } )
} )
