import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createReaderConfig, formerPageRules } from '../src/config/create-reader-config.mts'

// A second book catches accidental reliance on the original book or reader service.
test('book metadata and the app origin determine sharing and cover preloads', t => {
  const overrides = Object.fromEntries(['SITE_BASE', 'SITE_ORIGIN'].map(key => [key, process.env[key]]))
  for (const key of Object.keys(overrides)) delete process.env[key]
  t.after(() => {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const root = mkdtempSync(path.join(os.tmpdir(), 'reader-config-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const config = createReaderConfig({
    root,
    defaultBase: '/another-reader/',
    defaultOrigin: 'https://reader.example.test',
    catalog: {
      work: {
        title: 'Another book', subtitle: 'Another author', synopsis: ['A new story'], schedule: '',
        cover: { alt: 'Another cover', width: 900, height: 600,
          sources: [{ src: '/art/cover.jpg', width: 900 }],
          webpSources: [{ src: '/art/cover.webp', width: 900 }] },
        sharing: { description: 'Another book description',
          image: { src: '/art/share.jpg', alt: 'Another preview', width: 1200, height: 800, type: 'image/jpeg' } },
      },
      illustrations: {},
    },
  })
  const imagePage = { title: 'Home', relativePath: 'index.md', frontmatter: { layout: 'home' } }
  config.transformPageData(imagePage)
  const meta = property => imagePage.frontmatter.head.find(([tag, attributes]) => tag === 'meta' && attributes.property === property)?.[1].content
  assert.equal(config.title, 'Another book')
  assert.equal(config.description, 'Another book description')
  assert.equal(meta('og:image'), 'https://reader.example.test/another-reader/art/share.jpg')
  assert.equal(meta('og:image:alt'), 'Another preview')
  assert.equal(meta('og:image:type'), 'image/jpeg')
  assert.equal(meta('og:image:width'), '1200')
  assert.equal(meta('og:image:height'), '800')
  const page = { title: 'Home', relativePath: 'index.md', frontmatter: { layout: 'home' } }
  config.transformPageData(page)
  assert.equal(page.title, 'Another book')
  assert.equal(page.description, 'Another book description')
  const preload = page.frontmatter.head.find(([tag, attributes]) => tag === 'link' && attributes.rel === 'preload')
  assert.equal(preload[1].imagesrcset, '/another-reader/art/cover.webp 900w')
  assert.equal(preload[1].type, 'image/webp')
  const canonical = page.frontmatter.head.find(([tag, attributes]) => tag === 'link' && attributes.rel === 'canonical')
  assert.equal(canonical[1].href, 'https://reader.example.test/another-reader/')
})

function readerCatalog(id = 'another-book', title = 'Another book', sharing = {
  description: 'Another book description',
  image: { src: '/art/share.jpg', alt: 'Preview', width: 1200, height: 800 },
}) {
  return {
    work: {
      id, title, subtitle: '', synopsis: [], schedule: '',
      cover: { alt: 'Cover', width: 900, height: 600, sources: [{ src: '/art/cover.jpg', width: 900 }] },
      sharing,
    },
    illustrations: {}, readingOrder: [], documents: [],
  }
}

function anotherReader(t, options = {}, environment = {}) {
  const overrides = Object.fromEntries(['SITE_BASE', 'SITE_ORIGIN'].map(key => [key, process.env[key]]))
  for (const key of Object.keys(overrides)) delete process.env[key]
  t.after(() => {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  Object.assign(process.env, environment)
  const root = mkdtempSync(path.join(os.tmpdir(), 'reader-config-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const config = createReaderConfig({
    root,
    defaultBase: '/another-reader/',
    defaultOrigin: 'https://reader.example.test',
    catalog: readerCatalog(),
    ...options,
  })
  return { root, config }
}
const headLink = (page, rel) => page.frontmatter.head.find(([tag, attributes]) => tag === 'link' && attributes.rel === rel)?.[1]
const headMeta = (page, name) => page.frontmatter.head.find(([tag, attributes]) => tag === 'meta' && attributes['http-equiv'] === name)?.[1]
const socialMeta = (page, name) => page.frontmatter.head.find(([tag, attributes]) => tag === 'meta' && (attributes.property === name || attributes.name === name))?.[1].content

for (const series of ['novels', 'audiobooks', 'videos']) {
  test(`${series} selects its sharing image independently of SITE_BASE`, t => {
    const images = {
      original: { src: '/art/original.png', alt: 'Original preview', width: 1200, height: 630, type: 'image/png' },
      video: { src: '/art/video.jpg', alt: 'Video preview', width: 1280, height: 720, type: 'image/jpeg' },
    }
    const { config } = anotherReader(t, {
      series,
      defaultBase: `/${series}/`,
      siteNames: { [`/${series}/`]: 'Reader platform' },
      catalog: readerCatalog('another-book', 'Another book', {
        description: 'The work description',
        image: { src: '/art/fallback.png', alt: 'Fallback preview', width: 1200, height: 630 },
        images,
      }),
      preparePage(page) { page.frontmatter.shareTitle = 'Another book · Series suffix' },
    }, { SITE_BASE: '/preview-reader/' })
    const home = { title: 'Home', relativePath: 'another-book/index.md', frontmatter: { layout: 'home', description: 'Ignored home description' } }
    config.transformPageData(home)
    const image = images[series === 'videos' ? 'video' : 'original']
    const imageUrl = `https://reader.example.test/preview-reader/${image.src.slice(1)}`
    assert.equal(socialMeta(home, 'og:image'), imageUrl)
    assert.equal(socialMeta(home, 'og:image:secure_url'), imageUrl)
    assert.equal(socialMeta(home, 'og:image:type'), image.type)
    assert.equal(socialMeta(home, 'og:image:width'), String(image.width))
    assert.equal(socialMeta(home, 'og:image:height'), String(image.height))
    assert.equal(socialMeta(home, 'og:image:alt'), image.alt)
    assert.equal(socialMeta(home, 'twitter:card'), 'summary_large_image')
    assert.equal(socialMeta(home, 'twitter:image'), imageUrl)
    assert.equal(socialMeta(home, 'twitter:image:alt'), image.alt)
    assert.equal(socialMeta(home, 'og:title'), 'Another book')
    assert.equal(socialMeta(home, 'twitter:title'), 'Another book')
    assert.equal(socialMeta(home, 'og:description'), 'The work description')
    assert.equal(socialMeta(home, 'twitter:description'), 'The work description')
    assert.equal(home.titleTemplate, false)
    assert.equal(home.frontmatter.titleTemplate, false)
    assert.equal(config.head.find(([, attributes]) => attributes.property === 'og:site_name')[1].content, 'Reader platform')
  })
}

test('books without a matching format override keep their default sharing image', t => {
  const { root } = anotherReader(t)
  const fallback = { src: '/art/default.png', alt: 'Default preview', width: 1200, height: 630 }
  for (const series of ['novels', 'audiobooks', 'videos']) {
    for (const images of [undefined, series === 'videos' ? { original: { ...fallback, src: '/art/original.png' } } : { video: { ...fallback, src: '/art/video.png' } }]) {
      const config = createReaderConfig({
        root, series, defaultBase: '/reader/', defaultOrigin: 'https://reader.example.test',
        catalog: readerCatalog('future-book', 'Future book', { description: 'Future description', image: fallback, images }),
      })
      const page = { title: 'Home', relativePath: 'future-book/index.md', frontmatter: { layout: 'home' } }
      config.transformPageData(page)
      assert.equal(socialMeta(page, 'og:image'), 'https://reader.example.test/reader/art/default.png')
      assert.equal(socialMeta(page, 'twitter:image:alt'), 'Default preview')
      assert.equal(socialMeta(page, 'og:image:type'), 'image/png')
    }
  }
})

test('selected works supply their own previews, home descriptions, and episode titles', t => {
  const first = readerCatalog()
  const second = readerCatalog('second-book', 'Second book', {
    description: 'Second description',
    image: { src: '/art/second.png', alt: 'Second preview', width: 1200, height: 630 },
    images: { video: { src: '/art/second-video.png', alt: 'Second video preview', width: 1200, height: 630 } },
  })
  const { config } = anotherReader(t, { series: 'videos', catalog: first, catalogs: { 'another-book': first, 'second-book': second } })
  const home = { title: 'Home', relativePath: 'second-book/index.md', frontmatter: { layout: 'home', workId: 'second-book' } }
  config.transformPageData(home)
  assert.equal(socialMeta(home, 'og:image'), 'https://reader.example.test/another-reader/art/second-video.png')
  assert.equal(socialMeta(home, 'og:image:alt'), 'Second video preview')
  assert.equal(socialMeta(home, 'og:title'), 'Second book')
  assert.equal(socialMeta(home, 'og:description'), 'Second description')
  const episode = { title: 'First chapter', relativePath: 'second-book/ep01.md', frontmatter: { kind: 'episode', workId: 'second-book', description: 'Episode description', shareTitle: '1화 First chapter · Second book' } }
  config.transformPageData(episode)
  assert.equal(socialMeta(episode, 'og:image'), socialMeta(home, 'og:image'))
  assert.equal(socialMeta(episode, 'og:title'), '1화 First chapter · Second book')
  assert.equal(socialMeta(episode, 'twitter:title'), '1화 First chapter · Second book')
  assert.equal(socialMeta(episode, 'og:description'), 'Episode description')
  assert.equal(socialMeta(episode, 'twitter:description'), 'Episode description')
  const plainEpisode = { title: 'Second chapter', relativePath: 'second-book/ep02.md', frontmatter: { kind: 'episode', workId: 'second-book' } }
  config.transformPageData(plainEpisode)
  assert.equal(socialMeta(plainEpisode, 'og:title'), 'Second chapter · Second book')
  assert.equal(socialMeta(plainEpisode, 'og:description'), 'Second description')
  const unknownWork = { title: 'Home', relativePath: 'unknown/index.md', frontmatter: { layout: 'home', workId: 'unknown' } }
  config.transformPageData(unknownWork)
  assert.equal(socialMeta(unknownWork, 'og:title'), 'Another book')
  assert.equal(socialMeta(unknownWork, 'og:image'), 'https://reader.example.test/another-reader/art/share.jpg')
})

test('a work keeps its home and episodes in its own folder at addresses without .html', t => {
  const { config } = anotherReader(t)
  assert.equal(config.cleanUrls, true)
  const home = { title: '', relativePath: 'another-book/index.md', frontmatter: { layout: 'home' } }
  const episode = { title: 'First', relativePath: 'another-book/ep01.md', frontmatter: { kind: 'episode', episodeId: 'ep01', shareTitle: '1화 First · Another book' } }
  config.transformPageData(home)
  config.transformPageData(episode)
  assert.equal(headLink(home, 'canonical').href, 'https://reader.example.test/another-reader/another-book/')
  assert.equal(headLink(episode, 'canonical').href, 'https://reader.example.test/another-reader/another-book/ep01')
})

test('the series root sends readers to its tab on the platform home', t => {
  const { config } = anotherReader(t)
  const root = { title: '', relativePath: 'index.md', frontmatter: { kind: 'redirect', formatRoot: true } }
  config.transformPageData(root)
  assert.equal(root.frontmatter.redirectTo, '/?tab=another-reader')
  assert.equal(headMeta(root, 'refresh').content, '0;url=/?tab=another-reader')
  assert.equal(headLink(root, 'canonical').href, 'https://reader.example.test/')
})

test('the build lists every former address with the page that replaced it', async t => {
  const { root, config } = anotherReader(t, {
    movedPages: ({ base, work }) => formerPageRules({ folder: '/old-reader/read/', home: `${base}${work}/`, pages: { ep01: 'ep01', chapter1: 'ep01', 'life-story': '' } }),
  })
  await config.buildEnd({ outDir: root })
  const moved = JSON.parse(readFileSync(path.join(root, 'moved-pages.json'), 'utf8'))
  assert.deepEqual(moved, { version: 1, pages: [
    { from: '/old-reader/read/ep01.html', to: '/another-reader/another-book/ep01' },
    { from: '/old-reader/read/ep01', to: '/another-reader/another-book/ep01' },
    { from: '/old-reader/read/chapter1.html', to: '/another-reader/another-book/ep01' },
    { from: '/old-reader/read/chapter1', to: '/another-reader/another-book/ep01' },
    { from: '/old-reader/read/life-story.html', to: '/another-reader/another-book/' },
    { from: '/old-reader/read/life-story', to: '/another-reader/another-book/' },
  ] })
})

test('a build without moved pages writes an empty list', async t => {
  const { root, config } = anotherReader(t)
  await config.buildEnd({ outDir: root })
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'moved-pages.json'), 'utf8')).pages, [])
})
