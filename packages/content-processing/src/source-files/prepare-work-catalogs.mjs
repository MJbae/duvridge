import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { listBookSources } from './list-book-sources.mjs'
import { materializeBookContent } from './materialize-book-content.mjs'
import { prepareContent, reservedWorkIds } from '../catalog/prepare-reader-content.mjs'

const namespace = (catalog, id) => {
  const rewrite = value => {
    if (typeof value === 'string') return /^\/(?:images|music|record)\//.test(value) ? `/works/${id}${value}` : value
    if (Array.isArray(value)) return value.map(rewrite)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]))
    return value
  }
  return rewrite(catalog)
}

/** Build each work in isolated disposable inputs, keeping its media and catalog distinct. */
export function prepareWorkCatalogs({ repositoryRoot, appRoot, extendCatalog, narrationSource }) {
  const registry = JSON.parse(readFileSync(path.join(repositoryRoot, 'service-registry.json'), 'utf8'))
  const service = registry.services.find(row => path.resolve(repositoryRoot, row.path) === path.resolve(appRoot))
  const sources = listBookSources(repositoryRoot, { directory: process.env.TOLDLIFE_BOOK_CATALOG || registry.bookCatalog.path, ids: service?.books })
  if (!sources.length) throw new Error('공개할 작품 원본이 없습니다.')
  const generated = path.join(appRoot, 'site/.vitepress/generated')
  const workFiles = path.join(generated, 'works')
  const publicWorks = path.join(appRoot, 'site/public/works')
  mkdirSync(workFiles, { recursive: true })
  const previousFile = path.join(generated, 'work-manifest.json')
  const previous = existsSync(previousFile) ? JSON.parse(readFileSync(previousFile, 'utf8')) : []
  if (!Array.isArray(previous) || previous.some(id => typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id) || reservedWorkIds.has(id))) throw new Error('이전 작품 생성 목록이 안전하지 않습니다.')
  const pagesManifestFile = path.join(generated, 'work-pages-manifest.json')
  const ownedPages = existsSync(pagesManifestFile) ? JSON.parse(readFileSync(pagesManifestFile, 'utf8')) : {}
  // Upgrade the earlier single-work generator without claiming hand-written files.
  const oldManifestFile = path.join(generated, 'content-manifest.json')
  let retiredReadFiles = []
  if (existsSync(oldManifestFile)) {
    const old = JSON.parse(readFileSync(oldManifestFile, 'utf8'))
    const directory = old.directory ?? 'read'
    if (!ownedPages[directory]) ownedPages[directory] = old.files
    if (directory === 'read') retiredReadFiles = old.files
  }
  for (const id of previous) {
    const stagedManifest = path.join(appRoot, '.work-inputs', id, 'site/.vitepress/generated/content-manifest.json')
    if (!ownedPages[id] && existsSync(stagedManifest)) ownedPages[id] = JSON.parse(readFileSync(stagedManifest, 'utf8')).files
  }
  for (const files of Object.values(ownedPages)) if (!Array.isArray(files) || files.some(file => typeof file !== 'string' || !/^(?:[a-z0-9][a-z0-9_-]*\.md|assets\/[a-f0-9]+\.[a-z0-9]+)$/.test(file))) throw new Error('이전 작품 페이지 생성 목록이 안전하지 않습니다.')
  const catalogs = {}
  const nextPages = {}
  for (const editorial of sources) {
    const id = editorial.book.id
    const stage = path.join(appRoot, '.work-inputs', id)
    materializeBookContent(stage, editorial)
    const narration = narrationSource?.(editorial)
    // Copy approved inputs; no audio/timing generation is part of a web build.
    for (const [from, to] of Object.entries(narration ?? {})) {
      const target = path.join(stage, to)
      rmSync(target, { recursive: true, force: true })
      if (existsSync(from)) cpSync(from, target, { recursive: true })
    }
    const result = prepareContent({ root: stage, book: editorial.book, extendCatalog })
    const pages = path.join(appRoot, 'site', id)
    const before = ownedPages[id] ?? []
    for (const filename of result.manifest.files) {
      if (existsSync(path.join(pages, filename)) && !before.includes(filename)) throw new Error(`직접 작성한 파일을 덮어쓰지 않습니다: site/${id}/${filename}`)
    }
    cpSync(path.join(stage, 'site', id), pages, { recursive: true })
    for (const filename of before) if (!result.manifest.files.includes(filename)) rmSync(path.join(pages, filename), { force: true })
    nextPages[id] = result.manifest.files
    const media = path.join(publicWorks, id)
    rmSync(media, { recursive: true, force: true })
    cpSync(path.join(stage, 'site/public'), media, { recursive: true })
    // Favicons remain format-level assets; each work keeps its own images, music and recordings.
    for (const file of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'site.webmanifest']) {
      const from = path.join(media, file)
      if (existsSync(from)) cpSync(from, path.join(appRoot, 'site/public', file))
    }
    const catalog = namespace(result.catalog, id)
    catalogs[id] = catalog
    writeFileSync(path.join(workFiles, `${id}.json`), JSON.stringify(catalog, null, 2) + '\n')
  }
  for (const id of previous) if (!Object.hasOwn(catalogs, id)) {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id) || ['index', 'public', 'read', 'watch'].includes(id)) throw new Error('이전 작품 생성 목록이 안전하지 않습니다.')
    for (const filename of ownedPages[id] ?? []) rmSync(path.join(appRoot, 'site', id, filename), { force: true })
    for (const directory of [path.join(appRoot, 'site', id, 'assets'), path.join(appRoot, 'site', id)]) if (existsSync(directory) && !readdirSync(directory).length) rmSync(directory, { recursive: true })
    rmSync(path.join(publicWorks, id), { recursive: true, force: true })
    rmSync(path.join(workFiles, `${id}.json`), { force: true })
  }
  for (const filename of retiredReadFiles) rmSync(path.join(appRoot, 'site/read', filename), { force: true })
  for (const directory of [path.join(appRoot, 'site/read/assets'), path.join(appRoot, 'site/read')]) if (existsSync(directory) && !readdirSync(directory).length) rmSync(directory, { recursive: true })
  writeFileSync(pagesManifestFile, JSON.stringify(nextPages) + '\n')
  writeFileSync(previousFile, JSON.stringify(Object.keys(catalogs)) + '\n')
  writeFileSync(path.join(generated, 'catalogs.json'), JSON.stringify(catalogs, null, 2) + '\n')
  // Transitional build/test API; runtime imports only the selected work file.
  writeFileSync(path.join(generated, 'catalog.json'), JSON.stringify(Object.values(catalogs)[0], null, 2) + '\n')
  return { catalog: Object.values(catalogs)[0], catalogs }
}
