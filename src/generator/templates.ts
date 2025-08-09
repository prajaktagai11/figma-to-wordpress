import { nodeToBlock, buildBlockMarkup, type BlockNode } from '../mapping/applyMapping.js'
import type { IntermediatePage, MappingRule } from '../types.js'

export function buildTemplateHtml (page: IntermediatePage, rules: MappingRule[]): string {
  const blocks: BlockNode[] = []
  for (const frame of page.frames) {
    const b = nodeToBlock(frame as any, rules)
    if (b) blocks.push(b)
  }
  const markup = blocks.map(buildBlockMarkup).join('\n\n')
  return markup
}