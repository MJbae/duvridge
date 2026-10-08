import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import catalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }
import { legacyEpisodes } from '../site/.vitepress/shared/episode-ids.mjs'

const dist = new URL('../site/.vitepress/dist/', import.meta.url)
// The build under test decides the address: CI builds with the repository's Pages path in SITE_BASE.
const base = process.env.SITE_BASE || '/bae-memoir/'
const siteUrl = new URL(base, process.env.SITE_ORIGIN || 'https://mjbae.github.io').href
const title = catalog.work.title
const description = '배병희 자전소설 · 갯벌에서 들녘까지, 가족과 이웃을 위해 살아온 한평생.'
const imagePath = 'images/bae-byunghee-hero-watercolor.png'
const imageUrl = `${siteUrl}${imagePath}`
const chapterTitles = catalog.readingOrder

function decodeHtml(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
    if (entity.startsWith('#')) {
      return String.fromCodePoint(
        entity[1].toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10)
      )
    }
    return named[entity.toLowerCase()]
  })
}

// Parse the built <head> directly: link-preview crawlers must not need JavaScript.
async function staticHead(path) {
  const html = await readFile(new URL(path, dist), 'utf8')
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]
  assert.ok(head, `${path} must have a static head`)
  const tags = (tag) =>
    [...head.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))].map(([markup]) =>
      Object.fromEntries(
        [...markup.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
          ([, name, doubleQuoted, singleQuoted]) => [
            name.toLowerCase(),
            decodeHtml(doubleQuoted ?? singleQuoted),
          ]
        )
      )
    )
  const metas = tags('meta')
  const links = tags('link')
  return {
    title: decodeHtml(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    meta(name) {
      const matches = metas.filter((meta) => meta.property === name || meta.name === name)
      assert.equal(matches.length, 1, `${path} must have one static ${name} meta tag`)
      assert.ok(matches[0].content, `${path} ${name} must not be empty`)
      return matches[0].content
    },
    link(rel, href) {
      const matches = links.filter(
        (link) => link.rel === rel && (href === undefined || link.href === href)
      )
      assert.equal(matches.length, 1, `${path} must have one ${rel} link to ${href ?? 'its URL'}`)
      return matches[0]
    },
  }
}

function assertPreviewImage(head) {
  assert.equal(head.meta('og:image'), imageUrl)
  assert.equal(head.meta('og:image:secure_url'), imageUrl)
  assert.equal(head.meta('og:image:width'), '1672')
  assert.equal(head.meta('og:image:height'), '941')
  assert.equal(head.meta('og:image:type'), 'image/png')
  assert.ok(head.meta('og:image:alt').trim())
  assert.equal(head.meta('twitter:card'), 'summary_large_image')
  assert.equal(head.meta('twitter:image'), imageUrl)
  assert.equal(head.meta('twitter:image:alt'), head.meta('og:image:alt'))
}

