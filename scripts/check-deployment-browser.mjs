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
    const title = sourceData.title || book.work.title
    const headOf = published => inspector.evaluate(html => {
      const page = new DOMParser().parseFromString(html, 'text/html')
      return { title: page.querySelector('meta[property="og:title"]')?.getAttribute('content'), paragraphs: [...page.querySelectorAll('.story-content p')].map(paragraph => paragraph.textContent) }
    }, published)
    let paragraphChecks = 0
    // Only the novel publishes the text; the audiobook and the video show the narration, not the prose.
    for (const episode of structure.episodes) {
      const { id } = episode
      const text = await (await request(values.toldlife, `/novels/read/${id}.html`)).text()
      assert(text.includes('story-content'), `novels/${id}: no reader body`)
      assert(!text.includes('<!-- illustration:'), `novels/${id}: raw illustration marker leaked`)
      assert(text.includes(`https://toldlife.duvridge.com/novels/read/${id}.html`), 'Wrong canonical')
      const published = await headOf(text)
      const expected = await inspector.evaluate(html => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('p')].map(paragraph => paragraph.textContent),
        markdown.render(stripIllustrationMarkers(episode.body)))
      assert.equal(published.title, `${episode.label} ${episode.title} · ${title}`, `novels/${id}: stale title`)
      assert.deepEqual(published.paragraphs, expected, `novels/${id}: published prose differs from the canonical manuscript`)
      paragraphChecks += expected.length
      const listen = await (await request(values.toldlife, `/audiobooks/read/${id}.html`)).text()
      assert(listen.includes(`https://toldlife.duvridge.com/audiobooks/read/${id}.html`), `audiobooks/${id}: wrong canonical`)
      assert.equal((await headOf(listen)).title, `${episode.label} ${episode.title} · ${title}`, `audiobooks/${id}: stale title`)
    }
    const recordings = ['prolog', 'ep01', 'ep02', 'ep03']
    for (const id of recordings) {
      const episode = structure.episodes.find(entry => entry.id === id)
      const watch = await (await request(values.toldlife, `/audiobooks/watch/${id}.html`)).text()
      assert(watch.includes(`https://toldlife.duvridge.com/audiobooks/watch/${id}.html`), `watch/${id}: wrong canonical`)
      assert.equal((await headOf(watch)).title, `${episode.label} ${episode.title} · ${title}`, `watch/${id}: stale title`)
    }
    await inspector.close()
    disposeMdItInstance()
    for (const id of recordings) {
      const response = await request(values.toldlife, `/audiobooks/record/${id}.mp3`, { headers: { Range: 'bytes=0-255' } })
      assert((await response.arrayBuffer()).byteLength > 0, `Empty recording: ${id}`)
    }
    const missing = await fetch(new URL('/missing-monorepo-route', values.toldlife))
    assert.equal(missing.status, 404, 'Unknown routes must return 404')
    const audio = page => page.locator('.narration-audio')
    async function startPlayback(page, device) {
      // Server-rendered buttons exist before hydration; retry until the narration really plays.
      await expect(async () => {
        await page.getByRole('button', { name: '재생', exact: true }).click({ timeout: 2000 })
        await page.waitForFunction(() => {
          const media = document.querySelector('.narration-audio')
          return media && !media.paused && media.readyState >= 2
        }, undefined, { timeout: 15000 })
      }).toPass({ timeout: 60000 }).catch(async error => {
        const media = await audio(page).evaluate(element => ({ src: element.currentSrc, paused: element.paused, readyState: element.readyState, error: element.error?.message }))
        console.error(JSON.stringify({ device, url: page.url(), media }))
        throw error
      })
    }
    for (const [device, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 1000 }]]) {
      const context = await browser.newContext({ viewport })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      // The platform home: three tabs, each with its own work and button.
      await page.goto(new URL('/', values.toldlife).href)
      for (const [tab, verb] of [['오디오북', '듣기'], ['영상', '보기'], ['오리지널 시리즈', '읽기']]) {
        await page.getByRole('link', { name: tab, exact: true }).click()
        assert((await page.locator('.panel.is-active .big-button').textContent()).includes(verb), `home ${tab}: wrong button`)
      }
      assert(!await overflows(), 'platform home overflows')
      await page.screenshot({ path: `${output}/home-${device}.png`, fullPage: true })
      for (const [name, path] of [['novels', '/novels/'], ['audiobooks', '/audiobooks/'], ['video', '/audiobooks/watch/']]) {
        await page.goto(new URL(path, values.toldlife).href)
        await page.locator('.episode-item').first().waitFor({ state: 'attached' })
        assert.equal(await page.locator('.episode-item').count(), episodes.length, `${name}: episode list`)
        assert((await page.locator('.work-action .big-button').textContent()).trim().length > 0, `${name}: no main action`)
        assert(!await overflows(), `${name} work page overflows`)
        await page.screenshot({ path: `${output}/${name}-${device}-home.png`, fullPage: true })
      }
      await page.goto(new URL('/novels/read/ep02.html', values.toldlife).href)
      await page.locator('.story-content p').first().waitFor()
      assert.equal(await page.locator('.reader-bar a, .reader-bar button').count(), 3, 'reader bar controls')
      await expect(async () => {
        await page.getByRole('button', { name: '설정', exact: true }).click({ timeout: 2000 })
        await expect(page.getByRole('dialog', { name: '읽기 설정' })).toBeVisible({ timeout: 2000 })
      }).toPass({ timeout: 30000 })
      assert(!await overflows(), 'novel reader overflows')
      await page.screenshot({ path: `${output}/novels-${device}-reader.png`, fullPage: true })
      await page.goto(new URL('/audiobooks/read/ep02.html', values.toldlife).href)
      console.log(`Checking ${device} playback at ${page.url()}`)
      await startPlayback(page, device)
      assert(await page.getByRole('button', { name: '일시 정지', exact: true }).isVisible())
      const before = await audio(page).evaluate(element => element.currentTime)
      await page.getByRole('button', { name: '10초 앞으로' }).click()
      await expect.poll(() => audio(page).evaluate(element => element.currentTime), { message: 'skip forward' }).toBeGreaterThan(before + 5)
      await page.getByRole('button', { name: /^재생 속도/ }).click()
      assert.equal(await audio(page).evaluate(element => element.playbackRate), 1.25)
      assert((await page.locator('.lyric-current').textContent()).trim().length > 0, 'no narration sentence')
      assert(!await overflows(), 'audiobook player overflows')
      await page.screenshot({ path: `${output}/audiobooks-${device}-player.png`, fullPage: true })
      await page.getByRole('button', { name: '일시 정지', exact: true }).click()
      assert(await audio(page).evaluate(element => element.paused))
      await page.goto(new URL('/audiobooks/watch/ep02.html', values.toldlife).href)
      await startPlayback(page, device)
      assert((await page.locator('.subtitle-band').textContent()).trim().length > 0, 'no video subtitle')
      assert(!await overflows(), 'video overflows')
      await page.screenshot({ path: `${output}/video-${device}-player.png` })
      await page.evaluate(() => document.querySelector('.narration-audio').pause())
      assert.deepEqual(errors, [], 'Browser runtime errors')
      await context.close()
    }
    evidence.results.push({ group: 'toldlife', origin: values.toldlife, sha, episodeRoutes: episodes.length * 2 + recordings.length, recordings: recordings.length,
      manuscript: { bookId, sha256: sourceHash, episodeCount: episodes.length, paragraphChecks }, devices: ['phone', 'desktop'] })
  }
} finally {
  await browser.close()
}
await writeFile(`${output}/result.json`, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(JSON.stringify(evidence, null, 2))
