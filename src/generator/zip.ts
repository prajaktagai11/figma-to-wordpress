import fs from 'node:fs'
import path from 'node:path'
import archiver from 'archiver'

export async function zipDirectory (srcDir: string, outFile: string) {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outFile)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => resolve())
    archive.on('error', err => reject(err))

    archive.pipe(output)
    archive.directory(srcDir, false)
    archive.finalize()
  })
}