// Packages
import { describe, it, expect } from 'vitest'
// Api
import {
  CreateJobBody,
  CreateJobResponse,
  DownloadFormat,
  FolderNode,
  GetJobResponse,
  GetTranscriptResponse,
  ListFoldersResponse,
  ListJobsResponse,
  SaveJobBody,
  SaveJobResponse,
  UpdateDraftBody,
  UpdateDraftResponse,
} from './api.js'

const jobId = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'

describe( 'CreateJobBody', () => {
  it.each( [ 'http://example.com/v', 'https://www.youtube.com/watch?v=abc' ] )(
    'accepts %s',
    ( url ) => {
      expect( CreateJobBody.safeParse( { url } ).success ).toBe( true )
    },
  )

  it.each( [ 'ftp://example.com/v', 'javascript:alert(1)', 'not a url' ] )(
    'rejects %s',
    ( url ) => {
      expect( CreateJobBody.safeParse( { url } ).success ).toBe( false )
    },
  )

  it( 'rejects a missing url', () => {
    expect( CreateJobBody.safeParse( {} ).success ).toBe( false )
  } )
} )

describe( 'CreateJobResponse', () => {
  it( 'accepts a UUID job_id', () => {
    expect( CreateJobResponse.safeParse( { job_id: jobId } ).success ).toBe( true )
  } )

  it( 'rejects a non-UUID job_id', () => {
    expect( CreateJobResponse.safeParse( { job_id: '1' } ).success ).toBe( false )
  } )
} )

describe( 'GetJobResponse', () => {
  const job = {
    id: jobId,
    url: 'https://example.com/v',
    status: 'ready_for_review',
    error: null,
    created_at: '2026-10-14T10:00:00.000Z',
    updated_at: '2026-10-14T10:00:00.000Z',
    title: null,
    summary_markdown: null,
    suggested_tags: [],
    note_markdown: null,
    target_folder: null,
    expires_at: null,
    saved_path: null,
  }

  it( 'accepts a job', () => {
    expect( GetJobResponse.safeParse( { job } ).success ).toBe( true )
  } )

  it( 'rejects an invalid job', () => {
    expect( GetJobResponse.safeParse( { job: { ...job, id: 'x' } } ).success ).toBe( false )
  } )
} )

describe( 'DownloadFormat', () => {
  it.each( [ 'md', 'srt', 'txt' ] )( 'accepts %s', ( format ) => {
    expect( DownloadFormat.safeParse( format ).success ).toBe( true )
  } )

  it( 'rejects pdf', () => {
    expect( DownloadFormat.safeParse( 'pdf' ).success ).toBe( false )
  } )
} )

const jobFields = {
  url: 'https://www.youtube.com/watch?v=abc',
  status: 'ready_for_review',
  error: null,
  created_at: '2026-10-14T10:00:00.000Z',
  updated_at: '2026-10-14T10:00:00.000Z',
  title: 'A talk',
  summary_markdown: '## Summary',
  suggested_tags: [ 'rust' ],
  note_markdown: null,
  target_folder: null,
  expires_at: '2026-10-15T10:00:00.000Z',
  saved_path: null,
}

const transcript = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Some Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-14T10:04:00.000Z',
    model: 'large-v3',
  },
  segments: [ { start: 0, end: 1, text: 'Hello' } ],
}

describe( 'ListJobsResponse', () => {
  it( 'accepts a list of jobs, including an empty one', () => {
    expect( ListJobsResponse.safeParse( { jobs: [] } ).success ).toBe( true )
    expect(
      ListJobsResponse.safeParse( { jobs: [ { id: jobId, ...jobFields } ] } ).success,
    ).toBe( true )
  } )

  it( 'rejects an invalid job in the list', () => {
    expect(
      ListJobsResponse.safeParse( { jobs: [ { id: 'x', ...jobFields } ] } ).success,
    ).toBe( false )
  } )

  it( 'rejects a missing jobs field', () => {
    expect( ListJobsResponse.safeParse( {} ).success ).toBe( false )
  } )
} )

