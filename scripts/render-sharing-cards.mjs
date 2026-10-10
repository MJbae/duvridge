/** Manually render approved sharing artwork. Web builds publish the committed PNGs. */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const template = readFileSync(resolve(root, 'scripts/templates/sharing-card.html'), 'utf8')
const registry = JSON.parse(readFileSync(resolve(root, 'service-registry.json'), 'utf8'))
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const image = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`
const mark = '인생원작<span class="stop">.</span>'
const companyMark = 'duvridge<span class="stop">.</span>'
const cards = []

// Book text and media come only from each book's canonical source directory.
const books = resolve(root, registry.bookCatalog.path)
for (const folder of readdirSync(books, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
  const source = resolve(books, folder.name)
  const book = JSON.parse(readFileSync(resolve(source, 'book.json'), 'utf8'))
  const sharing = book.sharing.image
  if (sharing.width !== 1200 || sharing.height !== 630 || !sharing.src.endsWith('.png')) {
    throw new Error(`${book.id}: sharing metadata must name the 1200×630 PNG to render`)
  }
  const cover = (book.cover.webpSources ?? book.cover.sources).at(-1).src
  const words = book.work.title.split(' ')
  const split = Math.ceil(words.length / 2)
  const title = [words.slice(0, split).join(' '), words.slice(split).join(' ')].filter(Boolean).map(escape).join('<br>')
  cards.push({
    kind: 'work', lang: 'ko', output: resolve(source, 'public', sharing.src.replace(/^\//, '')),
    artwork: `<img class="portrait" src="${image(resolve(source, 'public', cover.replace(/^\//, '')), cover.endsWith('.webp') ? 'image/webp' : 'image/jpeg')}" alt=""><div class="wash"></div>
      <div class="main"><div class="imprint">${mark}</div><div><h1 class="title">${title}</h1><p class="subtitle">${escape(book.work.subtitle)}</p></div><div class="foot"><span>실화 인생 드라마</span></div></div>`,
  })
}

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

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  for (const card of cards) {
    const html = template.replaceAll('{{lang}}', card.lang).replaceAll('{{kind}}', card.kind).replace('{{artwork}}', card.artwork)
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const fonts = await page.evaluate(async () => Promise.all(['800 74px Hahmlet', '500 100px Fraunces', '500 32px "IBM Plex Sans KR"'].map(async font => (await document.fonts.load(font)).length)))
    if (fonts.some(count => !count)) throw new Error('Sharing card fonts did not load')
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
    mkdirSync(dirname(card.output), { recursive: true })
    await page.locator('.card').screenshot({ path: card.output })
    console.log(`${card.kind}: ${card.output.slice(root.length)}`)
  }
} finally {
  await browser.close()
}
