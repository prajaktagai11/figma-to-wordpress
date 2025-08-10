import fs from 'node:fs'
import path from 'node:path'
import { fetchFile } from './figma/api.js'
import { extractTokens } from './parser/tokens.js'
import { extractPages } from './parser/pages.js'
import { buildThemeJson } from './generator/themeJson.js'
import { buildTemplateHtml } from './generator/templates.js'
import { zipDirectory } from './generator/zip.js'
import { loadMapping } from './config/loadMapping.js'
import type { ThemeGenerationOptions, MappingRule } from './types.js'
import chalk from 'chalk'

export async function generateTheme (opts: ThemeGenerationOptions) {
  const { fileKey, figmaToken, outputDir, themeSlug, mappingConfigPath, verbose } = opts
  if (verbose) console.log(chalk.gray('Fetching Figma file...'))
  const file = await fetchFile(fileKey, figmaToken)
  const tokens = extractTokens(file)
  const pages = extractPages(file)

  // Load mapping rules using the robust loader
  const rules: MappingRule[] = loadMapping(mappingConfigPath)
  
  if (verbose) {
    console.log(chalk.gray(`Loaded ${rules.length} mapping rules`))
  }

  const themeDir = path.join(outputDir, themeSlug)
  fs.mkdirSync(themeDir, { recursive: true })
  fs.mkdirSync(path.join(themeDir, 'templates'), { recursive: true })
  fs.mkdirSync(path.join(themeDir, 'parts'), { recursive: true })
  fs.mkdirSync(path.join(themeDir, 'patterns'), { recursive: true })
  fs.mkdirSync(path.join(themeDir, 'assets', 'images'), { recursive: true })

  // theme.json
  fs.writeFileSync(path.join(themeDir, 'theme.json'), JSON.stringify(buildThemeJson(tokens), null, 2))

  // style.css
  fs.writeFileSync(path.join(themeDir, 'style.css'), `/*
Theme Name: ${themeSlug}
Author: figma2wp
Version: 0.1.0
Requires at least: 6.0
*/`)

  // templates
  for (const page of pages) {
    const html = buildTemplateHtml(page, rules)
    // basic mapping: first page -> front-page
    let filename = `${page.slug}.html`
    if (page.slug.match(/home|front|index/)) filename = 'front-page.html'
    fs.writeFileSync(path.join(themeDir, 'templates', filename), html)
  }

  // basic index fallback
  const indexPath = path.join(themeDir, 'templates', 'index.html')
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, '<!-- wp:paragraph --><p>Index fallback.</p><!-- /wp:paragraph -->')
  }

  // header/footer stubs if absent
  fs.writeFileSync(path.join(themeDir, 'parts', 'header.html'), '<!-- wp:group --><div class="wp-block-group"><p>Header</p></div><!-- /wp:group -->')
  fs.writeFileSync(path.join(themeDir, 'parts', 'footer.html'), '<!-- wp:group --><div class="wp-block-group"><p>Footer</p></div><!-- /wp:group -->')

  // functions.php (register pattern placeholder)
  fs.writeFileSync(path.join(themeDir, 'functions.php'), `<?php
/**
 * Theme setup
 */
add_action('init', function() {
  // Register patterns or additional supports here.
});
`)

  // zip
  const zipPath = path.join(outputDir, `${themeSlug}.zip`)
  await zipDirectory(themeDir, zipPath)

  return {
    themePath: themeDir,
    zipPath
  }
}