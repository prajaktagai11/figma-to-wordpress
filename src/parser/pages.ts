import slugify from '../util/slugify.js'
import type { IntermediatePage } from '../types.js'

export function extractPages (file: any): IntermediatePage[] {
  const pages: IntermediatePage[] = []
  for (const page of file.document.children) {
    const topFrames = page.children?.filter((n: any) => n.type === 'FRAME' || n.type === 'GROUP') || []
    pages.push({
      name: page.name,
      slug: slugify(page.name),
      frames: topFrames
    })
  }
  return pages
}