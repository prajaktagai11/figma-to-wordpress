import type { IntermediateTokenSet } from '../types.js'

export function buildThemeJson (tokens: IntermediateTokenSet) {
  return {
    $schema: 'https://schemas.wp.org/trunk/theme.json',
    version: 2,
    settings: {
      color: {
        palette: tokens.colors.map(c => ({
          name: c.name,
            slug: slugify(c.name),
            color: c.value
        }))
      },
      typography: {
        fontFamilies: [],
        fontSizes: tokens.typography.map(t => ({
          name: t.name,
          slug: slugify(t.name),
          size: (t.fontSize || 16) + 'px'
        }))
      }
    },
    styles: {
      typography: {
        fontFamily: 'system-ui, sans-serif'
      }
    }
  }
}

function slugify (s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}