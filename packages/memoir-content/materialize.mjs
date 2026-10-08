import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const contentRoot = path.dirname(fileURLToPath(import.meta.url))
const manifestName = '.memoir-content-manifest.json'
const ownedPath = filename => typeof filename === 'string' && !filename.split('/').some(part => !part || part === '..' || part === '.')
  && (filename.endsWith('.md') && !filename.includes('/') && filename !== 'README.md'
    || filename.startsWith('원자료/')
    || filename.startsWith('content/') && !filename.startsWith('content/narration/')
    || filename.startsWith('site/public/') && !filename.startsWith('site/public/record/'))

/** Disposable app inputs preserve existing tools; only files in our manifest may be removed. */
export function materializeContent(appRoot, { source = contentRoot } = {}) {
  const files = []
  const visit = directory => {
    if (!existsSync(path.join(source, directory))) return
    for (const entry of readdirSync(path.join(source, directory), { withFileTypes: true })) {
      const filename = path.posix.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`공통 자료에는 심볼릭 링크를 사용할 수 없습니다: ${filename}`)
      if (entry.isDirectory()) visit(filename)
      else if (entry.isFile() && ownedPath(filename)) files.push(filename)
    }
  }
  for (const entry of readdirSync(source, { withFileTypes: true }))
    if (entry.isFile() && ownedPath(entry.name)) files.push(entry.name)
  for (const directory of ['content', '원자료', 'site/public']) visit(directory)
  files.sort()
  const manifestFile = path.join(appRoot, manifestName)
  const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { version: 1, files: [] }
  if (previous.version !== 1 || !Array.isArray(previous.files) || previous.files.some(filename => !ownedPath(filename)))
    throw new Error('공통 자료 생성 목록의 경로가 안전하지 않습니다.')
  // A recording or its subtitle is never owned by this package, even if a manifest is corrupt.
  for (const filename of previous.files)
    if (!files.includes(filename)) rmSync(path.join(appRoot, filename), { force: true })
  for (const filename of files) {
    const target = path.join(appRoot, filename)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(path.join(source, filename), target)
  }
  writeFileSync(manifestFile, `${JSON.stringify({ version: 1, files }, null, 2)}\n`)
  return files
}
