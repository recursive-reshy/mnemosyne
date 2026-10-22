// Packages
import { describe, it, expect } from 'vitest'
// Melete
import { isBlankAnswer } from './grading.js'

describe( 'isBlankAnswer', () => {
  it.each( [
    '',
    '   ',
    '\n\t',
    'idk',
    'IDK',
    'I don\'t know',
    'i dont know',
    'I don’t know.',
    'no idea',
    'No idea.',
    'pass',
    '?',
    '???',
  ] )( 'treats %j as no answer', ( answer ) => {
    expect( isBlankAnswer( answer ) ).toBe( true )
  } )

  it.each( [
    'I don\'t know the exact value but it is 4',
    'pass by reference',
    'idk maybe a closure',
    'No idea what a monad is, but it chains',
    'It narrows the type',
  ] )( 'treats %j as an answer', ( answer ) => {
    expect( isBlankAnswer( answer ) ).toBe( false )
  } )
} )
