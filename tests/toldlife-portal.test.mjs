import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const portal = readFileSync(resolve(root, 'apps/toldlife-portal/index.html'), 'utf8')

test('portal exposes both service routes and crawlable metadata without JavaScript', () => {
  assert.match(portal, /<html lang="ko">/)
  assert.match(portal, /<link rel="canonical" href="https:\/\/toldlife\.duvridge\.com\/">/)
  assert.match(portal, /href="\/novels\/"/)
  assert.match(portal, /href="\/audiobooks\/"/)
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