test('home sharing uses the short life description while the visible synopsis stays unchanged', async () => {
  const head = await staticHead('index.html')
  assert.equal(head.title, title)
  assert.equal(head.meta('description'), description)
  assert.equal(head.meta('og:title'), title)
  assert.equal(head.meta('og:site_name'), base === '/audiobooks/' ? 'ToldLife Audiobooks' : title)
  assert.equal(head.meta('og:description'), description)
  assert.equal(head.meta('twitter:title'), title)
  assert.equal(head.meta('twitter:description'), description)
  assert.equal(head.link('canonical').href, siteUrl)
  assert.equal(head.meta('og:url'), siteUrl)
  assertPreviewImage(head)
  const html = await readFile(new URL('index.html', dist), 'utf8')
  const synopsis = html.match(/<div\b[^>]*class="work-synopsis"[^>]*>([\s\S]*?)<\/div>/)?.[1]
  assert.ok(synopsis, 'the home page must retain its visible synopsis')
  assert.deepEqual(
    [...synopsis.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(([, paragraph]) => decodeHtml(paragraph)),
    catalog.work.synopsis,
    'the visible synopsis must remain unchanged when the sharing description changes'
  )
})

test('each episode link uses its current manuscript title and stable canonical URL', async () => {
  for (const chapter of chapterTitles) {
    const head = await staticHead(`read/${chapter.episodeId}.html`)
    const episodeTitle = head.meta('og:title')
    assert.ok(episodeTitle.includes(chapter.title))
    assert.ok(episodeTitle.includes(title))
    assert.ok(head.meta('og:description').includes(chapter.time))
    assert.equal(head.meta('twitter:title'), episodeTitle)
    assert.equal(head.meta('twitter:description'), head.meta('og:description'))
    assert.equal(head.link('canonical').href, `${siteUrl}read/${chapter.episodeId}.html`)
    assert.equal(head.meta('og:url'), `${siteUrl}read/${chapter.episodeId}.html`)
    assertPreviewImage(head)
  }
})

test('home and episode pages expose browser and mobile icons from the deployed base path', async () => {
  for (const page of ['index.html', `read/${chapterTitles[0].episodeId}.html`]) {
    const head = await staticHead(page)
    assert.equal(head.link('icon', `${base}favicon.svg`).type, 'image/svg+xml')
    const favicon = head.link('icon', `${base}favicon-32.png`)
    assert.equal(favicon.type, 'image/png')
    assert.equal(favicon.sizes, '32x32')
    head.link('apple-touch-icon', `${base}apple-touch-icon.png`)
    head.link('manifest', `${base}site.webmanifest`)
  }
})

async function assertPngDimensions(path, width, height) {
  const png = await readFile(new URL(path, dist))
  assert.ok(png.length >= 33, `${path} must contain a PNG header`)
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  assert.equal(png.toString('ascii', 12, 16), 'IHDR')
  assert.equal(png.readUInt32BE(16), width, `${path} width`)
  assert.equal(png.readUInt32BE(20), height, `${path} height`)
}

test('published image files and the mobile manifest use their declared sizes and relative paths', async () => {
  await assertPngDimensions('favicon-32.png', 32, 32)
  await assertPngDimensions('apple-touch-icon.png', 180, 180)
  await assertPngDimensions(imagePath, 1672, 941)
  const svg = await readFile(new URL('favicon.svg', dist), 'utf8')
  assert.match(svg, /<svg\b/)

  const manifest = JSON.parse(await readFile(new URL('site.webmanifest', dist), 'utf8'))
  assert.equal(manifest.name, title)
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.scope, './')
  assert.ok(Array.isArray(manifest.icons))
  for (const size of [192, 512]) {
    const matchingIcons = manifest.icons.filter((icon) => icon.sizes === `${size}x${size}`)
    assert.equal(matchingIcons.length, 1, `manifest must include one ${size}px icon`)
    const icon = matchingIcons[0]
    assert.equal(icon.type, 'image/png')
    assert.equal(typeof icon.src, 'string')
    assert.ok(icon.src.length > 0)
    assert.doesNotMatch(icon.src, /^(?:\/|[a-z][a-z\d+.-]*:)/i, 'icon URL must be relative')
    assert.ok(new URL(icon.src, siteUrl).href.startsWith(siteUrl))
    await assertPngDimensions(icon.src, size, size)
  }
})

test('all legacy decade and heading addresses statically redirect to their numbered canonical episode', async () => {
  for (const [old, id] of Object.entries(legacyEpisodes)) {
    const head = await staticHead(`read/${old}.html`)
    assert.equal(head.link('canonical').href, `${siteUrl}read/${id}.html`)
    const html = await readFile(new URL(`read/${old}.html`, dist), 'utf8')
    assert.ok(html.includes(`http-equiv="refresh" content="0;url=${base}read/${id}.html"`))
    assert.ok(html.includes('location.hash'))
  }
})

test('the retired full-story address statically redirects to the work home', async () => {
  const head = await staticHead('read/life-story.html')
  assert.equal(head.link('canonical').href, siteUrl)
  const html = await readFile(new URL('read/life-story.html', dist), 'utf8')
  assert.ok(html.includes(`http-equiv="refresh" content="0;url=${base}"`))
  assert.ok(!html.includes('episode-illustration'))
  assert.ok(!html.includes('한 번에 읽기'))
})
