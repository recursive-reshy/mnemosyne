// Node
import { readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import * as extractionRuns from './extractionRuns.repository.js'
import * as feedItems from './feedItems.repository.js'
import * as feeds from './feeds.repository.js'
import * as gmailAccount from './gmailAccount.repository.js'
import * as gmailMessages from './gmailMessages.repository.js'
import * as gmailSources from './gmailSources.repository.js'
import * as health from './health.repository.js'
import * as jobStore from './jobStore.repository.js'
import * as linkRuns from './linkRuns.repository.js'
import * as linkSuggestions from './linkSuggestions.repository.js'
import * as meleteNotes from './meleteNotes.repository.js'
import * as meleteQuestions from './meleteQuestions.repository.js'
import * as meleteReviews from './meleteReviews.repository.js'
import * as meleteRuns from './meleteRuns.repository.js'
import * as meleteSubjects from './meleteSubjects.repository.js'
import * as postings from './postings.repository.js'
import * as promptProfiles from './promptProfiles.repository.js'
import * as settings from './settings.repository.js'
import * as summaryRuns from './summaryRuns.repository.js'
import * as userModules from './userModules.repository.js'

// Repositories that hold users, sessions or app-wide values, or that read across users for the
// background loops, take no `userId` (ADR 0062). `system` joins in Checkpoint D.
const EXEMPT = [ 'system', 'users', 'sessions', 'appSettings' ]

// Data repositories whose functions don't yet take `userId` first. Each Phase 4 task removes its
// repositories from this list; task 4.6 un-skips the test that needs it empty.
const UNCONVERTED = [
  'health',
  'meleteNotes',
  'meleteQuestions',
  'meleteReviews',
  'meleteRuns',
  'meleteSubjects',
]

type AnyFunction = ( ...args: never[] ) => unknown

// Every data repository, imported by name so the guard is typed. A new one must be added here;
// the file listing below fails until it is.
const DATA_REPOSITORIES: Record< string, Record< string, unknown > > = {
  extractionRuns,
  feedItems,
  feeds,
  gmailAccount,
  gmailMessages,
  gmailSources,
  health,
  jobStore,
  linkRuns,
  linkSuggestions,
  meleteNotes,
  meleteQuestions,
  meleteReviews,
  meleteRuns,
  meleteSubjects,
  postings,
  promptProfiles,
  settings,
  summaryRuns,
  userModules,
}

const files = readdirSync( dirname( fileURLToPath( import.meta.url ) ) )
  .filter( ( file ) => file.endsWith( '.repository.ts' ) )
  .map( ( file ) => file.replace( '.repository.ts', '' ) )

// The first parameter's name, read from the function's source (types are already stripped).
const firstParameter = ( fn: AnyFunction ): string | null => {
  const match = /^(?:async\s*)?(?:function\s*[\w$]*\s*)?\(?\s*([A-Za-z_$][\w$]*)\s*[,)=]/
    .exec( fn.toString() )

  return match === null ? null : ( match[ 1 ] ?? null )
}

const offenders = ( name: string ): string[] => {
  return Object.entries( DATA_REPOSITORIES[ name ] ?? {} )
    .filter( ( [ , value ] ) => typeof value === 'function' )
    .filter( ( [ , value ] ) => firstParameter( value as AnyFunction ) !== 'userId' )
    .map( ( [ exported ] ) => exported )
}

const converted = Object.keys( DATA_REPOSITORIES )
  .filter( ( name ) => !UNCONVERTED.includes( name ) )

describe( 'the repository signature guard', () => {
  it( 'maps every repository file that is not exempt', () => {
    expect( files.filter( ( name ) => !EXEMPT.includes( name ) ).sort() )
      .toEqual( Object.keys( DATA_REPOSITORIES ).sort() )
  } )

  it( 'lists only mapped repositories, once each', () => {
    expect( new Set( UNCONVERTED ).size ).toBe( UNCONVERTED.length )
    expect( UNCONVERTED.filter( ( name ) => !( name in DATA_REPOSITORIES ) ) ).toEqual( [] )
  } )

  it( 'reads the first parameter of arrow, async and plain functions', () => {
    expect( firstParameter( ( userId: string ) => userId ) ).toBe( 'userId' )
    expect( firstParameter( async ( userId: string, id: string ) => {
      return await Promise.resolve( `${ userId }${ id }` )
    } ) ).toBe( 'userId' )
    expect( firstParameter( function lookup( userId: string ) { return userId } ) ).toBe( 'userId' )
    expect( firstParameter( ( id: string ) => id ) ).toBe( 'id' )
    expect( firstParameter( () => 1 ) ).toBeNull()
    expect( firstParameter( ( { userId }: { userId: string } ) => userId ) ).toBeNull()
  } )

  it( 'has userId first in every function of every converted repository', () => {
    for( const name of converted ) {
      expect( offenders( name ), `${ name }.repository.ts` ).toEqual( [] )
    }
  } )

  it( 'drops a repository from the unconverted list once all its functions take userId', () => {
    const done = UNCONVERTED.filter( ( name ) => offenders( name ).length === 0 )

    expect( done, 'remove these from UNCONVERTED' ).toEqual( [] )
  } )

  // Un-skipped by task 4.6, when every data repository takes the owner first.
  it.skip( 'has no unconverted repositories left', () => {
    expect( UNCONVERTED ).toEqual( [] )
  } )
} )
