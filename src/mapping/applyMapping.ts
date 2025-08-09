import type { FigmaNode, MappingRule } from '../types.js'

export function findRule (node: FigmaNode, rules: MappingRule[]): MappingRule | null {
  for (const r of rules) {
    if (r.match.nodeType && r.match.nodeType !== node.type) continue
    if (r.match.nameRegex) {
      const reg = new RegExp(r.match.nameRegex)
      if (!reg.test(node.name)) continue
    }
    return r
  }
  return null
}

export interface BlockNode {
  block: string
  attributes?: Record<string, any>
  content?: string
  children?: BlockNode[]
  rawHtml?: string
}

export function nodeToBlock (node: FigmaNode, rules: MappingRule[]): BlockNode | null {
  const rule = findRule(node, rules)
  if (!rule) {
    if (node.children?.length) {
      return {
        block: 'group',
        children: node.children.map(c => nodeToBlock(c, rules)).filter(Boolean) as BlockNode[]
      }
    }
    return null
  }

  if (rule.block === 'heading') {
    const levelMatch = node.name.match(/^H([1-6])$/)
    const level = levelMatch ? parseInt(levelMatch[1], 10) : 2
    return {
      block: 'heading',
      attributes: { level },
      content: node.characters || ''
    }
  }

  if (rule.block === 'paragraph') {
    return {
      block: 'paragraph',
      content: node.characters || ''
    }
  }

  if (rule.block === 'group') {
    return {
      block: 'group',
      children: (node.children || []).map(c => nodeToBlock(c, rules)).filter(Boolean) as BlockNode[]
    }
  }

  if (rule.block === 'image') {
    return {
      block: 'image',
      attributes: { alt: node.name, id: node.id }
    }
  }

  return null
}

export function buildBlockMarkup (b: BlockNode): string {
  if (b.rawHtml) return b.rawHtml
  const attrs = b.attributes && Object.keys(b.attributes).length
    ? ' ' + JSON.stringify(b.attributes)
    : ''
  switch (b.block) {
    case 'heading':
      return `<!-- wp:heading${attrs} -->\n<h${b.attributes?.level || 2}>${escapeHtml(b.content || '')}</h${b.attributes?.level || 2}>\n<!-- /wp:heading -->`
    case 'paragraph':
      return `<!-- wp:paragraph -->\n<p>${escapeHtml(b.content || '')}</p>\n<!-- /wp:paragraph -->`
    case 'group':
      return `<!-- wp:group -->\n<div class="wp-block-group">\n${(b.children || []).map(buildBlockMarkup).join('\n')}\n</div>\n<!-- /wp:group -->`
    case 'image':
      // Placeholder src – actual file copy handled elsewhere
      return `<!-- wp:image ${attrs} -->\n<figure class="wp-block-image"><img alt="${escapeHtml(b.attributes?.alt || '')}" data-figma-id="${b.attributes?.id}" /></figure>\n<!-- /wp:image -->`
    default:
      return `<!-- wp:html -->Unsupported block: ${b.block}<!-- /wp:html -->`
  }
}

function escapeHtml (s: string) {
  return s.replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c] as string))
}