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
import { renderedText } from '@duvridge/content-processing/manuscripts/rendered-text.mjs'
import { listBookSources } from '@duvridge/content-processing/source-files/list-book-sources.mjs'
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
    assert(await page.getByText('인생원작', { exact: false }).count() > 0)
    await page.screenshot({ path: `${output}/company-phone.png`, fullPage: true })
    await page.close()
    evidence.results.push({ group: 'company', origin: values.company, sha, routes: 7 })
  }
  if (values.toldlife) {
    const sha = await marker(values.toldlife)
    const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
    const registry = JSON.parse(await readFile(resolve(repositoryRoot, 'service-registry.json'), 'utf8'))
    const sources = listBookSources(repositoryRoot, { directory: registry.bookCatalog.path })
    const summaries = await (await request(values.toldlife, '/audiobooks/work-index.json')).json()
    assert.deepEqual(summaries.map(work => work.id), sources.map(({ book }) => book.id), 'Published work catalog differs from canonical sources')
    const selected = sources.find(({ book }) => book.legacy?.servedAtRoot) ?? sources[0]
    const bookId = selected.book.id
    const sourceRoot = selected.source
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
      const text = await (await request(values.toldlife, `/novels/${bookId}/${id}`)).text()
      assert(text.includes('story-content'), `novels/${id}: no reader body`)
      assert(!text.includes('<!-- illustration:'), `novels/${id}: raw illustration marker leaked`)
      assert(text.includes(`https://toldlife.duvridge.com/novels/${bookId}/${id}`), 'Wrong canonical')
      const published = await headOf(text)
      const expected = await inspector.evaluate(html => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('p')].map(paragraph => paragraph.textContent),
        markdown.render(stripIllustrationMarkers(episode.body)))
      assert.equal(published.title, `${episode.label} ${episode.title} · ${title}`, `novels/${id}: stale title`)
      assert.deepEqual(published.paragraphs.map(renderedText), expected.map(renderedText), `novels/${id}: published prose differs from the canonical manuscript`)
      paragraphChecks += expected.length
      const listen = await (await request(values.toldlife, `/audiobooks/${bookId}/${id}`)).text()
      assert(listen.includes(`https://toldlife.duvridge.com/audiobooks/${bookId}/${id}`), `audiobooks/${id}: wrong canonical`)
      assert.equal((await headOf(listen)).title, `${episode.label} ${episode.title} · ${title}`, `audiobooks/${id}: stale title`)
    }
    // Every additional work exposes its own canonical homes and episode paths in all formats.
    for (const summary of summaries.filter(work => work.id !== bookId)) {
      for (const format of ['novels', 'audiobooks', 'videos']) {
        for (const route of [`/${format}/${summary.id}/`, ...summary.episodes.map(episode => `/${format}/${summary.id}/${episode.id}`)]) {
          const html = await (await request(values.toldlife, route)).text()
          assert(html.includes(`https://toldlife.duvridge.com${route}`), `${route}: wrong canonical`)
        }
      }
    }
    const recordings = summaries.find(work => work.id === bookId).episodes.filter(episode => episode.recorded).map(episode => episode.id)
    for (const id of recordings) {
      const episode = structure.episodes.find(entry => entry.id === id)
      const watch = await (await request(values.toldlife, `/videos/${bookId}/${id}`)).text()
      assert(watch.includes(`https://toldlife.duvridge.com/videos/${bookId}/${id}`), `watch/${id}: wrong canonical`)
      assert.equal((await headOf(watch)).title, `${episode.label} ${episode.title} · ${title}`, `watch/${id}: stale title`)
    }
    await inspector.close()
    disposeMdItInstance()
    for (const id of recordings) {
      const response = await request(values.toldlife, `/audiobooks/works/${bookId}/record/${id}.mp3`, { headers: { Range: 'bytes=0-255' } })
      assert((await response.arrayBuffer()).byteLength > 0, `Empty recording: ${id}`)
    }
    const missing = await fetch(new URL('/missing-monorepo-route', values.toldlife))
    assert.equal(missing.status, 404, 'Unknown routes must return 404')
    const audio = page => page.locator('.narration-audio')
    async function startPlayback(page, device, selector = '.narration-audio') {
      // Server-rendered buttons exist before hydration; retry until the narration really plays.
      await expect(async () => {
        await page.getByRole('button', { name: '재생', exact: true }).click({ timeout: 2000 })
        await page.waitForFunction(target => {
          const media = document.querySelector(target)
          return media && !media.paused && media.readyState >= 2
        }, selector, { timeout: 15000 })
      }).toPass({ timeout: 60000 }).catch(async error => {
        const media = await page.locator(selector).evaluate(element => ({ src: element.currentSrc, paused: element.paused, readyState: element.readyState, error: element.error?.message }))
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
      for (const [name, path] of [['novels', `/novels/${bookId}/`], ['audiobooks', `/audiobooks/${bookId}/`], ['video', `/videos/${bookId}/`]]) {
        await page.goto(new URL(path, values.toldlife).href)
        await page.locator('.episode-item').first().waitFor({ state: 'attached' })
        assert.equal(await page.locator('.episode-item').count(), episodes.length, `${name}: episode list`)
        assert((await page.locator('.work-action .big-button').textContent()).trim().length > 0, `${name}: no main action`)
        assert(!await overflows(), `${name} work page overflows`)
        await page.screenshot({ path: `${output}/${name}-${device}-home.png`, fullPage: true })
      }
      await page.goto(new URL(`/novels/${bookId}/${episodes[1] ?? episodes[0]}`, values.toldlife).href)
      await page.locator('.story-content p').first().waitFor()
      assert.equal(await page.locator('.reader-bar a, .reader-bar button').count(), 2, 'reader bar controls')
      await expect(async () => {
        await page.getByRole('button', { name: '설정', exact: true }).click({ timeout: 2000 })
        await expect(page.getByRole('dialog', { name: '읽기 설정' })).toBeVisible({ timeout: 2000 })
      }).toPass({ timeout: 30000 })
      assert(!await overflows(), 'novel reader overflows')
      await page.screenshot({ path: `${output}/novels-${device}-reader.png`, fullPage: true })
      await page.goto(new URL(`/audiobooks/${bookId}/${recordings[0]}`, values.toldlife).href)
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
      await page.goto(new URL(`/videos/${bookId}/${recordings[0]}`, values.toldlife).href)
      // The video carries its own subtitles; the page draws none of its own.
      await startPlayback(page, device, '.stage-video')
      assert.match(await page.locator('.stage-video').getAttribute('src'), /\/videos\/works\/[^/]+\/media\/[a-z0-9-]+\.[a-f0-9]{10}\.mp4$/, 'video source')
      assert.equal(await page.locator('.subtitle-band, .stage-caption').count(), 0, 'separate video subtitles')
      assert(!await overflows(), 'video overflows')
      await page.screenshot({ path: `${output}/video-${device}-player.png` })
      await page.evaluate(() => document.querySelector('.stage-video').pause())
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
