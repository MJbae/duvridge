import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
import { renderPortal } from '../scripts/render-toldlife-portal.mjs'
const portal = renderPortal([{ id: 'example', title: 'Example', cover: { alt: 'Cover', width: 720, height: 405, sources: [{ src: '/works/example/images/cover.jpg', width: 720 }] }, legacyIds: {}, episodes: [{ id: 'ep01', label: '1화', recorded: true }] }])

test('portal exposes both service routes and crawlable metadata without JavaScript', () => {
  assert.match(portal, /<html lang="ko">/)
  assert.match(portal, /<link rel="canonical" href="https:\/\/toldlife\.duvridge\.com\/">/)
  assert.match(portal, /href="\/novels\/example\/"/)
  assert.match(portal, /href="\/audiobooks\/example\/"/)
  for (const name of ['og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image']) {
    assert.match(portal, new RegExp(`<meta (?:property|name)="${name}" content="[^"]+"`))
  }
  assert.match(portal, /application\/ld\+json/)
  assert.ok(existsSync(resolve(root, 'apps/toldlife-portal/404.html')))
})

test('portal share image has the declared dimensions and its brand icon exists', () => {
  const png = readFileSync(resolve(root, 'apps/company-site/assets/social/toldlife.png'))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 1200)
  assert.equal(png.readUInt32BE(20), 630)
  assert.ok(existsSync(resolve(root, 'apps/company-site/assets/brand/favicon-32.png')))
})

test('portal video tab keeps the legacy alias and exposes the new work route', () => {
  assert.match(portal, /href="\/videos\/example\/"/)
  assert.match(portal, /data-tab="videos"/)
  assert.match(portal, /value === 'video' \? 'videos'/)
})
