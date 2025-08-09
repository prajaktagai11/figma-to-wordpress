export interface FigmaColor {
  r: number
  g: number
  b: number
  a: number
}

export interface FigmaPaint {
  type: string
  color?: FigmaColor
  opacity?: number
}

export interface FigmaTextStyle {
  fontFamily?: string
  fontPostScriptName?: string
  fontSize?: number
  fontWeight?: number
  lineHeightPx?: number
  letterSpacing?: number
  name?: string
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  absoluteBoundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
  fills?: FigmaPaint[]
  strokes?: FigmaPaint[]
  characters?: string
  style?: any
  styles?: Record<string, string>
  componentPropertyReferences?: Record<string, string>
}

export interface IntermediateTokenSet {
  colors: Array<{ name: string, value: string }>
  typography: Array<{
    name: string
    fontFamily?: string
    fontSize?: number
    lineHeight?: number
    fontWeight?: number
  }>
}

export interface IntermediatePage {
  name: string
  slug: string
  frames: FigmaNode[]
}

export interface IntermediateModel {
  tokens: IntermediateTokenSet
  pages: IntermediatePage[]
  components: FigmaNode[]
  images: Array<{ id: string, name: string, url: string }>
}

export interface MappingRule {
  match: {
    nodeType?: string
    nameRegex?: string
  }
  block: string
  attributes?: Record<string, any>
}

export interface ThemeGenerationOptions {
  fileKey: string
  figmaToken: string
  outputDir: string
  themeSlug: string
  mappingConfigPath?: string
  verbose?: boolean
}