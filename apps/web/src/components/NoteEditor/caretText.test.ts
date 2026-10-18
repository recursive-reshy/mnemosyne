// Vitest
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
// App
import { sourceLineText } from './caretText'

const lines = [
  '---',
  'title: "A talk"',
  'duration: "20:00"',
  '---',
  '',
  '- Point ([13:20](https://youtu.be/abc?t=800))',
  'Plain line',
]

const render = ( activeIndex: number, { focused = true, from = 0 } = {} ): HTMLElement => {
  const root = document.createElement( 'div' )
  const rendered = lines.slice( from )

  const markup = rendered.map( ( text, index ) => {
    const active = index + from === activeIndex ? ' cm-activeLine' : ''

    return `<div class="cm-line${ active }">${ text }</div>`
  } ).join( '' )

  root.innerHTML = `<div class="cm-editor${ focused ? ' cm-focused' : '' }">`
    + `<div class="cm-content">${ markup }</div></div>`
  document.body.append( root )

  return root
}

afterEach( () => {
  document.body.replaceChildren()
} )

describe( 'sourceLineText', () => {
  it( 'returns the text of the line the cursor is on', () => {
    expect( sourceLineText( render( 5 ) ) ).toContain( 'Point' )
    expect( sourceLineText( render( 6 ) ) ).toBe( 'Plain line' )
  } )

  it( 'returns null when the source editor has no focus', () => {
    expect( sourceLineText( render( 5, { focused: false } ) ) ).toBeNull()
  } )

  it.each( [ 0, 1, 2, 3 ] )( 'returns null for line %s of the front-matter', ( index ) => {
    expect( sourceLineText( render( index ) ) ).toBeNull()
  } )

  it( 'treats the line after the closing --- as the body', () => {
    expect( sourceLineText( render( 4 ) ) ).toBe( '' )
  } )

  it( 'does not mistake a later --- for front-matter when the top is not rendered', () => {
    expect( sourceLineText( render( 5, { from: 4 } ) ) ).toContain( 'Point' )
  } )

  it( 'does not treat a note without front-matter as having any', () => {
    const root = document.createElement( 'div' )
    root.innerHTML = '<div class="cm-editor cm-focused"><div class="cm-content">'
      + '<div class="cm-line">Intro 1:30</div>'
      + '<div class="cm-line cm-activeLine">Second 2:00</div></div></div>'

    expect( sourceLineText( root ) ).toBe( 'Second 2:00' )
  } )
} )
