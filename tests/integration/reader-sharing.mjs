import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { parseManuscript } from '@duvridge/content-processing/manuscripts/parse-manuscript.mjs'
import { createLegacyEpisodeMaps } from '@duvridge/content-processing/manuscripts/episode-ids.mjs'
import { listBookSources } from '@duvridge/content-processing/source-files/list-book-sources.mjs'
import matter from 'gray-matter'
const app = process.cwd()
const series = path.basename(app).replace('toldlife-', '')
const base = process.env.SITE_BASE || `/${series}/`
const origin = process.env.SITE_ORIGIN || 'https://toldlife.duvridge.com'
const dist = path.join(app, 'site/.vitepress/dist')
const catalogs = JSON.parse(readFileSync(path.join(app, 'site/.vitepress/generated/catalogs.json'), 'utf8'))
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
function page(file) {
  const html = readFileSync(path.join(dist, file), 'utf8')
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/)[1]
  const attribute = (name, value, target) => {
    const tags = [...head.matchAll(/<(?:meta|link)\b[^>]*>/g)].filter(([tag]) => tag.includes(`${name}="${value}"`))
    assert.equal(tags.length, 1, `${file}: one ${value}`)
    return decode(tags[0][0].match(new RegExp(`${target}="([^\"]+)"`))[1])
  }
  return { html, canonical: () => attribute('rel', 'canonical', 'href'), meta: value => attribute('property', value, 'content'), twitter: value => attribute('name', value, 'content'), title: () => decode(head.match(/<title>(.*?)<\/title>/)[1]) }
}
function sharingImage(catalog) {
  const sharing = catalog.work.sharing
  return (series === 'videos' ? sharing.images?.video : sharing.images?.original) ?? sharing.image
}
function assertSharing(page, catalog, { title, description }) {
  const image = sharingImage(catalog)
  const url = `${origin}${base}${image.src.replace(/^\//, '')}`
  assert.equal(page.title(), title)
  assert.equal(page.meta('og:title'), title)
  assert.equal(page.twitter('twitter:title'), title)
  assert.equal(page.meta('og:description'), description)
  assert.equal(page.twitter('twitter:description'), description)
  assert.equal(page.meta('og:site_name'), '인생원작')
  assert.equal(page.meta('og:url'), page.canonical())
  assert.equal(page.meta('og:image'), url)
  assert.equal(page.meta('og:image:secure_url'), url)
  assert.equal(page.meta('og:image:type'), image.type || 'image/png')
  assert.equal(page.meta('og:image:width'), String(image.width))
  assert.equal(page.meta('og:image:height'), String(image.height))
  assert.equal(page.meta('og:image:alt'), image.alt)
  assert.equal(page.twitter('twitter:card'), 'summary_large_image')
  assert.equal(page.twitter('twitter:image'), url)
  assert.equal(page.twitter('twitter:image:alt'), image.alt)
  assert.ok(existsSync(path.join(dist, image.src)))
}
test('each work and chapter shares its own static metadata at a clean canonical endpoint', () => {
  assert.equal(page('index.html').canonical(), `${origin}/`)
  for (const catalog of Object.values(catalogs)) {
    const home = page(`${catalog.work.id}/index.html`)
    assert.equal(home.canonical(), `${origin}${base}${catalog.work.id}/`)
    assertSharing(home, catalog, { title: catalog.work.title, description: catalog.work.sharing.description })
    assert.ok(decode(home.html).includes(catalog.readingOrder[0].title))
    for (const chapter of catalog.readingOrder) {
      const chapterPage = page(`${catalog.work.id}/${chapter.id}.html`)
      assert.equal(chapterPage.canonical(), `${origin}${base}${catalog.work.id}/${chapter.id}`)
      const metadata = matter(readFileSync(path.join(app, `site/${catalog.work.id}/${chapter.id}.md`), 'utf8')).data
      assertSharing(chapterPage, catalog, {
        title: `${chapter.label} ${chapter.title} · ${catalog.work.title}`,
        description: String(metadata.description || catalog.work.sharing.description),
      })
    }
    if (series === 'videos') for (const film of catalog.films ?? []) {
      const filmPage = page(`${catalog.work.id}/${film.id}.html`)
      assert.equal(filmPage.canonical(), `${origin}${base}${catalog.work.id}/${film.id}`)
      assertSharing(filmPage, catalog, {
        title: `${film.title} · ${catalog.work.title}`,
        description: catalog.work.sharing.description,
      })
    }
  }
})
test('legacy episode names resolve directly to current pages without publishing guide pages', () => {
  const moved = JSON.parse(readFileSync(path.join(dist, 'moved-pages.json'), 'utf8')).pages
  for (const catalog of Object.values(catalogs)) {
    if (!catalog.formerPages) continue
    for (const [old, id] of Object.entries(catalog.formerPages)) {
      if (series === 'videos' && (!id || !catalog.readingOrder.some(entry => entry.id === id))) continue
      const folder = series === 'videos' ? '/audiobooks/watch/' : `${base}read/`
      for (const suffix of ['', '.html']) assert.deepEqual(moved.find(row => row.from === `${folder}${old}${suffix}`), { from: `${folder}${old}${suffix}`, to: `${base}${catalog.work.id}/${id}` })
    }
  }
  assert.equal(existsSync(path.join(dist, 'read')), false)
  assert.equal(existsSync(path.join(dist, 'watch')), false)
})
test('published novel paragraphs preserve all canonical manuscript prose', () => {
  if (series !== 'novels') return
  for (const { source, book } of listBookSources(path.resolve(app, '../..'))) {
    const { legacyEpisodes } = createLegacyEpisodeMaps(book.legacy)
    const episodes = parseManuscript(matter(readFileSync(path.join(source, book.manuscript ?? 'manuscript.md'), 'utf8')).content, undefined, { legacyEpisodes }).episodes
    for (const episode of episodes) {
      const sourcePage = matter(readFileSync(path.join(app, `site/${book.id}/${episode.id}.md`), 'utf8'))
      assert.equal(sourcePage.content.trim(), `# ${episode.title}\n\n${episode.body}`.trim())
      const html = decode(page(`${book.id}/${episode.id}.html`).html.replace(/<[^>]*>/g, ''))
      for (const block of episode.body.split(/\n\s*\n/)) {
        if (/^\s*(?:<!--|#|(?:[*_-]\s*){3,}$)/.test(block)) continue
        const prose = block.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim()
        assert.ok(html.replace(/\s+/g, ' ').includes(prose), `${episode.id}: ${prose.slice(0, 40)}`)
      }
    }
  }
})
test('published browser icons and share images retain their declared dimensions', () => {
  const pngSize = file => {
    const bytes = readFileSync(path.join(dist, file))
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  }
  assert.deepEqual(pngSize('favicon-32.png'), [32, 32])
  assert.deepEqual(pngSize('apple-touch-icon.png'), [180, 180])
  const manifest = JSON.parse(readFileSync(path.join(dist, 'site.webmanifest'), 'utf8'))
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`)
    assert.ok(icon)
    assert.deepEqual(pngSize(icon.src), [size, size])
  }
  for (const catalog of Object.values(catalogs)) {
    const image = sharingImage(catalog)
    if (image.type === 'image/png' || image.src.endsWith('.png')) assert.deepEqual(pngSize(image.src), [image.width, image.height])
    const head = page(`${catalog.work.id}/index.html`)
    assert.equal(head.meta('og:image:width'), String(image.width))
    assert.equal(head.meta('og:image:height'), String(image.height))
  }
})
