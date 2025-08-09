import { generateTheme } from './generateTheme.js'

async function main () {
  if (!process.env.FIGMA_TOKEN) {
    console.error('Set FIGMA_TOKEN in .env')
    return
  }
  await generateTheme({
    fileKey: 'REPLACE_WITH_FILE_KEY',
    figmaToken: process.env.FIGMA_TOKEN,
    outputDir: './out',
    themeSlug: 'figma-theme',
    verbose: true
  })
}

main()