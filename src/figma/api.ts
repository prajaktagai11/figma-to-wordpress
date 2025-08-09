import axios from 'axios'
import type { FigmaNode } from '../types.js'

const FIGMA_BASE = 'https://api.figma.com/v1'

export async function fetchFile (fileKey: string, token: string) {
  const res = await axios.get(`${FIGMA_BASE}/files/${fileKey}`, {
    headers: { 'X-Figma-Token': token }
  })
  return res.data
}

export async function fetchImageUrls (fileKey: string, token: string, nodeIds: string[], format: string = 'png', scale: number = 2) {
  if (!nodeIds.length) return {}
  const res = await axios.get(`${FIGMA_BASE}/images/${fileKey}`, {
    params: { ids: nodeIds.join(','), format, scale },
    headers: { 'X-Figma-Token': token }
  })
  return res.data.images as Record<string, string>
}

export function flattenNodes (node: any, acc: FigmaNode[] = []): FigmaNode[] {
  acc.push(node)
  if (node.children) {
    for (const c of node.children) flattenNodes(c, acc)
  }
  return acc
}