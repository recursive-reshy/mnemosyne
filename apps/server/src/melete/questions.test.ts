// Packages
import { describe, it, expect } from 'vitest'
// Melete
import { processQuestions } from './questions.js'

const question = ( overrides: Record< string, string > = {} ) => ( {
  prompt: 'What is narrowing?',
  answer: 'Refining a union type inside a branch.',
  passage: '',
  ...overrides,
} )

const body = 'Narrowing refines a union\ntype inside a branch.\n\nA typeof check narrows it.'

describe( 'processQuestions', () => {
  it( 'trims every field', () => {
    const [ first ] = processQuestions(
      {
        questions: [ question( {
          prompt: '  Why?  ',
          answer: ' Because. ',
          passage: ' A typeof check narrows it. ',
        } ) ],
      },
      body,
    )

    expect( first ).toEqual( {
      prompt: 'Why?',
      answer: 'Because.',
      passage: 'A typeof check narrows it.',
    } )
  } )

  it( 'drops a question with an empty prompt or answer, keeping the order of the rest', () => {
    const result = processQuestions( {
      questions: [
        question( { prompt: 'First?' } ),
        question( { prompt: '   ' } ),
        question( { answer: '  ' } ),
        question( { prompt: 'Last?' } ),
      ],
    }, body )

    expect( result.map( ( { prompt } ) => prompt ) ).toEqual( [ 'First?', 'Last?' ] )
  } )

  it( 'keeps the first 10 questions', () => {
    const questions = Array.from(
      { length: 12 },
      ( _, index ) => question( { prompt: `Q${ index }?` } ),
    )
    const result = processQuestions( { questions }, body )

    expect( result ).toHaveLength( 10 )
    expect( result[ 9 ]?.prompt ).toBe( 'Q9?' )
  } )

  it( 'counts the cap after dropping empty questions', () => {
    const questions = [
      question( { prompt: '' } ),
      ...Array.from( { length: 10 }, ( _, index ) => question( { prompt: `Q${ index }?` } ) ),
    ]

    expect( processQuestions( { questions }, body ) ).toHaveLength( 10 )
  } )

  it( 'keeps a passage that is in the body', () => {
    const [ first ] = processQuestions(
      { questions: [ question( { passage: 'A typeof check narrows it.' } ) ] },
      body,
    )

    expect( first?.passage ).toBe( 'A typeof check narrows it.' )
  } )

  it( 'keeps a passage that matches once whitespace is normalised, as the model wrote it', () => {
    const passage = 'Narrowing  refines a union type\r\ninside a branch.'
    const [ first ] = processQuestions( { questions: [ question( { passage } ) ] }, body )

    expect( first?.passage ).toBe( passage )
  } )

  it( 'empties a passage that is not in the body', () => {
    const [ first ] = processQuestions(
      { questions: [ question( { passage: 'Something the note never says.' } ) ] },
      body,
    )

    expect( first?.passage ).toBe( '' )
  } )

  it( 'leaves an empty passage empty', () => {
    expect( processQuestions( { questions: [ question() ] }, body )[ 0 ]?.passage ).toBe( '' )
  } )

  it( 'returns an empty list when every question is dropped', () => {
    expect( processQuestions( { questions: [ question( { prompt: '' } ) ] }, body ) ).toEqual( [] )
  } )
} )
