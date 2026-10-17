// Packages
import { notifyManager } from '@tanstack/react-query'
// Testing Library
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
// Vitest
import { afterEach, beforeEach } from 'vitest'
// App
import { mockMatchMedia } from './matchMedia'

// Hand results to React from a microtask, so fake timers don't hold them back.
notifyManager.setScheduler( ( callback ) => queueMicrotask( callback ) )

// CodeMirror measures text with Range geometry, which jsdom doesn't implement.
Range.prototype.getClientRects = (): DOMRectList => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect()

// Radix Select (MDXEditor's block type dropdown) needs these, and jsdom doesn't implement them.
Element.prototype.hasPointerCapture = (): boolean => false
Element.prototype.setPointerCapture = (): void => undefined
Element.prototype.releasePointerCapture = (): void => undefined
Element.prototype.scrollIntoView = (): void => undefined

// The link dialog's popover (floating-ui) observes its size.
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// jsdom has no matchMedia: default to a wide window and a light OS; tests can override it.
beforeEach( () => {
  mockMatchMedia()
} )

afterEach( () => {
  cleanup()
} )
