import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { parseManuscript } from '../manuscripts/parse-manuscript.mjs'
import { createLegacyEpisodeMaps } from '../manuscripts/episode-ids.mjs'
import { loadEpisodeIllustrations } from '../illustrations/load-illustration-manifest.mjs'
import { loadMusic } from '../background-music/load-music-manifest.mjs'

const projectRoot = process.cwd()
const excludedRootFiles =
  /^(?:readme(?:[._-].*)?|agents|setup(?:[._-].*)?|deployment|deploy|contributing|changelog|license|security|code_of_conduct|운영안내|설치안내)\.md$/i
const validId = /^[a-z0-9][a-z0-9_-]{0,79}$/
export const reservedWorkIds = new Set(['index', 'public', 'read', 'watch', 'assets', 'images', 'music', 'record', 'works', 'brand', 'social', 'novels', 'audiobooks', 'videos', '404', 'memoir'])
const assetExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.avif',
  '.pdf',
  '.txt',
  '.mp3',
  '.mp4',
  '.m4a',
  '.ogg',
  '.wav',
])

const slash = (value) => value.split(path.sep).join('/')
const digest = (value) => createHash('sha256').update(value).digest('hex')
const isInside = (root, candidate) => {
  const relative = path.relative(root, candidate)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** Catalog text is plain text, never a fragment of source HTML or Markdown. */
export function plainText(markdown) {
  return String(markdown)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/~~([\s\S]+?)~~/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|#39);/g,
      (entity) =>
        ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[
          entity
        ]
    )
    .replace(/\s+/g, ' ')
    .trim()
}

