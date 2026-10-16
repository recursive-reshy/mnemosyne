// Packages
import { notifyManager } from '@tanstack/react-query'
// Testing Library
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
// Vitest
import { afterEach } from 'vitest'

// Hand results to React from a microtask, so fake timers don't hold them back.
notifyManager.setScheduler( ( callback ) => queueMicrotask( callback ) )

// CodeMirror measures text with Range geometry, which jsdom doesn't implement.
Range.prototype.getClientRects = (): DOMRectList => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect()

afterEach( () => {
  cleanup()
} )
