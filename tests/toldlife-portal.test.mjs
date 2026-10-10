import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { renderPortal } from '../scripts/render-toldlife-portal.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const exampleWork = { id: 'example', title: 'Example', cover: { alt: 'Cover', width: 720, height: 405, sources: [{ src: '/works/example/images/cover.jpg', width: 720 }] }, legacyIds: {}, episodes: [{ id: 'ep01', label: '1화', recorded: true }] }
const portal = renderPortal([exampleWork])
const panelOf = (format, html = portal) => html.match(new RegExp(`<section id="${format}"[\\s\\S]*?</section>`))?.[0]
const workListOf = panel => panel.match(/<ul\b[^>]*class="[^"]*\bworks\b[^"]*"[^>]*>[\s\S]*?<\/ul>/)?.[0]
const heroOf = panel => panel.slice(panel.indexOf('>') + 1, panel.indexOf('<ul'))
const attributesOf = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]))
const runtimeScriptOf = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(source => source.includes('function portalRuntime('))

function runPortal(html, { hash = '', search = '', storage = {}, storageUnavailable = false } = {}) {
  const saved = new Map(Object.entries(storage))
  const element = (attributes = {}, text = '') => {
    const attrs = new Map(Object.entries(attributes))
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean))
    const listeners = new Map()
    const span = { textContent: text }
    return {
      attributes: attrs, classes, listeners, span,
      dataset: Object.fromEntries(Object.entries(attributes).filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5), value])),
      href: attributes.href,
      classList: { toggle(name, force) { if (force) classes.add(name); else classes.delete(name) } },
      setAttribute(name, value) { attrs.set(name, value) },
      removeAttribute(name) { attrs.delete(name) },
      addEventListener(name, callback) { listeners.set(name, callback) },
      querySelector(selector) { assert.equal(selector, 'span'); return span },
    }
  }
  const panels = Object.fromEntries(['novels', 'videos'].map(name => [name, element()]))
  const tabs = Object.fromEntries(['novels', 'videos'].map(name => [name, element({ 'data-tab': name })]))
  const actions = [...html.matchAll(/<a\b([^>]*\bdata-action="[^"]+"[^>]*)>([\s\S]*?)<\/a>/g)].map(match => element(attributesOf(match[1]), match[2].match(/<span>([^<]*)<\/span>/)?.[1]))
  const location = { hash, search }
  const historyCalls = []
  const listeners = new Map()
  runInNewContext(runtimeScriptOf(html), {
    document: {
      getElementById: id => panels[id],
      querySelector(selector) { return tabs[selector.match(/^\[data-tab="(\w+)"\]$/)?.[1]] },
      querySelectorAll(selector) { return selector === '[data-tab]' ? Object.values(tabs) : selector === '[data-action]' ? actions : [] },
    },
    localStorage: {
      getItem(key) { if (storageUnavailable) throw new Error('Storage unavailable'); return saved.get(key) ?? null },
      setItem(key, value) { if (storageUnavailable) throw new Error('Storage unavailable'); saved.set(key, value) },
    },
    location,
    history: { replaceState(state, title, url) { historyCalls.push(url); const next = new URL(url, 'https://toldlife.duvridge.com'); location.hash = next.hash; location.search = next.search } },
    URLSearchParams,
    addEventListener(name, callback) { listeners.set(name, callback) },
  })
  return { panels, tabs, actions, location, historyCalls, listeners, saved }
}

function assertActiveTab(runtime, expected) {
  for (const name of ['novels', 'videos']) {
    assert.equal(runtime.panels[name].classes.has('is-active'), name === expected)
    assert.equal(runtime.tabs[name].attributes.get('aria-current'), name === expected ? 'page' : undefined)
  }
}

test('portal exposes service metadata and a crawlable work route without JavaScript', () => {
  assert.match(portal, /<html lang="ko">/)
  assert.match(portal, /<link rel="canonical" href="https:\/\/toldlife\.duvridge\.com\/">/)
  assert.match(portal, /href="\/novels\/example\/"/)
  assert.match(portal, /"name":"오디오북","url":"https:\/\/toldlife\.duvridge\.com\/audiobooks\/"/)
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

test('the home has two tabs: the original series and video; the audiobook is inside the original series', () => {
  const tabs = [...portal.matchAll(/<a href="#(\w+)" data-tab="\w+"[^>]*>([^<]+)<\/a>/g)].map(match => [match[1], match[2]])
  assert.deepEqual(tabs, [['novels', '오리지널 시리즈'], ['videos', '영상']])
  assert.equal(panelOf('audiobooks'), undefined)
  assert.match(portal, /value === 'audiobooks' \? 'novels'/)
})

test('the original series hero is one accessible work link with no nested links or buttons', () => {
  const work = { ...exampleWork, title: '내 논을 파는 한이 있어도', episodes: [{ id: 'ep01', recorded: true }, { id: 'ep02', recorded: false }, { id: 'ep03', recorded: true }] }
  const hero = heroOf(panelOf('novels', renderPortal([work])))
  const opening = hero.match(/^<a\b[^>]*>/)?.[0]
  assert.ok(opening, 'the whole hero is a link')
  const attributes = attributesOf(opening)
  assert.equal(attributes.href, '/novels/example/')
  assert.equal(attributes['aria-label'], '내 논을 파는 한이 있어도 작품 보기')
  assert.equal((hero.match(/<a\b/g) || []).length, 1)
  assert.equal((hero.match(/<\/a>/g) || []).length, 1)
  assert.match(hero, /<h2 class="hero-title">내 논을 파는 한이 있어도<\/h2>/)
  assert.match(hero, /<span class="hero-meta">소설 · 오디오북 · 3화<\/span>/)
  assert.match(hero, /<span class="hero-chevron" aria-hidden="true">[\s\S]*?<\/span>/)
  assert.match(hero, /<img\b[^>]*alt=""[^>]*fetchpriority="high"/)
  assert.doesNotMatch(hero, /<button\b|hero-actions|big-button|sub-button|data-action|tabindex="-1"/)
})

test('work link names and metadata escape authored titles while retaining the episode count', () => {
  const html = renderPortal([{ ...exampleWork, title: '삶 & "장면" <원작>' }])
  const hero = heroOf(panelOf('novels', html))
  assert.match(hero, /aria-label="삶 &amp; &quot;장면&quot; &lt;원작&gt; 작품 보기"/)
  assert.match(hero, /<h2 class="hero-title">삶 &amp; &quot;장면&quot; &lt;원작&gt;<\/h2>/)
  assert.match(hero, /소설 · 오디오북 · 1화/)
})

test('a lone featured work leaves one full-width invitation instead of a duplicate work cell', () => {
  const list = workListOf(panelOf('novels'))
  assert.match(list, /class="works works--invite-only"/)
  assert.equal((list.match(/<li\b/g) || []).length, 1)
  assert.match(list, /<a class="work-invite work-invite--wide" href="https:\/\/www\.duvridge\.com\/ko\/#services">/)
  assert.match(list, /<span class="invite-line">살아낸 삶이 원작이 됩니다<\/span>/)
  assert.match(list, /<span class="work-name">원작 의뢰하기<\/span>/)
  assert.match(list, /class="invite-dot" aria-hidden="true"/)
  assert.doesNotMatch(list, /href="\/novels\/example\/"|<img\b|<br\s*\/?\s*>/)
  assert.doesNotMatch(panelOf('videos'), /work-invite|원작 의뢰하기/)
})

test('multiple works keep ordinary grid cells and exclude only the featured original', () => {
  const html = renderPortal([exampleWork, { ...exampleWork, id: 'second', title: '둘째 원작' }, { ...exampleWork, id: 'third', title: '셋째 원작' }])
  const list = workListOf(panelOf('novels', html))
  assert.match(list, /<ul class="works" aria-label="작품">/)
  const destinations = [...list.matchAll(/<li><a\b[^>]*href="([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(destinations, ['/novels/second/', '/novels/third/', 'https://www.duvridge.com/ko/#services'])
  assert.match(list, /class="work-invite"/)
  assert.match(list, /살아낸 삶이<br>원작이 됩니다/)
  assert.doesNotMatch(list, /works--invite-only|work-invite--wide|href="\/novels\/example\/"/)
})

test('the video tab keeps its lead film and watch button while listing only the remaining films', () => {
  const filmPortal = renderPortal([{ ...exampleWork,
    films: [{ id: 'short', title: '짧은 영상', card: { src: '/works/example/images/films/short-card.jpg', width: 720, height: 1080, alt: '그림' } }, { id: 'second', title: '둘째 영상', card: { src: '/works/example/images/films/second-card.jpg', width: 720, height: 1080, alt: '그림' } }] }])
  const videos = panelOf('videos', filmPortal)
  const hero = heroOf(videos)
  assert.match(hero, /<img src="\/novels\/works\/example\/images\/films\/short-card\.jpg"[^>]*alt=""/)
  assert.match(hero, /<h2 class="hero-title"><a href="\/videos\/example\/short">짧은 영상<\/a><\/h2><span class="hero-origin">원작 · Example<\/span>/)
  assert.match(hero, /<a class="big-button" href="\/videos\/example\/short">[\s\S]*?<span>보기<\/span><\/a>/)
  assert.doesNotMatch(videos, /data-action|sub-button/)
  const list = workListOf(videos)
  const cells = [...list.matchAll(/<li><a href="([^"]+)">/g)].map(match => match[1])
  assert.deepEqual(cells, ['/videos/example/second', '/videos/example/'])
  assert.doesNotMatch(list, /href="\/videos\/example\/short"|짧은 영상|short-card\.jpg/)
  assert.doesNotMatch(panelOf('novels', filmPortal), /짧은 영상/)
})

test('a single film is not repeated and every original still exposes its episode videos', () => {
  const film = { id: 'only', title: '대표 영상', card: { src: '/works/example/images/film.jpg', width: 720, height: 1080, alt: '그림' } }
  const html = renderPortal([{ ...exampleWork, films: [film] }, { ...exampleWork, id: 'second', title: '둘째 원작' }])
  const list = workListOf(panelOf('videos', html))
  const destinations = [...list.matchAll(/<li><a href="([^"]+)">/g)].map(match => match[1])
  assert.deepEqual(destinations, ['/videos/example/', '/videos/second/'])
  assert.doesNotMatch(list, /대표 영상|href="\/videos\/example\/only"/)
})

test('the portal runtime preserves address aliases and saved tab choices', () => {
  for (const scenario of [
    { search: '?tab=videos', saved: 'novels', expected: 'videos' },
    { hash: '#video', search: '?tab=novels', saved: 'novels', expected: 'videos' },
    { hash: '#audiobooks', saved: 'videos', expected: 'novels' },
    { search: '?tab=audiobooks', saved: 'videos', expected: 'novels' },
    { saved: 'video', expected: 'videos' },
    { saved: 'audiobooks', expected: 'novels' },
    { saved: 'unknown', expected: 'novels' },
  ]) {
    const runtime = runPortal(portal, { ...scenario, storage: { 'family-library:home-tab': scenario.saved } })
    assertActiveTab(runtime, scenario.expected)
    assert.equal(runtime.saved.get('family-library:home-tab'), scenario.expected)
  }
})

test('tab clicks and hash changes keep the active tab, accessible state and storage in sync', () => {
  const runtime = runPortal(portal)
  let prevented = false
  runtime.tabs.videos.listeners.get('click')({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.deepEqual(runtime.historyCalls, ['/#videos'])
  assertActiveTab(runtime, 'videos')
  assert.equal(runtime.saved.get('family-library:home-tab'), 'videos')
  runtime.location.hash = '#audiobooks'
  runtime.listeners.get('hashchange')()
  assertActiveTab(runtime, 'novels')
  assert.equal(runtime.saved.get('family-library:home-tab'), 'novels')
  runtime.location.hash = '#unknown'
  runtime.listeners.get('hashchange')()
  assertActiveTab(runtime, 'novels')
})

test('tabs still switch when browser storage is unavailable', () => {
  const runtime = runPortal(portal, { storageUnavailable: true })
  assertActiveTab(runtime, 'novels')
  runtime.tabs.videos.listeners.get('click')({ preventDefault() {} })
  assertActiveTab(runtime, 'videos')
})

test('the video fallback retains narration resume and legacy migration without novel resume listeners', () => {
  const work = { ...exampleWork, legacyRoot: true, legacyIds: { old02: 'ep02' }, episodes: [{ id: 'ep01', label: '1화', recorded: false }, { id: 'ep02', label: '2화', recorded: true }, { id: 'ep03', label: '3화', recorded: true }] }
  const html = renderPortal([work])
  const narration = JSON.stringify({ id: 'old02', finished: true })
  const runtime = runPortal(html, { storage: { 'family-library:narration': narration, 'family-library:example:reading': JSON.stringify({ id: 'ep03', finished: true }) } })
  assert.equal(runtime.actions.length, 1)
  const [button] = runtime.actions
  assert.equal(button.dataset.action, 'videos')
  assert.equal(button.href, '/videos/example/ep02')
  assert.equal(button.span.textContent, '2화 이어 보기')
  assert.equal(runtime.saved.get('family-library:example:narration'), narration)
  assert.equal(runtime.saved.get('family-library:narration'), narration)
  assert.equal(button.listeners.has('click'), false)
  assert.match(heroOf(panelOf('novels', html)), /href="\/novels\/example\/"/)
  const runtimeCode = runtimeScriptOf(html).match(/\(function portalRuntime\(works\) \{([\s\S]+?)\}\)\(/)?.[1]
  assert.ok(runtimeCode)
  assert.doesNotMatch(runtimeCode, /key\('(?:reading|resume)'\)|saved\.finished|work\.episodes\[index \+ 1\]|tab === 'novels'/)
})

test('unrecorded or unknown narration progress leaves the video fallback at its first recorded episode', () => {
  const work = { ...exampleWork, episodes: [{ id: 'ep01', label: '1화', recorded: false }, { id: 'ep02', label: '2화', recorded: true }] }
  for (const id of ['ep01', 'missing']) {
    const runtime = runPortal(renderPortal([work]), { storage: { 'family-library:example:narration': JSON.stringify({ id }) } })
    assert.equal(runtime.actions[0].href, '/videos/example/ep02')
    assert.equal(runtime.actions[0].span.textContent, '처음부터 보기')
  }
})
