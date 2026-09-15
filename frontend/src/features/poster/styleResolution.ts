import type { GlobalStyle, StyleOverride } from './posterTypes'

export interface ResolvedStyle {
  backgroundColor: string
  textColor: string
  borderColor: string
  borderWidth: number
  fontFamily: string
}

/** "Use global" is simply an absent (null/undefined) override field. */
export function resolveStyle(style: StyleOverride | undefined, global: GlobalStyle): ResolvedStyle {
  const s = style ?? {}
  return {
    backgroundColor: s.backgroundColor ?? 'transparent',
    textColor: s.textColor ?? global.textColor,
    borderColor: s.borderColor ?? global.borderColor,
    borderWidth: s.borderWidth ?? global.borderWidth,
    fontFamily: s.fontFamily ?? global.fontFamily,
  }
}
