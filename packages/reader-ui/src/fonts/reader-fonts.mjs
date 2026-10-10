import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'
import { readerFontHead } from './font-head.mjs'
import { readerFontMiddleware } from './font-server.mjs'

const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const sourceDirectory = fileURLToPath(new URL('../../assets/fonts/', import.meta.url))
const sources = JSON.parse(readFileSync(path.join(sourceDirectory, 'sources.json'), 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const ordered = text => [...new Set([...text].map(character => character.codePointAt(0)))].sort((a, b) => a - b)
const characters = points => String.fromCodePoint(...points)

/** Compact, exact ranges. A face never claims glyphs that its subset does not contain. */
export function unicodeRange(points) {
  const ranges = []
  for (const point of [...new Set(points)].sort((a, b) => a - b)) {
    const last = ranges.at(-1)
    if (last && point === last[1] + 1) last[1] = point
    else ranges.push([point, point])
  }
  return ranges.map(([first, last]) => `U+${first.toString(16).toUpperCase()}${first === last ? '' : `-${last.toString(16).toUpperCase()}`}`).join(',')
}

/** The small common file and the remaining shards partition the complete upstream cmap. */
export function partitionCharacters(available, common, shardSize = 256) {
  const wanted = new Set(ordered(common))
  const first = available.filter(point => wanted.has(point))
  const remaining = available.filter(point => !wanted.has(point))
  return [first, ...Array.from({ length: Math.ceil(remaining.length / shardSize) }, (_, index) => remaining.slice(index * shardSize, (index + 1) * shardSize))].filter(points => points.length)
}

function uiText(directory) {
  if (!existsSync(directory)) return ''
  return readdirSync(directory, { withFileTypes: true }).map(entry => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return ['node_modules', 'generated', 'dist', 'cache', 'public', 'content', 'tests', 'docs'].includes(entry.name) ? '' : uiText(file)
    if (!/\.(vue|[cm]?ts|mjs|html)$/.test(entry.name)) return ''
    return (readFileSync(file, 'utf8').match(/[\p{Script=Hangul}\p{Script=Han}]/gu) ?? []).join('')
  }).join('')
}

function commonText(root) {
  const books = path.resolve(root, process.env.TOLDLIFE_BOOK_CATALOG || 'content/books')
  // Keep basic punctuation and digits in the common file, including arbitrary playback times.
  const basic = characters(Array.from({ length: 95 }, (_, index) => index + 32)) + '©·…“”‘’—–♪×±'
  let titles = '인생원작회차살아낸 삶이 원작이 됩니다이야기를 찾지 못했습니다홈으로 이동합니다페이지를 찾을 수 없습니다' + basic
  for (const entry of readdirSync(books, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const directory = path.join(books, entry.name)
    if (!existsSync(path.join(directory, 'book.json'))) continue
    const book = JSON.parse(readFileSync(path.join(directory, 'book.json'), 'utf8'))
    const manuscript = readFileSync(path.join(directory, book.manuscript || 'manuscript.md'), 'utf8')
    titles += book.work?.title ?? ''
    titles += manuscript.split('\n').filter(line => /^#+\s|^title:/.test(line)).join('')
    titles += (book.work?.films ?? book.films ?? []).map(film => film.title).join('')
  }
  const interfaceText = ['apps/toldlife-novels/site/.vitepress/theme', 'apps/toldlife-audiobooks/site/.vitepress/theme',
    'apps/toldlife-videos/site/.vitepress/theme', 'apps/toldlife-portal', 'packages/reader-ui/src/components',
    'packages/reader-ui/src/series', 'packages/reader-reactions/src', 'scripts/render-toldlife-portal.mjs']
    .map(relative => {
      const file = path.join(root, relative)
      return existsSync(file) && statSync(file).isFile() ? (readFileSync(file, 'utf8').match(/[\p{Script=Hangul}\p{Script=Han}]/gu) ?? []).join('') : uiText(file)
    }).join('')
  return { title: characters(ordered(titles)), ui: characters(ordered(titles + interfaceText)) }
}

/** Offline, deterministic fonts; the input hash invalidates the build cache on new titles/UI text. */
export async function prepareReaderFonts(root = repository) {
  const common = commonText(root)
  const signature = hash(JSON.stringify({ generator: hash(readFileSync(fileURLToPath(import.meta.url))), common, sources }))
  const directory = path.join(root, '.deploy/reader-fonts', signature)
  const marker = path.join(directory, 'manifest.json')
  if (!existsSync(marker)) {
    const temporary = `${directory}.${process.pid}`
    await mkdir(temporary, { recursive: true })
    const faces = []
    try {
      for (const source of sources.sources) {
        const input = await readFile(path.join(sourceDirectory, source.file))
        if (hash(input) !== source.sha256) throw new Error(`Font source checksum differs: ${source.file}`)
        const serif = source.weight === null
        const groups = partitionCharacters(ordered(sources.characterSets[source.characterSet]), serif ? common.title : common.ui, serif ? 128 : 256)
        for (const [index, points] of groups.entries()) {
          const data = await subsetFont(input, characters(points), {
            targetFormat: 'woff2', preserveNameIds: [0, 13, 14],
            ...(serif ? { variationAxes: { wght: { min: 400, max: 800 } } } : {}),
          })
          const digest = hash(data)
          const file = `${serif ? 'serif' : `ui-${source.weight}`}.${digest.slice(0, 16)}.woff2`
          await writeFile(path.join(temporary, file), data)
          faces.push({ file, sha256: digest, bytes: data.length, family: serif ? 'ToldLife Serif' : 'ToldLife UI',
            weight: serif ? '400 800' : String(source.weight), unicodeRange: unicodeRange(points), common: index === 0 })
        }
      }
      const css = faces.map(face => `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${face.weight};font-display:swap;src:url('/fonts/${face.file}') format('woff2');unicode-range:${face.unicodeRange}}`).join('\n') + '\n'
      const stylesheet = `reader.${hash(css).slice(0, 16)}.css`
      await writeFile(path.join(temporary, stylesheet), css)
      for (const license of ['hahmlet-OFL.txt', 'ibmplexsanskr-OFL.txt']) await cp(path.join(sourceDirectory, license), path.join(temporary, license))
      const manifest = { version: 1, signature, stylesheet, faces, upstreamCommit: sources.googleFontsCommit }
      await writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(manifest) + '\n')
      // Another reader process may have finished this exact input concurrently.
      try { await rename(temporary, directory) } catch (error) { if (!existsSync(marker)) throw error }
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
  const manifest = JSON.parse(await readFile(marker, 'utf8'))
  return { directory, manifest, head: readerFontHead(manifest) }
}

/** Development/standalone preview use the same root URLs as the assembled Pages project. */
export function readerFontsPlugin(directory) {
  return { name: 'reader-fonts', configureServer(server) { server.middlewares.use(readerFontMiddleware(directory)) } }
}

export async function copyReaderFonts(directory, outDir) {
  await cp(directory, path.join(outDir, 'fonts'), { recursive: true })
}
