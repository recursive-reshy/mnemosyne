import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { route } from './server.mjs'

const post = ( body ) => route( 'POST', '/v1/messages', typeof body === 'string' ? body : JSON.stringify( body ) )
const summaryRequest = { model: 'fake-sonnet', max_tokens: 100, messages: [ { role: 'user', content: 'x' } ] }
const linkerRequest = {
  ...summaryRequest,
  tools: [ { name: 'list_notes' }, { name: 'submit_suggestions' } ],
}

describe( 'pages', () => {
  it( 'serves two articles as HTML with enough text to read', () => {
    for( const path of [ '/article', '/article-2' ] ) {
      const response = route( 'GET', path )

      assert.equal( response.status, 200 )
      assert.match( response.headers[ 'content-type' ], /^text\/html/ )
      assert.match( response.body, /<article>/ )
      assert.ok( response.body.length > 1500 )
    }
  } )

  it( 'serves an RSS feed of two items linking to the articles', () => {
    const response = route( 'GET', '/feed.xml' )

    assert.equal( response.status, 200 )
    assert.match( response.headers[ 'content-type' ], /xml/ )
    assert.equal( response.body.match( /<item>/g )?.length, 2 )
    assert.match( response.body, /<link>http:\/\/fakes:4000\/article<\/link>/ )
    assert.match( response.body, /<link>http:\/\/fakes:4000\/article-2<\/link>/ )
  } )

  it( 'answers /health with 200, standing in for whisper-server', () => {
    assert.equal( route( 'GET', '/health' ).status, 200 )
  } )

  it( 'answers 400 to an unknown path or method', () => {
    assert.equal( route( 'GET', '/nope' ).status, 400 )
    assert.equal( route( 'POST', '/article' ).status, 400 )
    assert.equal( route( 'GET', '/v1/messages' ).status, 400 )
  } )
} )

describe( 'GET /v1/models', () => {
  it( 'lists a Sonnet and a Haiku the summarizer can use', () => {
    const response = route( 'GET', '/v1/models' )
    const { data } = JSON.parse( response.body )

    assert.equal( response.status, 200 )
    assert.equal( data.length, 2 )
    assert.ok( data.some( ( model ) => /sonnet/.test( model.id ) ) )
    assert.ok( data.some( ( model ) => /haiku/.test( model.id ) ) )

    for( const model of data ) {
      assert.equal( model.type, 'model' )
      assert.equal( model.capabilities.structured_outputs.supported, true )
      assert.equal( model.capabilities.effort.medium.supported, true )
      assert.ok( model.max_tokens > 0 )
    }
  } )
} )

describe( 'POST /v1/messages without tools (the summarizer)', () => {
  it( 'answers with an article summary as JSON text', () => {
    const response = post( summaryRequest )
    const message = JSON.parse( response.body )
    const summary = JSON.parse( message.content[ 0 ].text )

    assert.equal( response.status, 200 )
    assert.equal( message.type, 'message' )
    assert.equal( message.role, 'assistant' )
    assert.equal( message.stop_reason, 'end_turn' )
    assert.equal( message.content[ 0 ].type, 'text' )
    assert.ok( message.usage.input_tokens > 0 && message.usage.output_tokens > 0 )
    assert.deepEqual( Object.keys( summary ).sort(), [ 'key_points', 'overview', 'quotes', 'tags' ] )
    assert.equal( typeof summary.overview, 'string' )

    for( const list of [ summary.key_points, summary.quotes, summary.tags ] ) {
      assert.ok( list.length > 0 )
      assert.ok( list.every( ( item ) => typeof item === 'string' ) )
    }
  } )
} )

describe( 'POST /v1/messages with tools (the linker)', () => {
  it( 'submits two suggestions whose anchors are phrases of the summary', () => {
    const summary = JSON.parse( JSON.parse( post( summaryRequest ).body ).content[ 0 ].text )
    const text = [ summary.overview, ...summary.key_points, ...summary.quotes ].join( ' ' )
    const response = post( linkerRequest )
    const message = JSON.parse( response.body )
    const block = message.content.find( ( item ) => item.type === 'tool_use' )

    assert.equal( response.status, 200 )
    assert.equal( message.stop_reason, 'tool_use' )
    assert.equal( block.name, 'submit_suggestions' )
    assert.equal( block.input.suggestions.length, 2 )

    for( const suggestion of block.input.suggestions ) {
      assert.ok( suggestion.target.length > 0 )
      assert.ok( text.includes( suggestion.anchor ), `${ suggestion.anchor } is not in the summary` )
    }
  } )
} )

describe( 'unexpected requests', () => {
  it( 'answers 400 with an error body to a body that is not JSON', () => {
    const response = post( 'not json' )

    assert.equal( response.status, 400 )
    assert.equal( JSON.parse( response.body ).type, 'error' )
  } )

  it( 'answers 400 to a request without a model', () => {
    assert.equal( post( { messages: [] } ).status, 400 )
  } )

  it( 'answers 400 to a tools list without submit_suggestions', () => {
    const response = post( { ...summaryRequest, tools: [ { name: 'list_notes' } ] } )

    assert.equal( response.status, 400 )
    assert.match( JSON.parse( response.body ).error.message, /submit_suggestions/ )
  } )
} )
