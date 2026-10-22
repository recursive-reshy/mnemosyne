// Packages
import { describe, it, expect } from 'vitest'
// Melete
import { obsidianUrl } from './obsidian.js'

describe( 'obsidianUrl', () => {
  it( 'is null when the vault name is not set', () => {
    expect( obsidianUrl( undefined, 'Learning/Rust/Ownership.md' ) ).toBeNull()
    expect( obsidianUrl( null, 'Learning/Rust/Ownership.md' ) ).toBeNull()
  } )

  it( 'opens the note by vault name and path without the extension', () => {
    expect( obsidianUrl( 'Brain', 'Learning/Rust/Ownership.md' ) )
      .toBe( 'obsidian://open?vault=Brain&file=Learning%2FRust%2FOwnership' )
  } )

  it( 'encodes spaces, hashes and non-ASCII characters in both parts', () => {
    expect( obsidianUrl( 'My Vault', 'Learning/C# Notes/Café.md' ) )
      .toBe( 'obsidian://open?vault=My%20Vault&file=Learning%2FC%23%20Notes%2FCaf%C3%A9' )
  } )

  it( 'only drops a final .md', () => {
    expect( obsidianUrl( 'Brain', 'Learning/a.md.md' ) )
      .toBe( 'obsidian://open?vault=Brain&file=Learning%2Fa.md' )
  } )
} )
