import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createReaderConfig } from '../src/config/create-reader-config.mts'

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
  const meta = property => config.head.find(([tag, attributes]) => tag === 'meta' && attributes.property === property)?.[1].content
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
