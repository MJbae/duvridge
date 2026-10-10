/** Manually render approved sharing artwork. Web builds publish the committed PNGs. */
import { readFileSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const image = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`
const mark = '인생원작<span class="stop">.</span>'
const companyMark = 'duvridge<span class="stop">.</span>'
const formats = {
  original: { label: '오리지널', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 6c-2.5-1.6-5.5-1.8-8-1v13c2.5-.8 5.5-.6 8 1 2.5-1.6 5.5-1.8 8-1V5c-2.5-.8-5.5-.6-8 1zM12 6v13"/></svg>' },
  video: { label: '영상', icon: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>' },
}

/** Keep the default preview compatible with books that have no format overrides. */
export function sharingCardImages(book) {
  const sharing = book.sharing
  if (typeof sharing?.description !== 'string' || !sharing.description.trim()) throw new Error(`${book.id}: sharing description is required`)
  if (sharing.images !== undefined && (!sharing.images || typeof sharing.images !== 'object' || Array.isArray(sharing.images))) {
    throw new Error(`${book.id}: sharing images must be a format map`)
  }
  for (const format of Object.keys(sharing.images ?? {})) {
    if (!Object.hasOwn(formats, format)) throw new Error(`${book.id}: unknown sharing format ${format}`)
  }
  const validateImage = (format, image) => {
    if (!image || image.width !== 1200 || image.height !== 630 || typeof image.src !== 'string'
      || !image.src.startsWith('/') || !image.src.endsWith('.png') || image.src.includes('\\')
      || posix.normalize(image.src) !== image.src || image.src.includes('..') || /[?#]/u.test(image.src)
      || (image.type !== undefined && image.type !== 'image/png') || typeof image.alt !== 'string' || !image.alt.trim()) {
      throw new Error(`${book.id}: ${format} sharing metadata must name a local 1200×630 PNG with alt text`)
    }
  }
  validateImage('default', sharing.image)
  for (const [format, image] of Object.entries(sharing.images ?? {})) validateImage(format, image)
  const images = { original: sharing.images?.original ?? sharing.image, ...sharing.images }
  const paths = new Set()
  for (const image of Object.values(images)) {
    if (paths.has(image.src)) throw new Error(`${book.id}: sharing formats must have distinct image paths`)
    paths.add(image.src)
  }
  return images
}

function bookCards(registry) {
  const cards = []

  // Book text and media come only from each book's canonical source directory.
  const books = resolve(root, registry.bookCatalog.path)
  for (const folder of readdirSync(books, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const source = resolve(books, folder.name)
    const book = JSON.parse(readFileSync(resolve(source, 'book.json'), 'utf8'))
    const images = sharingCardImages(book)
    const cover = (book.cover.webpSources ?? book.cover.sources).at(-1).src
    if (typeof book.work?.title !== 'string' || !book.work.title.trim()) throw new Error(`${book.id}: work title is required`)
    const words = book.work.title.trim().split(/\s+/u)
    const split = Math.ceil(words.length / 2)
    const title = [words.slice(0, split).join(' '), words.slice(split).join(' ')].filter(Boolean).map(escape).join('<br>')
    for (const [format, sharing] of Object.entries(images)) cards.push({
      kind: 'work', format, lang: 'ko', output: resolve(source, 'public', sharing.src.replace(/^\//, '')),
      artwork: `<img class="portrait" src="${image(resolve(source, 'public', cover.replace(/^\//, '')), cover.endsWith('.webp') ? 'image/webp' : 'image/jpeg')}" alt=""><div class="wash"></div>
        <div class="main"><div class="imprint">${mark}</div><div><h1 class="title">${title}</h1></div><span class="badge">${formats[format].icon}${formats[format].label}</span></div>`,
    })
  }
  return cards
}

function brandCards() {
  const cards = []

  cards.push({
    kind: 'service', lang: 'ko', output: resolve(root, 'apps/company-site/assets/social/insaengwonjak-v2.png'),
    artwork: `<div class="point"></div><div class="main"><div class="genre">실화 인생 드라마</div><div><h1 class="service-mark">${mark}</h1><p class="service-tagline">살아낸 삶이,<br>모든 장면의 원작</p></div><div class="foot"><span>하나의 원작, 다양한 콘텐츠</span><span>${companyMark}</span></div></div>`,
  })

  // Reuse the life curve from the company's maintained page template.
  const companyTemplate = readFileSync(resolve(root, 'apps/company-site/site/template.html'), 'utf8')
  const curve = companyTemplate.match(/<svg class="lifecurve"[\s\S]*?<\/svg>/)[0]
    .replace('class="lifecurve"', 'xmlns="http://www.w3.org/2000/svg"')
    .replace('{{lc_aria}}', 'One life, written to a full stop.')
    .replace('class="lc-path lc-life"', 'fill="none" stroke="#27324e" stroke-width="5" stroke-linecap="round"')
    .replace('class="lc-pulse"', 'fill="#c98a1c" opacity="0.15"')
    .replace('class="lc-stop"', 'fill="#c98a1c"')
  cards.push({
    kind: 'company', lang: 'en', output: resolve(root, 'apps/company-site/assets/social/duvridge-v2.png'),
    artwork: `<img class="curve" src="data:image/svg+xml;base64,${Buffer.from(curve).toString('base64')}" alt=""><div class="main"><h1 class="company-mark">${companyMark}</h1><div class="company-middle"><p class="company-tagline">A life,<br>written to <em>last.</em></p></div><div class="foot"><span>Real lives. Original stories.</span><span class="imprint">${mark}</span></div></div>`,
  })
  return cards
}

export async function renderSharingCards({ booksOnly = false } = {}) {
  const { chromium } = createRequire(import.meta.url)('@playwright/test')
  const template = readFileSync(resolve(root, 'scripts/templates/sharing-card.html'), 'utf8')
  const registry = JSON.parse(readFileSync(resolve(root, 'service-registry.json'), 'utf8'))
  const cards = [...bookCards(registry), ...(booksOnly ? [] : brandCards())]
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
    for (const card of cards) {
      const html = template.replaceAll('{{lang}}', card.lang).replaceAll('{{kind}}', card.kind).replace('{{artwork}}', card.artwork)
      await page.setContent(html, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      const requestedFonts = card.kind === 'work'
        ? ['800 66px Hahmlet', '700 35px Hahmlet', '700 40px "IBM Plex Sans KR"']
        : ['800 74px Hahmlet', '500 100px Fraunces', '500 32px "IBM Plex Sans KR"']
      const fonts = await page.evaluate(async requested => Promise.all(requested.map(async font => (await document.fonts.load(font)).length)), requestedFonts)
      if (fonts.some(count => !count)) throw new Error('Sharing card fonts did not load')
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
      if (card.kind === 'work') {
        const title = await page.evaluate(() => {
          const card = document.querySelector('.card')
          const range = document.createRange()
          range.selectNodeContents(document.querySelector('.title'))
          const rects = [...range.getClientRects()].filter(rect => rect.width > 0)
          const bounds = card.getBoundingClientRect()
          return { right: Math.max(...rects.map(rect => rect.right)), lines: new Set(rects.map(rect => rect.top)).size,
            panelEnd: bounds.left + bounds.width * parseFloat(getComputedStyle(card).getPropertyValue('--panel-end')) / 100 }
        })
        if (title.lines > 2 || !Number.isFinite(title.right) || !(title.right < title.panelEnd - 24)) {
          throw new Error(`${card.output}: title exceeds two lines or the solid panel (${JSON.stringify(title)}, margin 24px)`)
        }
        console.log(`${card.format}: title right ${title.right.toFixed(1)}px < ${(title.panelEnd - 24).toFixed(1)}px`)
      }
      mkdirSync(dirname(card.output), { recursive: true })
      await page.locator('.card').screenshot({ path: card.output })
      console.log(`${card.kind}: ${card.output.slice(root.length)}`)
    }
  } finally {
    await browser.close()
  }
}

if (typeof process !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await renderSharingCards({ booksOnly: process.argv.includes('--books-only') })
}
