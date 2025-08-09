#!/usr/bin/env node
import { Command } from 'commander'
import { config as loadEnv } from 'dotenv'
import { generateTheme } from '../src/generateTheme.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

loadEnv()

const program = new Command()
program
  .name('figma2wp')
  .description('Convert a Figma file into a WordPress block theme')
  .requiredOption('--file <fileKey>', 'Figma file key')
  .option('--out <dir>', 'Output directory', './dist-output')
  .option('--name <slug>', 'Theme slug', 'figma-theme')
  .option('--config <file>', 'Mapping rules JSON file', '')
  .option('--verbose', 'Verbose logging', false)

program.parse(process.argv)
const opts = program.opts()

async function run () {
  try {
    if (!process.env.FIGMA_TOKEN) {
      console.error(chalk.red('Missing FIGMA_TOKEN env variable'))
      process.exit(1)
    }
    const result = await generateTheme({
      fileKey: opts.file,
      outputDir: opts.out,
      themeSlug: opts.name,
      mappingConfigPath: opts.config || undefined,
      verbose: !!opts.verbose,
      figmaToken: process.env.FIGMA_TOKEN
    })
    console.log(chalk.green(`Theme generated at: ${path.resolve(result.themePath)}`))
    console.log(chalk.green(`ZIP archive: ${result.zipPath}`))
  } catch (e: any) {
    console.error(chalk.red('Generation failed:'), e.message)
    if (opts.verbose) console.error(e)
    process.exit(1)
  }
}
run()