const summary = (markdown, limit = 130) => {
  const text = plainText(markdown)
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

const readingMinutes = (markdown) => Math.max(1, Math.ceil(plainText(markdown).length / 500))

function outsideFences(markdown, transform) {
  let fence = null
  return markdown
    .split(/(?<=\n)/)
    .map((line) => {
      const match = line.match(/^\s{0,3}(`{3,}|~{3,})/)
      if (match) {
        if (!fence) fence = match[1]
        else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = null
        return line
      }
      return fence ? line : transform(line)
    })
    .join('')
}

function discover(root, book) {
  const excludedEditorialFiles = new Set((book.excludedEditorialFiles ?? []).map(filename => filename.normalize('NFC').toLowerCase()))
  const isExcludedMarkdown = filename => excludedRootFiles.test(filename) || excludedEditorialFiles.has(filename.normalize('NFC').toLowerCase())
  const sources = readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith('.') &&
        /\.md$/i.test(entry.name) &&
        !isExcludedMarkdown(entry.name)
    )
    .map((entry) => entry.name)
  const contentRoot = path.join(root, 'content')
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink())
        continue
      // Editorial working notes are materialized for local reference, never published documents.
      if (directory === contentRoot && entry.isDirectory() && entry.name === 'editorial-notes')
        continue
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(filename)
      else if (entry.isFile() && /\.md$/i.test(entry.name) && !isExcludedMarkdown(entry.name))
        sources.push(slash(path.relative(root, filename)))
    }
  }
  if (existsSync(contentRoot) && !lstatSync(contentRoot).isSymbolicLink()) visit(contentRoot)
  return sources.sort((a, b) => a.localeCompare(b, 'ko'))
}

const filmIdPattern = /^[a-z0-9][a-z0-9-]{0,40}$/
const filmImagePattern = /^\/images\/films\/[a-z0-9][a-z0-9-]*\.(?:jpg|jpeg|png|webp)$/

/**
 * Films made from a work (book.json `films`): their ids, titles and pictures travel with the work so every
 * format can name them. Their video files are published apart from Git by the video app.
 */
function workFilms(films = []) {
  if (!Array.isArray(films)) throw new Error('book.json의 films는 배열이어야 합니다.')
  const seen = new Set()
  return films.map((film) => {
    if (!filmIdPattern.test(film?.id ?? '') || seen.has(film.id)) throw new Error(`영상 id가 잘못되었거나 겹칩니다: ${film?.id}`)
    seen.add(film.id)
    if (typeof film.title !== 'string' || !film.title.trim()) throw new Error(`영상 제목이 없습니다: ${film.id}`)
    const picture = (key) => {
      const image = film[key]
      if (!filmImagePattern.test(image?.src ?? '') || !(image.width > 0) || !(image.height > 0)) throw new Error(`영상 그림이 잘못되었습니다: ${film.id}.${key}`)
      return { src: image.src, width: image.width, height: image.height, ...(key === 'card' ? { alt: plainText(image.alt || film.title) } : {}) }
    }
    return { id: film.id, title: plainText(film.title), card: picture('card'), poster: picture('poster') }
  })
}

function frontmatter(metadata, content) {
  // JSON values are valid YAML, including Korean text and nested prev/next objects.
  return `---\n${Object.entries(metadata)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n\n${content}`
}

function firstParagraph(markdown) {
  return (
    markdown
      .replace(/^# [^\r\n]+\r?\n/, '')
      .trim()
      .split(/\r?\n\s*\r?\n/)
      .find((paragraph) => !/^#{1,6} /.test(paragraph)) ?? ''
  )
}

function syncReferenceIndex(root, episodes, mainFilename, legacyEpisodes) {
  const filename = path.join(root, 'content/ref_images/episode-map.json')
  if (!existsSync(filename)) return
  const index = JSON.parse(readFileSync(filename, 'utf8'))
  const existing = new Map(index.episodes.map(row => [legacyEpisodes[row.id] || row.id, row]))
  index.episodes = episodes.map(episode => {
    const row = existing.get(episode.id)
    if (!row) throw new Error(`회차의 참고 이미지 인덱스가 없습니다: ${episode.id}`)
    const prefix = { prologue: '프롤로그', epilogue: '에필로그', side: '외전' }[episode.kind]
    return { ...row, id: episode.id, number: episode.number, title: prefix ? `${prefix}. ${episode.title}` : episode.title }
  })
  index.episode_count = episodes.length
  index.manuscript_sha256 = digest(readFileSync(path.join(root, mainFilename)))
  const json = `${JSON.stringify(index, null, 2)}\n`
  const viewerFile = path.join(root, 'content/ref_images/catalog.html')
  let viewer
  if (existsSync(viewerFile)) {
    viewer = readFileSync(viewerFile, 'utf8').replace(
      /(<script[^>]*id="data"[^>]*>)([\s\S]*?)(<\/script>)/,
      (_, start, data, end) => {
        const embedded = JSON.parse(data)
        embedded.episodeMap = index
        return start + JSON.stringify(embedded).replace(/</g, '\\u003c') + end
      }
    )
  }
  if (readFileSync(filename, 'utf8') !== json) writeFileSync(filename, json)
  if (viewer !== undefined && readFileSync(viewerFile, 'utf8') !== viewer) writeFileSync(viewerFile, viewer)
}

export function prepareContent({ root = projectRoot, book, logger = console, extendCatalog } = {}) {
  root = path.resolve(root)
  if (!book) {
    const metadataFile = path.join(root, 'content/book.json')
    book = existsSync(metadataFile) ? JSON.parse(readFileSync(metadataFile, 'utf8')) : {}
  }
  // Source filenames are normalized by materializeBookContent before this stage.
  const mainFilename = 'manuscript.md'
  if (typeof mainFilename !== 'string' || !/^[^/\\]+\.md$/u.test(mainFilename) || mainFilename.startsWith('.'))
    throw new Error('원고 파일은 앱 루트의 Markdown 파일이어야 합니다.')
  const { legacyEpisodes, legacyReadingIds, legacyScrollResetIds } = createLegacyEpisodeMaps(book.legacy)
  // Each work owns one folder of pages: /{work}/ is its home and /{work}/{episode} its episodes.
  const workId = book.id
  if (typeof workId !== 'string' || (!validId.test(workId) || reservedWorkIds.has(workId)))
    throw new Error(`작품 주소로 쓸 책 id가 필요합니다: ${workId}. 영문 소문자·숫자·하이픈·밑줄로 정하세요.`)
  const outputDir = path.join(root, 'site', workId)
  const generatedDir = path.join(root, 'site/.vitepress/generated')
  const manifestFile = path.join(generatedDir, 'content-manifest.json')
  const warnings = []
  const warn = (message) => {
    warnings.push(message)
    logger.warn?.(`[content] ${message}`)
  }
  const sources = discover(root, book)
  if (!sources.includes(mainFilename)) throw new Error(`필수 원본이 없습니다: ${mainFilename}`)

  const loaded = sources
    .map((source) => {
      const parsed = matter(readFileSync(path.join(root, source), 'utf8'))
      return { source, body: parsed.content, data: parsed.data }
    })
    .filter(({ source, data }) => {
      if (data.published === false || data.draft === true) {
        if (source === mainFilename)
          throw new Error('정본 원고는 published: false 또는 draft: true로 숨길 수 없습니다.')
        return false
      }
      return true
    })

  const main = loaded.find(({ source }) => source === mainFilename)
  const structure = parseManuscript(main.body, warn, { legacyEpisodes })
  const illustrations = loadEpisodeIllustrations(root, structure.episodes)
  const music = loadMusic(root, structure.episodes)
  const work = {
    id: workId,
    legacyRoot: Boolean(book.legacy?.servedAtRoot),
    title: plainText(main.data.title || book.work?.title || ''),
    subtitle: plainText(main.data.subtitle || book.work?.subtitle || ''),
    synopsis: (Array.isArray(main.data.synopsis) ? main.data.synopsis : [main.data.synopsis || '']).map(plainText).filter(Boolean),
    episodeCount: structure.episodes.filter(e => e.kind === 'episode').length,
    schedule: plainText(main.data.schedule || ''),
    cover: book.cover,
    sharing: book.sharing,
    films: workFilms(book.films),
  }
  const extension = extendCatalog?.({ root, structure, work, toText: plainText, warn }) ?? { catalog: {}, generated: [] }
  const reservedPageIds = new Set(['index', '404', 'assets', 'life-story', ...Object.keys(legacyEpisodes)])
  const usedIds = new Map()
  const usedFiles = new Map()
  const pages = []
  const sourceUrls = new Map()
  const register = (page) => {
    if (!validId.test(page.id))
      throw new Error(
        `안전하지 않은 문서 id: ${page.id}. 영문 소문자·숫자·하이픈·밑줄로 1~80자 이내로 정하세요.`
      )
    if (!book.legacy?.servedAtRoot && `${workId}-${page.id}`.length > 120) throw new Error(`작품·문서 id가 반응 문서의 120자 한도를 넘습니다: ${workId}-${page.id}`)
    if (page.kind === 'document' && reservedPageIds.has(page.id)) throw new Error(`예약된 문서 id: ${page.id}`)
    if (usedIds.has(page.id))
      throw new Error(`문서 id 중복: ${page.id} (${usedIds.get(page.id)}, ${page.source})`)
    if (usedFiles.has(page.filename))
      throw new Error(
        `생성 경로 중복: ${page.filename} (${usedFiles.get(page.filename)}, ${page.source})`
      )
    usedIds.set(page.id, page.source)
    usedFiles.set(page.filename, page.source)
    pages.push(page)
    return page
  }

  const readingOrder = structure.episodes.map((episode) => {
    const chapter = {
      id: episode.id,
      episodeId: episode.id,
      title: episode.title,
      label: episode.label,
      number: episode.number,
      time: episode.time,
      place: episode.place,
      description: episode.time,
      url: `/${workId}/${episode.id}`,
    }
    register({ ...chapter, filename: `${episode.id}.md`, body: `# ${episode.title}\n\n${episode.body}\n`, kind: 'episode', source: mainFilename })
    return chapter
  })
  const chapters = readingOrder.filter(e => e.number !== null)
  const episodeUrls = new Map(readingOrder.map(episode => [episode.episodeId, episode.url]))
  for (const [old, id] of Object.entries(legacyEpisodes)) {
    if (episodeUrls.has(id)) episodeUrls.set(old, episodeUrls.get(id))
  }
  const legacyIds = Object.fromEntries(Object.entries(legacyReadingIds).filter(([, id]) => readingOrder.some(e => e.id === id)))
  sourceUrls.set(mainFilename, `/${workId}/`)

  const documents = loaded
    .filter(({ source }) => source !== mainFilename)
    .map(({ source, body, data }) => {
      if (data.id !== undefined && typeof data.id !== 'string')
        throw new Error(`문서 id는 문자열이어야 합니다: ${source}`)
      const id = data.id ?? `doc-${digest(source).slice(0, 12)}`
      const firstHeading = body.match(/^# (.+)$/m)?.[1]
      const title = plainText(
        data.title ?? firstHeading ?? path.basename(source, path.extname(source))
      )
      if (!title) throw new Error(`문서 제목이 비어 있습니다: ${source}`)
      const document = {
        id,
        title,
        description: summary(data.description ?? firstParagraph(body)),
        url: `/${workId}/${id}`,
        minutes: readingMinutes(body),
        category: plainText(data.category ?? '가족 자료'),
      }
      if (data.date !== undefined)
        document.date =
          data.date instanceof Date ? data.date.toISOString().slice(0, 10) : plainText(data.date)
      register({ ...document, filename: `${id}.md`, body, kind: 'document', source })
      sourceUrls.set(source, document.url)
      return document
    })

  const assets = new Map()
  function resolveDestination(destination, source) {
    // Explicit manuscript heading IDs continue to refer to the same episode after a rename.
    if (source === mainFilename && destination.startsWith('#')) {
      const episodeUrl = episodeUrls.get(destination.slice(1))
      if (episodeUrl) return episodeUrl
    }
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination)) return destination
    const parts = destination.match(/^([^?#]*)([?#].*)?$/)
    if (!parts?.[1]) return destination
    let localPath
    try {
      localPath = decodeURIComponent(parts[1])
    } catch {
      warn(`링크 경로를 해석하지 못했습니다: ${source} → ${destination}`)
      return destination
    }
    const target = localPath.startsWith('/')
      ? path.resolve(root, `.${localPath}`)
      : path.resolve(root, path.dirname(source), localPath)
    if (!isInside(root, target)) {
      warn(`저장소 밖의 파일 링크는 복사하지 않습니다: ${source} → ${destination}`)
      return destination
    }
    const relative = slash(path.relative(root, target))
    const suffix = parts[2] ?? ''
    if (relative === mainFilename && suffix.startsWith('#')) {
      const episodeUrl = episodeUrls.get(suffix.slice(1))
      if (episodeUrl) return episodeUrl
    }
    if (sourceUrls.has(relative)) return sourceUrls.get(relative) + suffix
    if (/\.md$/i.test(relative)) {
      warn(`공개 자료에서 찾을 수 없는 Markdown 링크: ${source} → ${destination}`)
      return destination
    }
    if (!assetExtensions.has(path.extname(target).toLowerCase())) return destination
    if (!existsSync(target)) {
      warn(`첨부파일이 없습니다: ${source} → ${destination}`)
      return destination
    }
    if (!isInside(realpathSync(root), realpathSync(target)) || !lstatSync(target).isFile()) {
      warn(`일반 저장소 파일이 아닌 첨부파일은 복사하지 않습니다: ${source} → ${destination}`)
      return destination
    }
    const assetName = `assets/${digest(relative).slice(0, 16)}${path.extname(target).toLowerCase()}`
    assets.set(assetName, target)
    return `./${assetName}${suffix}`
  }

  function rewriteLinks(body, source) {
    return outsideFences(body, (line) =>
      line
        .replace(
          /(!?\[[^\]\n]*\]\()(<[^>\n]+>|[^\s)]+)([^)\n]*\))/g,
          (_, prefix, destination, rest) => {
            const bracketed = destination.startsWith('<')
            const resolved = resolveDestination(
              bracketed ? destination.slice(1, -1) : destination,
              source
            )
            return `${prefix}${bracketed ? `<${resolved}>` : resolved}${rest}`
          }
        )
        .replace(
          /^(\s{0,3}\[[^\]\n]+\]:\s*)(<[^>\n]+>|\S+)([\s\S]*)$/,
          (_, prefix, destination, rest) => {
            const bracketed = destination.startsWith('<')
            const resolved = resolveDestination(
              bracketed ? destination.slice(1, -1) : destination,
              source
            )
            return `${prefix}${bracketed ? `<${resolved}>` : resolved}${rest}`
          }
        )
    )
  }

  const outputs = new Map([
    ['index.md', frontmatter({ layout: 'home', workId, pageId: 'intro', titleTemplate: false }, '')],
    ...pages.map((page) => {
      const index = readingOrder.findIndex(({ id }) => id === page.id)
      const neighbor = (chapter) => chapter ? { title: chapter.title, label: chapter.label, url: chapter.url } : null
      const metadata = {
        title: page.title,
        workId,
        description: page.description,
        pageId: page.kind === 'redirect' ? '' : page.id,
        episodeId: page.episodeId || '',
        kind: page.kind,
        label: page.label || '',
        time: page.time || '',
        shareTitle: page.kind === 'episode' ? `${page.label} ${page.title} · ${work.title}` : `${page.title} · ${work.title}`,
        prev: page.kind === 'episode' ? neighbor(readingOrder[index - 1]) : null,
        next: page.kind === 'episode' ? neighbor(readingOrder[index + 1]) : null,
        redirect: page.redirect || '',
        outline: false,
      }
      if (page.date !== undefined) metadata.date = page.date
      return [page.filename, frontmatter(metadata, rewriteLinks(page.body, page.source))]
    }),
  ])
  // An app may add pages of its own to the work, such as one per film; they never replace a generated page.
  for (const extra of extension.pages ?? []) {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}\.md$/.test(extra.filename)) throw new Error(`안전하지 않은 생성 경로: ${extra.filename}`)
    if (outputs.has(extra.filename)) throw new Error(`생성 경로 중복: ${extra.filename}`)
    outputs.set(extra.filename, frontmatter({ ...extra.frontmatter, outline: false }, extra.body ?? ''))
  }
  const catalog = { title: work.title, work, places: structure.places, chapters, readingOrder, legacyIds, legacyScrollResetIds, documents, illustrations, music, ...extension.catalog }
  // A work first published before works had their own folder kept its pages at read/{page}.html;
  // the deployment sends those addresses on, so name each one with the page that replaced it.
  if (book.legacy?.servedAtRoot) {
    const kept = new Set(pages.map(page => page.id))
    catalog.formerPages = Object.fromEntries([
      ...pages.map(page => [page.id, page.id]),
      ...Object.entries(legacyEpisodes).filter(([old, id]) => kept.has(id) && !kept.has(old)),
      ['life-story', ''],
    ])
  }

  syncReferenceIndex(root, structure.episodes, mainFilename, legacyEpisodes)

  let previousFiles = []
  let previousDir = outputDir
  if (existsSync(manifestFile)) {
    const previous = JSON.parse(readFileSync(manifestFile, 'utf8'))
    previousFiles = Array.isArray(previous.files) ? previous.files : []
    // Manifests written before works had folders listed pages in site/read.
    const directory = previous.directory ?? 'read'
    if (typeof directory !== 'string' || !validId.test(directory))
      throw new Error('이전 생성 목록의 폴더가 안전하지 않습니다. content-manifest.json을 확인하세요.')
    previousDir = path.join(root, 'site', directory)
    for (const filename of previousFiles) {
      if (
        typeof filename !== 'string' ||
        !/^(?:[a-z0-9][a-z0-9_-]*\.md|assets\/[a-f0-9]+\.[a-z0-9]+)$/.test(filename)
      ) {
        throw new Error(
          '이전 생성 목록에 안전하지 않은 경로가 있습니다. content-manifest.json을 확인하세요.'
        )
      }
    }
  }
  const generatedFiles = [...outputs.keys(), ...assets.keys()]
  const ownedBefore = previousDir === outputDir ? previousFiles : []
  for (const filename of generatedFiles) {
    if (existsSync(path.join(outputDir, filename)) && !ownedBefore.includes(filename)) {
      throw new Error(
        `직접 작성한 파일을 덮어쓰지 않습니다: site/${workId}/${filename}. 원본은 루트 또는 content/에 두세요.`
      )
    }
  }
  mkdirSync(outputDir, { recursive: true })
  mkdirSync(generatedDir, { recursive: true })
  for (const [filename, content] of outputs) writeFileSync(path.join(outputDir, filename), content)
  for (const [filename, source] of assets) {
    mkdirSync(path.dirname(path.join(outputDir, filename)), { recursive: true })
    copyFileSync(source, path.join(outputDir, filename))
  }
  for (const stale of previousFiles.filter((filename) => previousDir !== outputDir || !generatedFiles.includes(filename)))
    rmSync(path.join(previousDir, stale), { force: true })
  if (previousDir !== outputDir)
    for (const directory of [path.join(previousDir, 'assets'), previousDir])
      if (existsSync(directory) && readdirSync(directory).length === 0) rmSync(directory, { recursive: true })
  const manifest = {
    version: 1,
    directory: workId,
    files: generatedFiles,
    sources: pages.map(({ source, id, filename }) => ({ source, id, filename })),
  }
  for (const [filename, value] of [
    ['catalog.json', catalog],
    ['content-manifest.json', manifest],
    ...(extension.generated ?? []),
  ]) {
    const target = path.join(generatedDir, filename)
    const temporary = `${target}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
    renameSync(temporary, target)
  }
  logger.log?.(
    `[content] ${structure.places.length}개 터전 · ${chapters.length}개 본편 회차 · ${documents.length}개 자료 준비 완료`
  )
  return { catalog, manifest, warnings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    prepareContent()
  } catch (error) {
    console.error(`[content] ${error.message}`)
    process.exitCode = 1
  }
}
