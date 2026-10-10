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

const panelOf = format => portal.match(new RegExp(`<section id="${format}"[\\s\\S]*?</section>`))?.[0]

test('the home has two tabs: the original series and video; the audiobook is inside the original series', () => {
  const tabs = [...portal.matchAll(/<a href="#(\w+)" data-tab="\w+"[^>]*>([^<]+)<\/a>/g)].map(match => [match[1], match[2]])
  assert.deepEqual(tabs, [['novels', '오리지널 시리즈'], ['videos', '영상']])
  assert.equal(panelOf('audiobooks'), undefined)
  assert.match(portal, /value === 'audiobooks' \? 'novels'/)
})

test('the original series leads with the novel and keeps the audiobook as one quiet button', () => {
  const panel = panelOf('novels')
  assert.match(panel, /<a class="big-button" href="\/novels\/example\/ep01" data-action="novels" data-work="example"[^>]*>[\s\S]*?<span>소설<\/span><\/a>/)
  assert.match(panel, /<a class="sub-button" href="\/audiobooks\/example\/">[\s\S]*?<span>오디오북<\/span><\/a>/)
  assert.doesNotMatch(panel, />[^<]*(?:처음부터|읽기|듣기)[^<]*</)
  assert.match(panel, /aria-label="소설 처음부터 읽기"/)
  assert.doesNotMatch(panelOf('videos'), /sub-button/)
})

test('both tabs list works in the same cells; only the original series invites the next original', () => {
  for (const format of ['novels', 'videos']) assert.match(panelOf(format), /<ul class="works" aria-label="작품">/)
  assert.match(panelOf('novels'), /<a class="work-invite" href="https:\/\/www\.duvridge\.com\/ko\/#services">/)
  assert.match(panelOf('novels'), /살아낸 삶이<br>원작이 됩니다/)
  assert.doesNotMatch(panelOf('videos'), /work-invite|원작 의뢰하기/)
  assert.doesNotMatch(portal, /works--(?:poster|square|wide)/)
})
