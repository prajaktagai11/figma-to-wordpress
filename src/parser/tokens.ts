import type { IntermediateTokenSet } from '../types.js'

function rgbaToHex (r: number, g: number, b: number, a: number) {
  const to255 = (v: number) => Math.round(v * 255)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  if (a === 1) {
    return `#${hex(to255(r))}${hex(to255(g))}${hex(to255(b))}`
  }
  return `#${hex(to255(r))}${hex(to255(g))}${hex(to255(b))}${hex(to255(a))}`
}

export function extractTokens (file: any): IntermediateTokenSet {
  const styles = file.styles || {}
  const colorStyles: Array<{name: string, value: string}> = []
  const typography: IntermediateTokenSet['typography'] = []

  for (const [id, style] of Object.entries<any>(styles)) {
    if (style.styleType === 'FILL') {
      // Need to find a node referencing this style to get actual color; fallback
      // MVP: derive hex from first referenced paint later (placeholder)
      colorStyles.push({ name: style.name, value: 'var(--pending-color)' })
    } else if (style.styleType === 'TEXT') {
      typography.push({
        name: style.name,
        fontFamily: undefined,
        fontSize: undefined,
        lineHeight: undefined,
        fontWeight: undefined
      })
    }
  }

  return {
    colors: colorStyles,
    typography
  }
}

export function resolvePaintToHex (paint: any): string | null {
  if (!paint || paint.type !== 'SOLID') return null
  return rgbaToHex(paint.color.r, paint.color.g, paint.color.b, paint.opacity ?? 1)
}