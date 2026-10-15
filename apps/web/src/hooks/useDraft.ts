// React
import { useState } from 'react'

export interface Draft {
  title: string
  tags: string[]
  body: string
}

const isDraft = ( value: unknown ): value is Draft => {
  if( typeof value !== 'object' || value === null ) {
    return false
  }

  const { title, tags, body } = value as Record< string, unknown >

  return typeof title === 'string'
    && typeof body === 'string'
    && Array.isArray( tags )
    && tags.every( ( tag ) => typeof tag === 'string' )
}

const keyFor = ( jobId: string ): string => `mnemosyne:draft:${ jobId }`

const readDraft = ( jobId: string ): Draft | null => {
  try {
    const raw = window.localStorage.getItem( keyFor( jobId ) )

    if( raw === null ) {
      return null
    }

    const parsed: unknown = JSON.parse( raw )

    return isDraft( parsed ) ? parsed : null
  } catch{
    return null
  }
}

const writeDraft = ( jobId: string, draft: Draft ): void => {
  try {
    window.localStorage.setItem( keyFor( jobId ), JSON.stringify( draft ) )
  } catch{
    // Storage is a convenience: a blocked or full store must not break editing.
  }
}

export const clearDraft = ( jobId: string ): void => {
  try {
    window.localStorage.removeItem( keyFor( jobId ) )
  } catch{
    // See writeDraft.
  }
}

export interface DraftState {
  draft: Draft
  setTitle: ( title: string ) => void
  setTags: ( tags: string[] ) => void
  setBody: ( body: string ) => void
  clear: () => void
}

export function useDraft( jobId: string, initial: Draft ): DraftState {
  const [ draft, setDraft ] = useState< Draft >( () => readDraft( jobId ) ?? initial )

  const update = ( patch: Partial< Draft > ): void => {
    const next = { ...draft, ...patch }

    setDraft( next )
    writeDraft( jobId, next )
  }

  return {
    draft,
    setTitle: ( title ) => update( { title } ),
    setTags: ( tags ) => update( { tags } ),
    setBody: ( body ) => update( { body } ),
    clear: () => {
      clearDraft( jobId )
      setDraft( initial )
    },
  }
}
