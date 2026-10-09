import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium, expect } from '@playwright/test'
import matter from 'gray-matter'
import { createMarkdownRenderer, disposeMdItInstance } from 'vitepress'
import { parseManuscript } from '@duvridge/content-processing/manuscripts/parse-manuscript.mjs'
import { createLegacyEpisodeMaps } from '@duvridge/content-processing/manuscripts/episode-ids.mjs'
import { stripIllustrationMarkers } from '@duvridge/content-processing/illustrations/parse-illustration-markers.mjs'

const { values } = parseArgs({ options: {
  toldlife: { type: 'string' }, company: { type: 'string' },
  'expected-sha': { type: 'string' }, output: { type: 'string', default: '.deploy/verification' },
} })
assert(values.toldlife || values.company, 'Provide --toldlife URL or --company URL')
const output = resolve(values.output)
await mkdir(output, { recursive: true })
const evidence = { checkedAt: new Date().toISOString(), results: [] }

async function request(origin, path, options = {}) {
  const response = await fetch(new URL(path, origin), options)
  assert(response.ok, `${path}: HTTP ${response.status}`)
  return response
}
async function marker(origin) {
  const metadata = await (await request(origin, '/deployment.json')).json()
  const sha = metadata.sourceRevision ?? metadata.commit
  assert.match(sha, /^[a-f0-9]{40}$/)
  if (values['expected-sha']) assert.equal(sha, values['expected-sha'], 'Deployed revision differs')
  return sha
}

