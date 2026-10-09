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

function anotherReader(t, options = {}) {
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
        id: 'another-book', title: 'Another book', subtitle: '', synopsis: [], schedule: '',
        cover: { alt: 'Cover', width: 900, height: 600, sources: [{ src: '/art/cover.jpg', width: 900 }] },
        sharing: { description: 'Another book description', image: { src: '/art/share.jpg', alt: 'Preview', width: 1200, height: 800 } },
      },
      illustrations: {},
    },
    ...options,
  })
  return { root, config }
}
const headLink = (page, rel) => page.frontmatter.head.find(([tag, attributes]) => tag === 'link' && attributes.rel === rel)?.[1]
const headMeta = (page, name) => page.frontmatter.head.find(([tag, attributes]) => tag === 'meta' && attributes['http-equiv'] === name)?.[1]

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
