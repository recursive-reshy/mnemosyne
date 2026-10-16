// Packages
import { describe, it, expect } from 'vitest'
// Job
import { Job, JobStatus } from './job.js'

const validJob = {
  id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
  url: 'https://www.youtube.com/watch?v=abc',
  status: 'queued',
  error: null,
  created_at: '2026-10-14T10:00:00.000Z',
  updated_at: '2026-10-14T10:00:00.000Z',
  title: null,
  note_markdown: null,
  target_folder: null,
  expires_at: null,
  saved_path: null,
}

describe( 'JobStatus', () => {
  it.each( [
    'queued',
    'downloading',
    'converting',
    'transcribing',
    'summarizing',
    'ready_for_review',
    'summary_failed',
    'saved',
    'failed',
  ] )(
    'accepts %s',
    ( status ) => {
      expect( JobStatus.safeParse( status ).success ).toBe( true )
    },
  )

  it( 'rejects an unknown status', () => {
    expect( JobStatus.safeParse( 'paused' ).success ).toBe( false )
  } )

  it( 'no longer accepts done', () => {
    expect( JobStatus.safeParse( 'done' ).success ).toBe( false )
  } )
} )

describe( 'Job', () => {
  it( 'accepts a valid job', () => {
    expect( Job.safeParse( validJob ).success ).toBe( true )
  } )

  it( 'accepts an error string', () => {
    expect( Job.safeParse( { ...validJob, status: 'failed', error: 'boom' } ).success ).toBe( true )
  } )

  it( 'rejects a non-UUID id', () => {
    expect( Job.safeParse( { ...validJob, id: 'job-1' } ).success ).toBe( false )
  } )

  it( 'rejects an unknown status', () => {
    expect( Job.safeParse( { ...validJob, status: 'paused' } ).success ).toBe( false )
  } )

  it( 'rejects a non-URL url', () => {
    expect( Job.safeParse( { ...validJob, url: 'nope' } ).success ).toBe( false )
  } )

  it( 'rejects a non-ISO created_at', () => {
    expect( Job.safeParse( { ...validJob, created_at: 'yesterday' } ).success ).toBe( false )
  } )

  it( 'rejects a missing error field', () => {
    const withoutError: Partial< typeof validJob > = { ...validJob }
    delete withoutError.error

    expect( Job.safeParse( withoutError ).success ).toBe( false )
  } )

  it( 'accepts a note and a target folder once they are set', () => {
    const drafted = { ...validJob, note_markdown: '---\n---\n', target_folder: 'Learning/AI' }

    expect( Job.safeParse( drafted ).success ).toBe( true )
  } )

  it.each( [ 'note_markdown', 'target_folder' ] as const )( 'rejects a missing %s', ( key ) => {
    const without: Partial< typeof validJob > = { ...validJob }
    delete without[ key ]

    expect( Job.safeParse( without ).success ).toBe( false )
  } )

  it( 'accepts a reviewed job with an expiry and a saved path', () => {
    const summarized = {
      ...validJob,
      status: 'ready_for_review',
      title: 'A talk',
      note_markdown: '---\ntitle: "A talk"\n---\n\nText\n',
      expires_at: '2026-10-15T10:00:00.000Z',
      saved_path: 'Mnemosyne/A talk.md',
    }

    expect( Job.safeParse( summarized ).success ).toBe( true )
  } )

  it.each( [ 'title', 'expires_at', 'saved_path' ] )(
    'rejects a missing %s field',
    ( field ) => {
      const without: Record< string, unknown > = { ...validJob }
      delete without[ field ]

      expect( Job.safeParse( without ).success ).toBe( false )
    },
  )

  it( 'rejects a non-ISO expires_at', () => {
    expect( Job.safeParse( { ...validJob, expires_at: 'tomorrow' } ).success ).toBe( false )
  } )

  it( 'no longer carries the 0.2.0 summary fields', () => {
    const parsed = Job.parse( { ...validJob, summary_markdown: 'old', suggested_tags: [ 'x' ] } )

    expect( parsed ).not.toHaveProperty( 'summary_markdown' )
    expect( parsed ).not.toHaveProperty( 'suggested_tags' )
  } )
} )