const browser = await chromium.launch()
try {
  if (values.company) {
    const sha = await marker(values.company)
    for (const route of ['/', '/ko/', '/ja/', '/zh-Hans/', '/zh-Hant/', '/guidebook/', '/guidebook/privacy/']) {
      const text = await (await request(values.company, route)).text()
      assert(text.includes('<html'), `No HTML at ${route}`)
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(new URL('/ko/', values.company).href)
    assert.equal(await page.locator('h1').count(), 1)
    assert(await page.getByText('ToldLife', { exact: false }).count() > 0)
    await page.screenshot({ path: `${output}/company-phone.png`, fullPage: true })
    await page.close()
    evidence.results.push({ group: 'company', origin: values.company, sha, routes: 7 })
  }
  if (values.toldlife) {
    const sha = await marker(values.toldlife)
    const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
    const registry = JSON.parse(await readFile(resolve(repositoryRoot, 'service-registry.json'), 'utf8'))
    const books = [...new Set(registry.services.filter(service => service.deployGroup === 'toldlife' && service.book).map(service => service.book))]
    assert.equal(books.length, 1, 'ToldLife readers must select the same canonical book for this check')
    const bookId = books[0]
    const sourceRoot = resolve(repositoryRoot, registry.books[bookId].path)
    const book = JSON.parse(await readFile(resolve(sourceRoot, 'book.json'), 'utf8'))
    const manuscript = await readFile(resolve(sourceRoot, book.manuscript ?? 'manuscript.md'))
    const sourceHash = createHash('sha256').update(manuscript).digest('hex')
    const { content: sourceContent, data: sourceData } = matter(manuscript.toString())
    const { legacyEpisodes } = createLegacyEpisodeMaps(book.legacy)
    const structure = parseManuscript(sourceContent, undefined, { legacyEpisodes })
    const episodes = structure.episodes.map(episode => episode.id)
    const markdown = await createMarkdownRenderer(sourceRoot, { html: false })
    const inspector = await browser.newPage()
    let paragraphChecks = 0
    for (const service of ['novels', 'audiobooks']) {
      for (const episode of structure.episodes) {
        const { id } = episode
        const text = await (await request(values.toldlife, `/${service}/read/${id}.html`)).text()
        assert(text.includes('story-content'), `${service}/${id}: no reader body`)
        assert(!text.includes('<!-- illustration:'), `${service}/${id}: raw illustration marker leaked`)
        assert(text.includes(`https://toldlife.duvridge.com/${service}/read/${id}.html`), 'Wrong canonical')
        const rendered = markdown.render(stripIllustrationMarkers(episode.body))
        const comparison = await inspector.evaluate(({ published, authored }) => {
          const parser = new DOMParser()
          const actual = parser.parseFromString(published, 'text/html')
          const expected = parser.parseFromString(authored, 'text/html')
          return {
            title: actual.querySelector('meta[property="og:title"]')?.getAttribute('content'),
            paragraphs: [...actual.querySelectorAll('.story-content p')].map(paragraph => paragraph.textContent),
            expected: [...expected.querySelectorAll('p')].map(paragraph => paragraph.textContent),
          }
        }, { published: text, authored: rendered })
        assert.equal(comparison.title, `${episode.label} ${episode.title} · ${sourceData.title || book.work.title}`, `${service}/${id}: stale title`)
        assert.deepEqual(comparison.paragraphs, comparison.expected, `${service}/${id}: published prose differs from the canonical manuscript`)
        paragraphChecks += comparison.expected.length
      }
    }
    await inspector.close()
    disposeMdItInstance()
    for (const id of ['prolog', 'ep01', 'ep02', 'ep03']) {
      const response = await request(values.toldlife, `/audiobooks/record/${id}.mp3`, { headers: { Range: 'bytes=0-255' } })
      assert((await response.arrayBuffer()).byteLength > 0, `Empty recording: ${id}`)
    }
    const missing = await fetch(new URL('/missing-monorepo-route', values.toldlife))
    assert.equal(missing.status, 404, 'Unknown routes must return 404')
    for (const [device, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 1000 }]]) {
      const context = await browser.newContext({ viewport })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.addInitScript(() => localStorage.setItem('family-library:read-along-tip', '1'))
      const headings = []
      const contents = []
      for (const service of ['novels', 'audiobooks']) {
        await page.goto(new URL(`/${service}/`, values.toldlife).href)
        await page.locator('.chapter-row').first().waitFor()
        assert.equal(await page.locator('.chapter-row').count(), episodes.length)
        headings.push(await page.locator('.place-heading').allTextContents())
        assert(headings.at(-1).length > 0, 'Missing latest place timeline')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${service} home overflows`)
        await page.screenshot({ path: `${output}/${service}-${device}-home.png`, fullPage: true })
        await page.goto(new URL(`/${service}/read/ep02.html`, values.toldlife).href)
        await page.locator('.story-content').waitFor()
        contents.push(await page.locator('.story-content').textContent())
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${service} reader overflows`)
        if (service === 'novels') assert.equal(await page.locator('.player-bar').count(), 0)
        else {
          const bar = page.getByRole('region', { name: '오디오북 플레이어' })
          await page.locator('.narration-audio').waitFor({ state: 'attached' })
          const sheet = page.getByRole('dialog', { name: '펼친 플레이어' })
          // SSR controls exist before hydration; opening the sheet proves their handlers are ready.
          await expect(async () => {
            await bar.locator('.player-expand').click()
            await expect(sheet).toBeVisible({ timeout: 2000 })
          }).toPass({ timeout: 30000 })
          await sheet.getByRole('button', { name: '접기' }).click()
          console.log(`Checking ${device} playback at ${page.url()}`)
          await bar.locator('.player-action').click()
          try {
            await page.waitForFunction(() => {
              const audio = document.querySelector('.narration-audio')
              return audio && !audio.paused && audio.readyState >= 2
            }, undefined, { timeout: 60000 })
          } catch (error) {
            const media = await page.locator('.narration-audio').evaluate(audio => ({
              src: audio.currentSrc, paused: audio.paused, readyState: audio.readyState,
              networkState: audio.networkState, error: audio.error?.message,
            }))
            console.error(JSON.stringify({ device, media, player: await bar.innerText(), errors }))
            throw error
          }
          assert((await bar.locator('.player-action').textContent()).includes('일시 정지'))
          await bar.locator('.player-expand').click()
          await sheet.waitFor({ state: 'visible' })
          await sheet.getByRole('button', { name: '1.25배 빠르게' }).click()
          assert.equal(await page.locator('.narration-audio').evaluate(audio => audio.playbackRate), 1.25)
          await sheet.getByRole('button', { name: '다음 문장' }).click()
          await page.screenshot({ path: `${output}/audio-sheet-${device}.png`, fullPage: true })
          await sheet.getByRole('button', { name: '접기' }).click()
          await bar.locator('.player-action').click()
          assert(await page.locator('.narration-audio').evaluate(audio => audio.paused))
        }
        await page.screenshot({ path: `${output}/${service}-${device}-reader.png`, fullPage: true })
      }
      assert.deepEqual(headings[0], headings[1], 'Shared chapter grouping differs')
      assert.equal(contents[0].replace(/\s+/g, ''), contents[1].replace(/\s+/g, ''), 'Canonical story differs')
      assert.deepEqual(errors, [], 'Browser runtime errors')
      await context.close()
    }
    evidence.results.push({ group: 'toldlife', origin: values.toldlife, sha, episodeRoutes: episodes.length * 2, recordings: 4,
      manuscript: { bookId, sha256: sourceHash, episodeCount: episodes.length, paragraphChecks }, devices: ['phone', 'desktop'] })
  }
} finally {
  await browser.close()
}
await writeFile(`${output}/result.json`, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(JSON.stringify(evidence, null, 2))
