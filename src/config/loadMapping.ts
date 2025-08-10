import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MappingRule } from '../types.js'

export interface MappingConfig {
  rules: MappingRule[]
}

/**
 * Loads mapping rules from a JSON file.
 * Accepts two JSON shapes:
 * 1. An array of MappingRule: [{ match: {...}, block: "..." }, ...]
 * 2. An object with rules array: { "rules": [...] }
 * 
 * @param configPath - Path to the mapping configuration file
 * @returns Array of MappingRule objects, empty array if file missing/malformed
 */
export function loadMapping(configPath?: string): MappingRule[] {
  // Determine the default path - look for mapping.rules.json in the same directory as the config folder
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const defaultPath = path.resolve(currentDir, 'mapping.rules.json')
  const filePath = configPath || defaultPath

  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: Mapping config file not found at ${filePath}. Using empty rules.`)
      return []
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(content)

    // Handle array format: [{ match: {...}, block: "..." }, ...]
    if (Array.isArray(parsed)) {
      if (parsed.every(isValidMappingRule)) {
        return parsed
      } else {
        console.warn(`Warning: Invalid mapping rule format in ${filePath}. Using empty rules.`)
        return []
      }
    }

    // Handle object format: { "rules": [...] }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rules)) {
      if (parsed.rules.every(isValidMappingRule)) {
        return parsed.rules
      } else {
        console.warn(`Warning: Invalid mapping rule format in ${filePath}. Using empty rules.`)
        return []
      }
    }

    console.warn(`Warning: Unrecognized mapping config format in ${filePath}. Expected array or object with 'rules' property. Using empty rules.`)
    return []

  } catch (error) {
    console.warn(`Warning: Failed to read or parse mapping config from ${filePath}: ${error instanceof Error ? error.message : String(error)}. Using empty rules.`)
    return []
  }
}

/**
 * Validates if an object is a valid MappingRule
 */
function isValidMappingRule(obj: any): obj is MappingRule {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.match &&
    typeof obj.match === 'object' &&
    typeof obj.block === 'string'
  )
}