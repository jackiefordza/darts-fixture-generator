import '@testing-library/jest-dom/vitest'

/**
 * jsdom (as pinned here) implements neither the PointerEvent constructor nor the pointer
 * capture methods, which the poster editor's drag/resize/selection interactions rely on.
 * Every real browser has supported both for years - this is purely a test-environment gap -
 * so polyfill them minimally rather than testing pointer interactions in a way that can't
 * reflect real usage.
 */
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? 'mouse'
      this.isPrimary = params.isPrimary ?? true
    }
  }
  // @ts-expect-error - a minimal polyfill, not a complete PointerEvent implementation.
  window.PointerEvent = PointerEventPolyfill
}

if (typeof Element !== 'undefined') {
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
}