describe( 'GetTranscriptResponse', () => {
  it( 'accepts a transcript', () => {
    expect( GetTranscriptResponse.safeParse( { transcript } ).success ).toBe( true )
  } )

  it( 'rejects a transcript without segments', () => {
    const { meta } = transcript

    expect( GetTranscriptResponse.safeParse( { transcript: { meta } } ).success ).toBe( false )
  } )
} )

describe( 'SaveJobBody', () => {
  const body = { title: 'A talk', tags: [ 'mnemosyne', 'rust' ], body: '## Summary' }

  it( 'accepts a title, tags and a body', () => {
    expect( SaveJobBody.safeParse( body ).success ).toBe( true )
  } )

  it( 'accepts an empty body and no tags', () => {
    expect( SaveJobBody.safeParse( { ...body, tags: [], body: '' } ).success ).toBe( true )
  } )

  it.each( [ '', '   ' ] )( 'rejects the blank title %j', ( title ) => {
    expect( SaveJobBody.safeParse( { ...body, title } ).success ).toBe( false )
  } )

  it( 'rejects non-string tags', () => {
    expect( SaveJobBody.safeParse( { ...body, tags: [ 1 ] } ).success ).toBe( false )
  } )

  it.each( [ 'title', 'tags', 'body' ] )( 'rejects a missing %s', ( field ) => {
    const without: Record< string, unknown > = { ...body }
    delete without[ field ]

    expect( SaveJobBody.safeParse( without ).success ).toBe( false )
  } )
} )

describe( 'SaveJobResponse', () => {
  it( 'accepts a saved path', () => {
    expect( SaveJobResponse.safeParse( { saved_path: 'Mnemosyne/A talk.md' } ).success ).toBe(
      true,
    )
  } )

  it( 'rejects an empty or missing saved path', () => {
    expect( SaveJobResponse.safeParse( { saved_path: '' } ).success ).toBe( false )
    expect( SaveJobResponse.safeParse( {} ).success ).toBe( false )
  } )
} )

describe( 'FolderNode and ListFoldersResponse', () => {
  const tree = {
    name: 'Learning',
    path: 'Learning',
    children: [ { name: 'AI', path: 'Learning/AI', children: [] } ],
  }

  it( 'accepts a nested tree', () => {
    expect( FolderNode.safeParse( tree ).success ).toBe( true )
    expect( ListFoldersResponse.safeParse( {
      default_folder: 'Mnemosyne',
      folders: [ tree ],
    } ).success ).toBe( true )
  } )

  it( 'accepts an empty vault', () => {
    expect( ListFoldersResponse.safeParse( { default_folder: 'Mnemosyne', folders: [] } ).success )
      .toBe( true )
  } )

  it( 'rejects a node without a path, at any depth', () => {
    const broken = { ...tree, children: [ { name: 'AI', children: [] } ] }

    expect( FolderNode.safeParse( broken ).success ).toBe( false )
  } )

  it( 'rejects a missing default_folder', () => {
    expect( ListFoldersResponse.safeParse( { folders: [] } ).success ).toBe( false )
  } )
} )

describe( 'UpdateDraftBody', () => {
  it.each( [
    { note_markdown: '---\n---\n' },
    { target_folder: 'Learning/AI' },
    { target_folder: null },
    { note_markdown: 'x', target_folder: null },
  ] )( 'accepts %j', ( body ) => {
    expect( UpdateDraftBody.safeParse( body ).success ).toBe( true )
  } )

  it.each( [ {}, { note_markdown: 5 }, { target_folder: 5 }, { note_markdown: undefined } ] )(
    'rejects %j',
    ( body ) => {
      expect( UpdateDraftBody.safeParse( body ).success ).toBe( false )
    },
  )
} )

describe( 'UpdateDraftResponse', () => {
  it( 'requires a job', () => {
    expect( UpdateDraftResponse.safeParse( {} ).success ).toBe( false )
  } )
} )
