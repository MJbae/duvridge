import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const manifestName = '.book-content-inputs.json'
// Migrate earlier generated manifests without losing their safe cleanup boundary.
const legacyManifestName = '.memoir-content-manifest.json'
const ownedPath = filename => typeof filename === 'string' && !filename.split('/').some(part => !part || part === '..' || part === '.')
  && (filename.endsWith('.md') && !filename.includes('/') && filename !== 'README.md'
    || filename.startsWith('원자료/')
    || filename.startsWith('content/') && !filename.startsWith('content/narration/')
    || filename.startsWith('site/public/') && !filename.startsWith('site/public/record/'))

/** Copy a selected book into disposable app inputs without touching recordings. */
export function materializeBookContent(appRoot, { source, book } = {}) {
  if (!source) throw new Error('책 원본 경로를 지정하세요.')
  source = path.resolve(source)
  appRoot = path.resolve(appRoot)
  if (source === appRoot) throw new Error('책 원본과 앱 작업 사본은 다른 경로여야 합니다.')
  const metadataFile = path.join(source, 'book.json')
  book ??= existsSync(metadataFile) ? JSON.parse(readFileSync(metadataFile, 'utf8')) : {}
  const manuscript = book.manuscript ?? 'manuscript.md'
  if (typeof manuscript !== 'string' || !/^[^/\\]+\.md$/u.test(manuscript) || manuscript.startsWith('.'))
    throw new Error('책 원고는 책 루트의 Markdown 파일이어야 합니다.')
  const inputs = new Map()
  const add = (input, output) => {
    if (!ownedPath(output)) throw new Error(`공통 자료 생성 경로가 안전하지 않습니다: ${output}`)
    if (inputs.has(output)) throw new Error(`책 자료의 생성 경로가 중복되었습니다: ${output}`)
    inputs.set(output, input)
  }
  const visit = (inputDirectory, outputDirectory) => {
    const fullDirectory = path.join(source, inputDirectory)
    if (!existsSync(fullDirectory)) return
    if (lstatSync(fullDirectory).isSymbolicLink()) throw new Error(`책 자료에는 심볼릭 링크를 사용할 수 없습니다: ${inputDirectory}`)
    for (const entry of readdirSync(fullDirectory, { withFileTypes: true })) {
      const input = path.posix.join(inputDirectory, entry.name)
      const output = path.posix.join(outputDirectory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`책 자료에는 심볼릭 링크를 사용할 수 없습니다: ${input}`)
      if (entry.isDirectory()) visit(input, output)
      else if (entry.isFile()) add(input, output)
    }
  }
  add(manuscript, 'manuscript.md')
  if (existsSync(metadataFile)) add('book.json', 'content/book.json')
  for (const [input, output] of [
    ['illustrations/manifest.json', 'content/episode-illustrations.json'],
    ['music/manifest.json', 'content/music.json'],
  ]) if (existsSync(path.join(source, input))) add(input, output)
  for (const [input, output] of [
    ['illustrations/source-images', 'content/illustration-sources'],
    ['references/images', 'content/ref_images'],
    ['references/documents', '원자료'],
    ['editorial-notes', 'content/editorial-notes'],
    ['public', 'site/public'],
    ['music/tracks', 'site/public/music'],
  ]) visit(input, output)
  const files = [...inputs.keys()].sort()
  const manifestFile = path.join(appRoot, manifestName)
  const legacyManifestFile = path.join(appRoot, legacyManifestName)
  const previousFile = existsSync(manifestFile) ? manifestFile : legacyManifestFile
  const previous = existsSync(previousFile) ? JSON.parse(readFileSync(previousFile, 'utf8')) : { version: 1, files: [] }
  if (previous.version !== 1 || !Array.isArray(previous.files) || previous.files.some(filename => !ownedPath(filename)))
    throw new Error('공통 자료 생성 목록의 경로가 안전하지 않습니다.')
  // Read every source before deleting or replacing app inputs.
  for (const input of inputs.values()) {
    const relative = path.relative(source, path.resolve(source, input))
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('책 자료의 원본 경로가 안전하지 않습니다.')
    const inputFile = path.join(source, input)
    if (lstatSync(inputFile).isSymbolicLink() || !lstatSync(inputFile).isFile()) throw new Error(`책 자료에는 일반 파일만 사용할 수 있습니다: ${input}`)
    const resolved = path.relative(realpathSync(source), realpathSync(inputFile))
    if (resolved.startsWith('..') || path.isAbsolute(resolved)) throw new Error('책 자료의 원본 경로가 안전하지 않습니다.')
    readFileSync(path.join(source, input))
  }
  for (const filename of previous.files)
    if (!inputs.has(filename)) rmSync(path.join(appRoot, filename), { force: true })
  for (const filename of files) {
    const target = path.join(appRoot, filename)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(path.join(source, inputs.get(filename)), target)
  }
  writeFileSync(manifestFile, `${JSON.stringify({ version: 1, files }, null, 2)}\n`)
  if (existsSync(legacyManifestFile)) rmSync(legacyManifestFile)
  return files
}

export const materializeContent = materializeBookContent
