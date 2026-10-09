import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  symlinkSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import matter from 'gray-matter'
import { createMarkdownRenderer, disposeMdItInstance } from 'vitepress'
import { prepareContent as prepareSharedContent, plainText } from '@duvridge/content-processing/catalog/prepare-reader-content.mjs'
import { parseManuscript as parseSharedManuscript } from '@duvridge/content-processing/manuscripts/parse-manuscript.mjs'
import { createLegacyEpisodeMaps } from '@duvridge/content-processing/manuscripts/episode-ids.mjs'
import { episodeIllustrations } from '@duvridge/vitepress-reader/markdown/render-episode-illustrations.ts'
import { loadMusic } from '@duvridge/content-processing/background-music/load-music-manifest.mjs'
import { loadEpisodeIllustrations, parseIllustrationMarkers, stripIllustrationMarkers } from '@duvridge/content-processing/illustrations/load-illustration-manifest.mjs'
import { migrateReading, migrateCompleted } from '@duvridge/reader-ui/state/migrate-reading-history.mjs'
import { resolveBookSource } from '@duvridge/content-processing/source-files/resolve-book-source.mjs'

const repo = process.cwd()
const book = JSON.parse(readFileSync(path.join(repo, 'content/book.json'), 'utf8'))
const { source: bookSource, book: sourceBook } = resolveBookSource({
  repositoryRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), appRoot: repo,
})
const { legacyEpisodes, legacyPageIds } = createLegacyEpisodeMaps(book.legacy)
const parseManuscript = (markdown, warn) => parseSharedManuscript(markdown, warn, { legacyEpisodes })
const prepareContent = options => prepareSharedContent({ book, ...options })
const mainFilename = 'manuscript.md'
const illustratedOriginal = readFileSync(path.join(bookSource, sourceBook.manuscript ?? mainFilename), 'utf8')
// Fixtures without an illustration manifest deliberately contain prose only.
const original = stripIllustrationMarkers(illustratedOriginal)
const silent = { log() {}, warn() {} }

test('앱 작업 사본과 생성된 모든 회차가 현재 정본의 본문·제목·앞뒤 회차를 반영한다', () => {
  assert.equal(readFileSync(path.join(repo, mainFilename), 'utf8'), illustratedOriginal)
  const { content, data } = matter(illustratedOriginal)
  const structure = parseManuscript(content)
  const generated = JSON.parse(readFileSync(path.join(repo, 'site/.vitepress/generated/catalog.json'), 'utf8'))
  assert.equal(generated.work.title, plainText(data.title || sourceBook.work?.title || ''))
  assert.equal(generated.work.subtitle, plainText(data.subtitle || sourceBook.work?.subtitle || ''))
  assert.deepEqual(generated.places, structure.places)
  assert.deepEqual(generated.readingOrder.map(episode => episode.id), structure.episodes.map(episode => episode.id))
  for (const [index, episode] of structure.episodes.entries()) {
    const entry = generated.readingOrder[index]
    const page = matter(readFileSync(path.join(repo, 'site/read', `${episode.id}.md`), 'utf8'))
    assert.equal(entry.title, episode.title)
    assert.equal(entry.time, episode.time)
    assert.equal(entry.label, episode.label)
    assert.equal(entry.number, episode.number)
    assert.deepEqual(entry.place, episode.place)
    assert.equal(page.content.trim(), `# ${episode.title}\n\n${episode.body}`.trim())
    assert.equal(page.data.title, episode.title)
    assert.equal(page.data.shareTitle, `${episode.label} ${episode.title} · ${generated.work.title}`)
    assert.equal(page.data.episodeId, episode.id)
    assert.equal(page.data.time, episode.time)
    assert.equal(page.data.prev?.title ?? null, structure.episodes[index - 1]?.title ?? null)
    assert.equal(page.data.prev?.url ?? null, generated.readingOrder[index - 1]?.url ?? null)
    assert.equal(page.data.next?.title ?? null, structure.episodes[index + 1]?.title ?? null)
    assert.equal(page.data.next?.url ?? null, generated.readingOrder[index + 1]?.url ?? null)
  }
})

test('27개 음악 파일을 원고·회차·음원 파일명과 같은 ID로 빠짐없이 연결한다', () => {
  const episodes = parseManuscript(matter(original).content).episodes
  const music = loadMusic(repo, episodes)
  assert.equal(music.home.src, '/music/intro.mp3')
  assert.equal(music.episodes.prolog.src, '/music/prolog.mp3')
  assert.equal(music.episodes.epilog.src, '/music/epilog.mp3')
  assert.equal(music.episodes['side'].src, '/music/side.mp3')
  assert.equal(Object.keys(music.episodes).length, 26)
  const allSources = [music.home.src, ...Object.values(music.episodes).map(track => track.src)]
  assert.equal(new Set(allSources).size, 27)
  for (const episode of episodes) {
    assert.equal(music.episodes[episode.id].label, `${episode.label} 음악`)
    assert.ok(existsSync(path.join(repo, 'site/public', music.episodes[episode.id].src)))
    if (episode.kind === 'episode')
      assert.equal(music.episodes[episode.id].src, `/music/ep${String(episode.number).padStart(2, '0')}.mp3`)
  }
  assert.equal(music.home.id, 'intro')
  for (const episode of episodes) {
    assert.equal(music.episodes[episode.id].id, episode.id)
    assert.equal(music.episodes[episode.id].src, `/music/${episode.id}.mp3`)
  }
  assert.deepEqual(loadMusic(repo, [...episodes].reverse()), music)
})

test('누락·중복·잘못된 회차·미등록 음악 파일을 준비 단계에서 거절한다', t => {
  const { root, write } = fixture(t)
  const episodes = [
    { id: 'prolog', label: '프롤로그', kind: 'prologue', number: null },
    { id: 'ep01', label: '1화', kind: 'episode', number: 1 },
  ]
  const base = { version: 3, tracks: [
    { id: 'intro', src: '/music/intro.mp3' },
    { id: 'prolog', src: '/music/prolog.mp3' },
    { id: 'ep01', src: '/music/ep01.mp3' },
  ] }
  const manifest = value => write('content/music.json', JSON.stringify(value))
  write('site/public/music/intro.mp3', 'test-intro')
  write('site/public/music/prolog.mp3', 'test-prolog')
  write('site/public/music/ep01.mp3', 'test-episode')
  manifest(base)
  assert.ok(loadMusic(root, episodes))
  manifest({ ...base, version: 1 })
  assert.throws(() => loadMusic(root, episodes), /형식/)
  manifest(base)
  rmSync(path.join(root, 'site/public/music/intro.mp3'))
  assert.throws(() => loadMusic(root, episodes), /파일이 없습니다/)
  write('site/public/music/intro.mp3', 'test-intro')
  manifest({ ...base, tracks: [{ id: 'intro', src: '/music/../intro.mp3' }] })
  assert.throws(() => loadMusic(root, episodes), /ID와 파일명/)
  manifest({ ...base, tracks: [] })
  assert.throws(() => loadMusic(root, episodes), /소개의 배경 음악이 없습니다/)
  manifest({ ...base, tracks: base.tracks.slice(0, 2) })
  assert.throws(() => loadMusic(root, episodes), /회차의 배경 음악이 없습니다/)
  manifest({ ...base, tracks: [...base.tracks, ...base.tracks] })
  assert.throws(() => loadMusic(root, episodes), /회차.*중복/)
  manifest({ ...base, tracks: [{ id: 'unknown', src: '/music/prolog.mp3' }] })
  assert.throws(() => loadMusic(root, episodes), /회차.*잘못/)
  manifest({ ...base, tracks: [{ id: 1, src: '/music/ep01.mp3' }] })
  assert.throws(() => loadMusic(root, episodes), /회차 ID/)
  manifest({ ...base, tracks: [{ id: 'ep01', src: '/music/ep02.mp3' }] })
  assert.throws(() => loadMusic(root, episodes), /ID와 파일명/)
  manifest(base)
  write('site/public/music/extra.mp3', 'unassigned')
  assert.throws(() => loadMusic(root, episodes), /연결하지 않은 음악/)
})

function fixture(t, { excludedEditorialFiles = book.excludedEditorialFiles } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'family-content-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, mainFilename), original)
  const write = (filename, body) => {
    mkdirSync(path.dirname(path.join(root, filename)), { recursive: true })
    writeFileSync(path.join(root, filename), body)
  }
  const run = () => prepareContent({ root, book: { ...book, excludedEditorialFiles }, logger: silent })
  const readPage = (filename) =>
    matter(readFileSync(path.join(root, 'site/read', filename), 'utf8'))
  return { root, write, run, readPage }
}

test('터전 4개와 23화, 앞뒤 회차를 생성하고 정본의 모든 본문을 한 번씩 보존한다', (t) => {
  const { root, run, readPage } = fixture(t)
  const { catalog } = run()
  const structure = parseManuscript(matter(original).content)
  assert.deepEqual(catalog.places.map(place => place.label), ['1936 안면도', '1977 남양만 간척지', '1983 독정 정미소', '2003 독정 RPC'])
  // Each main episode sits under the place heading before it; special episodes belong to none.
  const placeYear = Object.fromEntries(catalog.readingOrder.map(episode => [episode.id, episode.place?.year ?? null]))
  for (const [first, last, year] of [[1, 8, 1936], [9, 11, 1977], [12, 21, 1983], [22, 23, 2003]])
    for (let number = first; number <= last; number++) assert.equal(placeYear[`ep${String(number).padStart(2, '0')}`], year)
  for (const id of ['prolog', 'epilog', 'side']) assert.equal(placeYear[id], null)
  assert.equal(catalog.chapters.length, 23)
  assert.equal(catalog.readingOrder.length, 26)
  assert.equal(readFileSync(path.join(root, mainFilename), 'utf8'), original)
  for (const [i, episode] of structure.episodes.entries()) {
    const page = readPage(`${episode.id}.md`)
    assert.equal(page.content.trim(), `# ${episode.title}\n\n${episode.body}`.trim())
    assert.equal(page.data.time, episode.time)
    assert.equal(page.data.label, episode.label)
    assert.equal('partLabel' in page.data, false)
    assert.equal(page.data.prev?.url ?? null, catalog.readingOrder[i-1]?.url ?? null)
    assert.equal(page.data.next?.url ?? null, catalog.readingOrder[i+1]?.url ?? null)
  }
  assert.equal(readPage('prolog.md').data.pageId, 'prolog')
  assert.equal(readPage('epilog.md').data.pageId, 'epilog')
  assert.equal(readPage('ep01.md').data.pageId, 'ep01')
})

test('긴 문단도 저자가 정한 문단과 줄바꿈을 그대로 보존하며 자동 분할하지 않는다', t => {
  const { root, write, run, readPage } = fixture(t)
  const episode = parseManuscript(matter(original).content).episodes.find(episode => episode.id === 'ep01')
  const paragraph = '아버지는 새벽마다 논으로 나가 이웃들과 함께 하루의 일을 시작했다. '.repeat(12).trim()
  assert.ok(paragraph.length > 150)
  const body = `${paragraph}\n\n다음 문단은 저자가 선택한 위치에서 시작한다.\n본문의 줄바꿈도 그대로 남긴다.`
  const revised = original.replace(episode.body, body)
  write(mainFilename, revised)
  run()
  assert.equal(readFileSync(path.join(root, mainFilename), 'utf8'), revised)
  assert.equal(readPage('ep01.md').content.trim(), `# ${episode.title}\n\n${body}`)
})

test('제목을 바꾸어도 ID를 유지하고 원고 순서와 번호가 어긋나면 생성을 거절한다', (t) => {
  const { write, run } = fixture(t)
  const before = run().catalog.readingOrder
  const body = matter(original).content
  const first = body.indexOf('## 어머니의 쇠갈고리'), second = body.indexOf('## 책보 대신 지게'), third = body.indexOf('## 열두 자리 숫자')
  write(mainFilename, original.replace('어머니의 쇠갈고리', '갯벌의 어머니'))
  const after = run().catalog.readingOrder
  for (const episode of before) {
    const updated = after.find(e => e.episodeId === episode.episodeId)
    assert.equal(updated.url, episode.url)
    assert.equal(updated.id, episode.id)
  }
  const swapped = original.slice(0, original.indexOf(body)) + body.slice(0, first) + body.slice(second, third) + body.slice(first, second) + body.slice(third)
  write(mainFilename, swapped)
  assert.throws(run, /회차 번호와 ID가 맞지 않습니다.*ep01/)
  write(mainFilename, swapped.replace('{#ep02}', '{#pending}').replace('{#ep01}', '{#ep02}').replace('{#pending}', '{#ep01}'))
  const reordered = run().catalog.readingOrder
  assert.equal(reordered.find(e => e.id === 'ep01').title, '책보 대신 지게')
  assert.equal(reordered.find(e => e.id === 'ep02').title, '어머니의 쇠갈고리')
})

test('두 살림 회차의 제목 변경을 목차·공유·이웃 회차에 반영하고 음악·삽화 연결을 유지한다', t => {
  const { write, run, readPage } = fixture(t)
  const before = run().catalog.readingOrder
  const originalEpisodes = parseManuscript(matter(illustratedOriginal).content).episodes
  const originalMusic = loadMusic(repo, originalEpisodes)
  const originalImages = loadEpisodeIllustrations(repo, originalEpisodes)
  let revised = original
  let illustratedRevised = illustratedOriginal
  const titles = { ep05: '안면도 살림의 하루', 'ep11': '독정리 살림의 하루' }
  for (const [id, title] of Object.entries(titles)) {
    const current = before.find(episode => episode.episodeId === id)
    revised = revised.replace(`## ${current.title} {#${id}}`, `## ${title} {#${id}}`)
    illustratedRevised = illustratedRevised.replace(`## ${current.title} {#${id}}`, `## ${title} {#${id}}`)
  }
  write(mainFilename, revised)
  const { catalog } = run()
  const episodes = parseManuscript(matter(revised).content).episodes
  const music = loadMusic(repo, episodes)
  const images = loadEpisodeIllustrations(repo, parseManuscript(matter(illustratedRevised).content).episodes)
  for (const [id, title] of Object.entries(titles)) {
    const index = catalog.readingOrder.findIndex(episode => episode.episodeId === id)
    const episode = catalog.readingOrder[index]
    const previous = before.find(episode => episode.episodeId === id)
    const page = readPage(`${id}.md`)
    assert.equal(episode.title, title)
    assert.equal(episode.id, previous.id)
    assert.equal(episode.url, previous.url)
    assert.equal(page.data.title, title)
    assert.equal(page.data.pageId, previous.id)
    assert.equal(page.data.shareTitle, `${episode.label} ${title} · ${catalog.work.title}`)
    assert.ok(page.content.trimStart().startsWith(`# ${title}\n\n`))
    assert.equal(readPage(`${catalog.readingOrder[index - 1].episodeId}.md`).data.next.title, title)
    assert.equal(readPage(`${catalog.readingOrder[index + 1].episodeId}.md`).data.prev.title, title)
    assert.deepEqual(music.episodes[id], originalMusic.episodes[id])
    assert.deepEqual(images[id], originalImages[id])
  }
  assert.ok(readPage('1960s.md').content.includes('안면도 살림의 하루'))
})

test('정본의 살림 회차 ID를 가리키는 링크는 제목을 바꾸어도 해당 회차로 연결한다', t => {
  const { write, run, readPage } = fixture(t)
  write('content/family.md', `---
id: family
---
# 가족의 생활

[안면도의 살림](../manuscript.md#ep05)

[독정리의 살림](/manuscript.md#ep11)

[다시 읽기][family]

[family]: ../manuscript.md#ep11 "독정리"

[이 문서 안의 기억](#ep11)

[작품 소개](../manuscript.md)

\`\`\`md
[원본 예시](../manuscript.md#ep05)
\`\`\`
`)
  const manuscript = original.replace(/^## .+ \{#ep05\}$/m, '## 안면도에서 보낸 나날 {#ep05}')
    .replace(/^## .+ \{#ep11\}$/m, '## 독정리에서 보낸 나날 {#ep11}')
    .replace(/(?=^## .+ \{#ep06\}$)/m, '[독정리의 살림](#ep11)\n\n[이 회차 안의 기억](#memory)\n\n')
  write(mainFilename, manuscript)
  const { warnings } = run()
  const content = readPage('family.md').content
  assert.ok(content.includes('[안면도의 살림](/read/ep05.html)'))
  assert.ok(content.includes('[독정리의 살림](/read/ep11.html)'))
  assert.ok(content.includes('[family]: /read/ep11.html "독정리"'))
  assert.ok(content.includes('[이 문서 안의 기억](#ep11)'))
  assert.ok(content.includes('[작품 소개](/)'))
  assert.ok(content.includes('[원본 예시](../manuscript.md#ep05)'))
  assert.ok(readPage('ep05.md').content.includes('[독정리의 살림](/read/ep11.html)'))
  assert.ok(readPage('ep05.md').content.includes('[이 회차 안의 기억](#memory)'))
  assert.deepEqual(warnings, [])
})

test('누락·잘못된·중복 ID, 터전 제목, 시점 줄, 예약 ID, 본문 누락을 거절한다', (t) => {
  const { write, run } = fixture(t)
  for (const [from, to, error] of [
    [' {#ep01}', '', /회차 ID/],
    ['{#ep01}', '{#bad_id}', /회차 ID/],
    ['{#ep02}', '{#ep01}', /ID 중복/],
    ['{#ep01}', '{#1930s}', /예약된/],
    ['{#ep01}', '{#prolog}', /회차 번호|ID 중복/],
    ['{#ep01}', '{#ep99}', /회차 번호와 ID/],
    ['{#prolog}', '{#intro}', /예약된/],
    ['{#side}', '{#side-02}', /회차 번호와 ID/],
    ['# 1977. 남양만 간척지', '# 3부. 소금기', /부 제목은 더 쓰지 않습니다/],
    ['# 1983. 독정 정미소', '# 1970. 독정 정미소', /앞 터전보다 뒤/],
    ['# 1983. 독정 정미소', '# 1977. 독정 정미소', /앞 터전보다 뒤/],
    ['# 1977. 남양만 간척지', '# 1977 남양만 간척지', /네 자리 연도, 마침표, 장소/],
    ['# 1977. 남양만 간척지', '# 1977-08. 남양만 간척지', /네 자리 연도, 마침표, 장소/],
    ['# 1936. 안면도\n\n', '# 1936. 안면도\n\n본문\n\n', /터전 제목 아래에는 회차 제목/],
    ['# 1936. 안면도\n\n', '', /본편 회차 앞에 터전 제목/],
    ['# 2003. 독정 RPC', '# 2000. 빈 터전\n\n# 2003. 독정 RPC', /비어 있는 터전: 2000 빈 터전/],
    ['# 1936. 안면도', '# 1936.', /터전 장소는 1~20자/],
    ['# 1936. 안면도', `# 1936. ${'가'.repeat(21)}`, /터전 장소는 1~20자/],
    ['*1940년대 · 안면도 중장리*', '시점 없음', /시점 줄/],
    ['*1940년대 · 안면도 중장리*', `*${'가'.repeat(41)}*`, /시점 줄/],
  ]) {
    const changed = original.replace(from, to)
    assert.notEqual(changed, original, `원고에 없는 문구: ${from}`)
    write(mainFilename, changed); assert.throws(run, error)
  }
  // Twenty syllables is still a place name, even when they arrive decomposed.
  write(mainFilename, original.replace('# 1936. 안면도', `# 1936. ${'가'.repeat(20).normalize('NFD')}`))
  assert.equal(run().catalog.places[0].name, '가'.repeat(20))
  write(mainFilename, '# 1936. 안면도\n\n## 제목 {#ep01}\n\n*1940년*\n')
  assert.throws(run, /본문이 비어/)
})

test('새 회차와 외전은 음악 파일 번호를 쓰며 코드 예시는 구조로 해석하지 않는다', (t) => {
  const { write, run } = fixture(t)
  write(mainFilename, original.replace('## 에필로그.', '## 새 장면 {#ep24}\n\n*2010년대*\n\n새 본문입니다.\n\n```md\n## 예시 {#example}\n```\n\n## 에필로그.') + '\n## 외전. 두 번째 밥상 {#side-02}\n\n*가족의 기억*\n\n새 기억입니다.\n')
  const order = run().catalog.readingOrder
  assert.equal(order.find(e => e.episodeId === 'ep24').number, 24)
  assert.equal(order.some(e => e.episodeId === 'example'), false)
  assert.equal(order.find(e => e.episodeId === 'side').label, '외전 1화')
  assert.equal(order.at(-1).label, '외전 2화')
})

test('회차 안의 소제목은 본문을 보존하고 경고한다', (t) => {
  const { write, run } = fixture(t)
  write(mainFilename, original.replace('## 책보 대신 지게', '### 남아 있는 소제목\n\n## 책보 대신 지게'))
  assert.match(run().warnings.join('\n'), /소제목/)
})

test('옛 주소 36개와 읽기 기록 ID를 번호 회차로 대응한다', (t) => {
  const { run, readPage } = fixture(t)
  const { catalog } = run()
  for (const [old, id] of Object.entries(legacyEpisodes)) {
    const page = readPage(`${old}.md`)
    assert.equal(page.data.redirect, `/read/${id}.html`)
    assert.equal(page.data.pageId, '')
    assert.ok(page.content.includes(`/read/${id}.html`))
    assert.equal(catalog.legacyIds[old], id)
  }
  assert.equal(Object.keys(legacyEpisodes).length, 36)
  for (const [old, id] of Object.entries(legacyPageIds)) assert.equal(catalog.legacyIds[old], id)
})

test('옛 제목 ID로 쓴 정본 링크도 번호 주소로 직접 연결한다', t => {
  const { write, run, readPage } = fixture(t)
  write('content/legacy.md', '---\nid: family\n---\n# 가족\n\n[어머니](../manuscript.md#josae)\n\n[에필로그](../manuscript.md#epilogue)')
  run()
  assert.ok(readPage('family.md').content.includes('[어머니](/read/ep01.html)'))
  assert.ok(readPage('family.md').content.includes('[에필로그](/read/epilog.html)'))
})

test('번호로 바꾼 읽기·완독·이어 읽기 기록은 위치를 보존하고 연대 기록만 처음부터 읽는다', t => {
  const { catalog } = fixture(t).run()
  for (const [old, id] of Object.entries(legacyPageIds)) {
    const entry = catalog.readingOrder.find(e => e.id === id)
    const saved = { id: old, title: '옛 제목', url: '/옛주소', scroll: 480, finished: true }
    assert.deepEqual(migrateReading(catalog, saved), { id, title: entry.title, url: entry.url, scroll: 480, finished: true })
    assert.deepEqual(migrateCompleted(catalog, [old, id, old, 'unknown', null]), [id])
  }
  assert.equal(migrateReading(catalog, { id: 'life-1980s', scroll: 1800 }).scroll, 0)
  assert.equal(migrateReading(catalog, { id: 'ep01', scroll: -2 }).scroll, 0)
  for (const saved of [null, {}, { id: 'unknown', scroll: 2 }, { id: 'ep01', scroll: Infinity }, { id: 'ep01', scroll: '2' }])
    assert.equal(migrateReading(catalog, saved), null)
  assert.deepEqual(migrateCompleted(catalog, {}), [])
})

test('원고·음악·삽화·참고 이미지 인덱스가 같은 회차 ID와 최신 제목을 쓴다', () => {
  const source = readFileSync(path.join(repo, mainFilename), 'utf8')
  const episodes = parseManuscript(matter(source).content).episodes
  const music = loadMusic(repo, episodes)
  const illustrations = loadEpisodeIllustrations(repo, episodes)
  const refs = JSON.parse(readFileSync(path.join(repo, 'content/ref_images/episode-map.json'), 'utf8'))
  const embedded = JSON.parse(readFileSync(path.join(repo, 'content/ref_images/catalog.html'), 'utf8').match(/<script[^>]*id="data"[^>]*>([\s\S]*?)<\/script>/)[1])
  const manifest = JSON.parse(readFileSync(path.join(repo, 'content/ref_images/manifest.json'), 'utf8'))
  const assets = new Map(manifest.assets.map(asset => [asset.id, asset]))
  assert.deepEqual(embedded.manifest, manifest)
  assert.deepEqual(embedded.episodeMap, refs)
  assert.equal(manifest.counts.total, manifest.assets.length)
  for (const asset of manifest.assets) {
    // Git stores these Korean filenames in NFC; macOS alone hides NFD mistakes.
    assert.equal(asset.path, asset.path.normalize('NFC'))
    assert.ok(existsSync(path.join(repo, 'content/ref_images', asset.path)), asset.path)
  }
  assert.equal(refs.manuscript_sha256, createHash('sha256').update(source).digest('hex'))
  assert.deepEqual(refs.episodes.map(e => e.id), episodes.map(e => e.id))
  for (const episode of episodes) {
    const ref = refs.episodes.find(e => e.id === episode.id)
    assert.equal(ref.title.replace(/^(프롤로그|에필로그|외전)\. /, ''), episode.title)
    assert.equal(ref.number, episode.number)
    assert.deepEqual(ref.reference_paths, ref.reference_ids.map(id => assets.get(id)?.path))
    assert.equal(music.episodes[episode.id].id, episode.id)
    assert.ok(illustrations[episode.id].every(image => image.episodeId === episode.id))
  }
  const registry = JSON.parse(readFileSync(path.join(bookSource, 'illustrations/source-images/regeneration-prompts.json'), 'utf8'))
  for (const image of registry.images) {
    assert.ok(illustrations[image.episodeId].some(row => row.id === image.id))
    assert.ok(existsSync(path.join(bookSource, image.master)))
    for (const ref of image.references) {
      assert.equal(ref.path, ref.path.normalize('NFC'))
      assert.ok(existsSync(path.join(bookSource, ref.path)), ref.path)
    }
  }
})

test('콘텐츠를 준비할 때 참고 인덱스와 목록 화면도 원고의 최신 제목·해시로 갱신한다', t => {
  const { root, write, run } = fixture(t)
  const index = JSON.parse(readFileSync(path.join(repo, 'content/ref_images/episode-map.json'), 'utf8'))
  write('content/ref_images/episode-map.json', JSON.stringify(index))
  write('content/ref_images/catalog.html', `<script type="application/json" id="data">${JSON.stringify({ episodeMap: index })}</script>`)
  const revised = original.replace('어머니의 쇠갈고리', '어머니의 손')
  write(mainFilename, revised)
  run()
  const updated = JSON.parse(readFileSync(path.join(root, 'content/ref_images/episode-map.json'), 'utf8'))
  assert.equal(updated.episodes.find(e => e.id === 'ep01').title, '어머니의 손')
  assert.equal(updated.manuscript_sha256, createHash('sha256').update(revised).digest('hex'))
  const embedded = JSON.parse(readFileSync(path.join(root, 'content/ref_images/catalog.html'), 'utf8').match(/id="data">([\s\S]*?)<\/script>/)[1])
  assert.deepEqual(embedded.episodeMap, updated)
})

test('한 번에 읽기 주소는 본문 없이 작품 홈으로 연결하고 목록에서 제거한다', t => {
  const { run, readPage } = fixture(t)
  const { catalog } = run()
  const retired = readPage('life-story.md')
  assert.equal(retired.data.kind, 'redirect')
  assert.equal(retired.data.redirect, '/')
  assert.equal(retired.data.pageId, '')
  assert.equal(retired.content.trim(), '[작품 소개와 회차 목록으로 이동하기](/)')
  assert.ok(!Object.hasOwn(catalog, 'fullStory'))
})

test('루트와 content의 자료를 자동 발견하고 내용 수정에도 문서 ID를 유지한다', (t) => {
  const { root, write, run, readPage } = fixture(t)
  write('할머니 이야기.md', '# 할머니 이야기\n\n어릴 적의 기억입니다.\n')
  write(
    'content/사진/이삿날.md',
    '---\nid: moving-day\ntitle: 이삿날의 기억\ncategory: 사진과 기억\ndate: 1977-04-01\n---\n# 이삿날\n\n비가 내렸습니다.\n'
  )
  const initial = run().catalog.documents
  assert.equal(initial.length, 2)
  const automatic = initial.find(({ title }) => title === '할머니 이야기')
  assert.match(automatic.id, /^doc-[a-f0-9]{12}$/)
  assert.equal(initial.find(({ id }) => id === 'moving-day').category, '사진과 기억')
  assert.equal(readPage('moving-day.md').data.pageId, 'moving-day')
  assert.equal(readPage('moving-day.md').data.date, '1977-04-01')
  write('할머니 이야기.md', '# 바뀐 제목\n\n기억을 더했습니다.\n')
  write('content/사진/이삿날.md', '---\nid: moving-day\n---\n# 고정 아이디\n\n내용도 바뀝니다.\n')
  const updated = run().catalog.documents
  assert.equal(updated.find(({ title }) => title === '바뀐 제목').id, automatic.id)
  assert.ok(existsSync(path.join(root, 'site/read', `${automatic.id}.md`)))
})

test('임시글, 운영 문서, 프로젝트 내부와 심볼릭 링크의 Markdown은 게시하지 않는다', (t) => {
  const { root, write, run } = fixture(t, { excludedEditorialFiles: ['웹소설형_연재_개편_제안서.md', '윤문제안서.md'] })
  for (const filename of [
    'README.md',
    'README.ko.md',
    'AGENTS.md',
    'SETUP.md',
    'DEPLOYMENT.md',
    '웹소설형_연재_개편_제안서.md',
    '윤문제안서.md',
    'content/편집/윤문제안서.md',
    'site/manual.md',
    'scripts/notes.md',
    'node_modules/pkg/README.md',
    '.private.md',
    'content/.hidden/private.md',
  ])
    write(filename, '# 게시하면 안 되는 문서')
  write('content/draft.md', '---\npublished: false\n---\n# 미공개')
  write('content/draft2.md', '---\ndraft: true\n---\n# 초안')
  write('content/visible.md', '# 공개 기록')
  symlinkSync(path.join(root, 'content/visible.md'), path.join(root, 'linked.md'))
  const { catalog } = run()
  assert.deepEqual(
    catalog.documents.map(({ title }) => title),
    ['공개 기록']
  )
})

test('편집노트 폴더는 새 파일명과 하위 폴더를 포함해 게시하지 않고 원본을 보존한다', t => {
  const { root, write, run } = fixture(t)
  const notes = {
    'content/editorial-notes/new-review.md': '# 새 편집 검토\n\n아직 확정하지 않은 수정안.\n',
    'content/editorial-notes/revisions/future-plan.md': '---\npublished: true\n---\n# 다음 개정 계획\n',
  }
  for (const [filename, body] of Object.entries(notes)) write(filename, body)
  write('content/family-memory.md', '# 공개 가족 자료\n')
  const { catalog, manifest } = run()
  assert.deepEqual(catalog.documents.map(document => document.title), ['공개 가족 자료'])
  for (const [filename, body] of Object.entries(notes)) {
    assert.ok(!manifest.sources.some(page => page.source === filename))
    assert.equal(readFileSync(path.join(root, filename), 'utf8'), body)
  }
})

test('편집 제안서는 루트와 content에서 정확한 파일명으로만 제외하며 원본을 보존한다', (t) => {
  const editorial = '# 편집 참고\n\n제안 내용은 사이트에 게시하지 않습니다.\n'
  const editorialNames = [
    '웹소설형_연재_개편_제안서.md',
    '윤문제안서.md',
    '윤문제안서_최종.md',
    '사랑을_주제로_한_일대기_구성_개선_제안서.md',
  ]
  const { root, write, run } = fixture(t, { excludedEditorialFiles: editorialNames })
  const editorialPaths = editorialNames.flatMap((filename) => [
    filename,
    `content/편집/${filename}`,
    `content/맥에서_추가/${filename.normalize('NFD')}`,
  ])
  for (const filename of editorialPaths) write(filename, editorial)
  write('content/윤문제안서_공개.md', '# 가족에게 공유할 제안')
  write('사랑을_주제로_한_일대기.md', '# 사랑을 주제로 한 일대기')
  write('content/가족_제안서.md', '# 가족의 제안')
  const { catalog, manifest } = run()
  assert.deepEqual(
    catalog.documents.map(({ title }) => title).sort(),
    ['가족에게 공유할 제안', '사랑을 주제로 한 일대기', '가족의 제안'].sort()
  )
  for (const filename of editorialPaths) {
    assert.ok(!manifest.sources.some(({ source }) => source === filename))
    assert.equal(readFileSync(path.join(root, filename), 'utf8'), editorial)
  }
})

test('중복 ID, 예약된 회차 ID와 충돌, 안전하지 않은 경로를 빌드 전에 거절한다', (t) => {
  const { write, run } = fixture(t)
  write('content/a.md', '---\nid: repeated\n---\n# 하나')
  write('content/b.md', '---\nid: repeated\n---\n# 둘')
  assert.throws(run, /문서 id 중복: repeated/)
  write('content/b.md', '---\nid: ep01\n---\n# 둘')
  assert.throws(run, /문서 id 중복: ep01/)
  write('content/b.md', '---\nid: 1930s\n---\n# 둘')
  assert.throws(run, /생성 경로 중복: 1930s.md/)
  for (const id of ['../escape', '/absolute', 'has space', '<script>', '한글', 'a'.repeat(81)]) {
    write('content/b.md', `---\nid: ${JSON.stringify(id)}\n---\n# 둘`)
    assert.throws(run, /안전하지 않은 문서 id/)
  }
})

test('자료와 첨부파일의 상대 링크를 게시 경로로 바꾸고 코드블록은 보존한다', (t) => {
  const { root, write, run, readPage } = fixture(t)
  write(
    'content/one.md',
    '---\nid: one\n---\n# 하나\n\n[둘](two.md#추억)\n\n![사진](사진/a.png)\n\n[전체](../manuscript.md)\n\n[참고][two]\n\n[two]: two.md "둘"\n\n```md\n[예시](not-real.md)\n```\n'
  )
  write('content/two.md', '---\nid: two\n---\n# 둘\n\n## 추억\n')
  write('content/사진/a.png', Buffer.from([137, 80, 78, 71]))
  const { manifest, warnings } = run()
  const content = readPage('one.md').content
  assert.ok(content.includes('[둘](/read/two.html#추억)'))
  assert.ok(content.includes('[전체](/)'))
  assert.ok(content.includes('[two]: /read/two.html "둘"'))
  assert.ok(content.includes('[예시](not-real.md)'))
  const attachment = manifest.files.find((filename) => filename.startsWith('assets/'))
  assert.ok(content.includes(`![사진](./${attachment})`))
  assert.ok(existsSync(path.join(root, 'site/read', attachment)))
  assert.deepEqual(warnings, [])
})

test('삭제된 생성 자료만 지우고 직접 작성한 페이지는 보존한다', (t) => {
  const { root, write, run } = fixture(t)
  write('content/extra.md', '---\nid: extra\n---\n# 별도 자료')
  run()
  write('site/read/manual.md', '# 직접 작성한 페이지')
  rmSync(path.join(root, 'content/extra.md'))
  run()
  assert.equal(existsSync(path.join(root, 'site/read/extra.md')), false)
  assert.equal(readFileSync(path.join(root, 'site/read/manual.md'), 'utf8'), '# 직접 작성한 페이지')
  write('content/manual.md', '---\nid: manual\n---\n# 자료')
  assert.throws(run, /직접 작성한 파일을 덮어쓰지 않습니다/)
})

test('목차용 소개와 제목에서 HTML 및 Markdown 문법을 제거한다', (t) => {
  const { write, run } = fixture(t)
  write(
    'content/about.md',
    '---\nid: about\ntitle: "<b>어머니</b>의 **기억**"\ndescription: "<script>alert(1)</script>우리의 [추억](./photo.png)입니다."\n---\n# 소개\n'
  )
  const document = run().catalog.documents[0]
  assert.equal(document.title, '어머니의 기억')
  assert.equal(document.description, '우리의 추억입니다.')
  assert.equal(plainText('<!-- 비공개 --><style>body{}</style>**기억**'), '기억')
  assert.equal(plainText('1972~1973년, 5~6kg, ~~지난 표현~~'), '1972~1973년, 5~6kg, 지난 표현')
})

test('삽화 표시는 HTML을 허용하지 않고 원문·장면 구분과 정확한 삽화 위치를 보존한다', async () => {
  disposeMdItInstance()
  const source = '# 회차\n\n<!-- illustration: scene -->\n\n첫 문단입니다.\n\n* * *\n\n<!-- illustration: second -->\n\n다음 장면입니다.\n'
  const image = { id: 'scene', episodeId: 'sample', alt: '손과 벼를 그린 수채화', width: 1280, height: 720,
    sources: [360, 720, 1280].map(width => ({ src: `/images/episodes/scene-${width}.jpg`, width })) }
  const images = { sample: [
    { ...image, position: { start: true, paragraphIndex: 0 } },
    { ...image, id: 'second', alt: '두 번째 장면', position: { start: false, paragraphIndex: 1 } },
  ] }
  const md = await createMarkdownRenderer(path.join(repo, 'illustrations-renderer'), {
    config(md) { md.set({ html: false }); md.use(episodeIllustrations, { base: '/test/', images }) },
  })
  const render = (text, kind = 'episode') => md.render(text, { frontmatter: { kind, episodeId: 'sample' } })
  const html = render(source)
  assert.equal((html.match(/<figure /g) || []).length, 2)
  assert.ok(html.indexOf('data-illustration="scene"') < html.indexOf('첫 문단입니다.'))
  assert.ok(html.indexOf('<hr>') < html.indexOf('data-illustration="second"'))
  assert.ok(html.indexOf('data-illustration="second"') < html.indexOf('다음 장면입니다.'))
  assert.match(html, /:src="&quot;\/test\/images\/episodes\/scene-720.jpg&quot;"/)
  assert.match(html, /scene-360.jpg 360w, \/test\/images\/episodes\/scene-720.jpg 720w/)
  assert.equal((html.match(/loading="eager"/g) || []).length, 1)
  assert.equal((html.match(/loading="lazy"/g) || []).length, 1)
  assert.equal((html.match(/<hr>/g) || []).length, 1)
  assert.ok(!html.includes('illustration:'))
  assert.equal(html.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>\n/g, ''), render(source, 'document'))
  const uninterrupted = render(source.replace('\n* * *\n', '\n'))
  assert.equal((uninterrupted.match(/<hr>/g) || []).length, 1)
  assert.ok(uninterrupted.indexOf('첫 문단입니다.') < uninterrupted.indexOf('<hr>'))
  assert.ok(uninterrupted.indexOf('<hr>') < uninterrupted.indexOf('data-illustration="second"'))
  assert.ok(!uninterrupted.slice(0, uninterrupted.indexOf('data-illustration="scene"')).includes('<hr>'))
  assert.equal((render(source + '\n```md\n<!-- illustration: second -->\n```\n').match(/data-illustration="second"/g) || []).length, 1)
  assert.ok(!render(source, 'document').includes('<figure'))
  assert.throws(() => render(source.replace('illustration: second', 'illustration: unknown')), /등록되지/)
  assert.throws(() => render(source.replace('다음 장면입니다.', '<!-- illustration: second -->\n\n다음 장면입니다.')), /중복/)
  assert.throws(() => render(source.replace('<!-- illustration: second -->\n\n', '')), /표시가 없습니다/)
  assert.ok(render(source + '\n<script>alert(1)</script>\n').includes('&lt;script&gt;'))
  disposeMdItInstance()
})

test('표시 앞 문단을 윤문·추가·삭제하거나 표시 뒤 문단을 고쳐도 같은 삽화 위치를 사용한다', async t => {
  const { root, write } = fixture(t)
  const images = ['ep01-01', 'ep01-02'].map(id => ({ id, episodeId: 'ep01', alt: '장면', width: 1280, height: 720,
    sources: [360, 720, 1280].map(width => ({ src: `/images/episodes/${id}-${width}.jpg`, width })) }))
  write('content/episode-illustrations.json', JSON.stringify({ version: 2, images }))
  for (const image of images) for (const source of image.sources) write(`site/public${source.src}`, 'fixture')
  const body = '<!-- illustration: ep01-01 -->\n\n첫 문단.\n\n고칠 앞 문단.\n\n<!-- illustration: ep01-02 -->\n\n삽화 다음 문단.'
  const variants = [
    [body, 2, '삽화 다음 문단.'],
    [body.replace('고칠 앞 문단.', '자유롭게 고친 앞 문단이다.'), 2, '삽화 다음 문단.'],
    [body.replace('고칠 앞 문단.', '새로 추가한 문단.\n\n고칠 앞 문단.'), 3, '삽화 다음 문단.'],
    [body.replace('고칠 앞 문단.\n\n', ''), 1, '삽화 다음 문단.'],
    [body.replace('삽화 다음 문단.', '삽화가 붙은 문단도 고쳤다.'), 2, '삽화가 붙은 문단도 고쳤다.'],
  ]
  for (const [edited, paragraphIndex, anchor] of variants) {
    const illustrations = loadEpisodeIllustrations(root, [{ id: 'ep01', body: edited }])
    assert.deepEqual(illustrations.ep01[1].position, { start: false, paragraphIndex })
    disposeMdItInstance()
    const md = await createMarkdownRenderer(path.join(repo, 'stable-marker-renderer'), {
      config(md) { md.set({ html: false }); md.use(episodeIllustrations, { base: '/test/', images: illustrations }) },
    })
    const html = md.render(`# 회차\n\n${edited}`, { frontmatter: { kind: 'episode', episodeId: 'ep01' } })
    assert.match(html, new RegExp(`data-illustration="ep01-02"[\\s\\S]*?<\/figure>\\n<p>${anchor.replaceAll('.', '\\.')}</p>`))
    assert.ok(!html.includes('illustration:'))
  }
  disposeMdItInstance()
})

test('표시는 독립된 줄에만 두고 코드 예시는 위치로 읽지 않는다', () => {
  const source = '<!-- illustration: ep01-01 -->\n\n첫 문단.\n\n```md\n<!-- illustration: sample -->\n```\n\n<!-- illustration: ep01-02 -->\n\n다음 문단.'
  assert.deepEqual(parseIllustrationMarkers(source).map(({ id, paragraphIndex, start }) => ({ id, paragraphIndex, start })), [
    { id: 'ep01-01', paragraphIndex: 0, start: true },
    { id: 'ep01-02', paragraphIndex: 1, start: false },
  ])
  assert.ok(stripIllustrationMarkers(source).includes('<!-- illustration: sample -->'))
  for (const invalid of ['문장 <!-- illustration: ep01-01 -->', '<!-- illustration: BAD -->', '문단.\n<!-- illustration: ep01-01 -->\n\n다음 문단.', '<!-- illustration: ep01-01 -->\n\n'])
    assert.throws(() => parseIllustrationMarkers(invalid), /삽화/)
})

test('누락·중복·미등록·다른 회차의 표시와 잘못된 자산을 준비 단계에서 거절한다', t => {
  const { root, write, run } = fixture(t)
  const images = JSON.parse(readFileSync(path.join(repo, 'content/episode-illustrations.json'), 'utf8')).images
  write(mainFilename, illustratedOriginal)
  for (const image of images) for (const source of [...image.sources, ...image.webpSources ?? []]) write(`site/public${source.src}`, 'fixture')
  const manifest = () => write('content/episode-illustrations.json', JSON.stringify({ version: 2, images }))
  manifest()
  assert.equal(Object.values(run().catalog.illustrations).flat().length, images.length)
  write(mainFilename, illustratedOriginal.replace('<!-- illustration: ep01-02 -->\n\n', ''))
  assert.throws(run, /표시가 없습니다/)
  write(mainFilename, illustratedOriginal.replace('<!-- illustration: ep01-02 -->', '<!-- illustration: ep01-02 -->\n\n중복 표식을 구분하는 문단.\n\n<!-- illustration: ep01-02 -->'))
  assert.throws(run, /중복/)
  write(mainFilename, illustratedOriginal.replace('<!-- illustration: ep01-02 -->', '<!-- illustration: ep01-99 -->'))
  assert.throws(run, /등록되지/)
  write(mainFilename, illustratedOriginal.replace('<!-- illustration: ep01-02 -->', '<!-- illustration: ep03-02 -->'))
  assert.throws(run, /다른 회차/)
  write(mainFilename, illustratedOriginal)
  images[0].position = { beforeParagraph: '옛 위치' }; manifest()
  assert.throws(run, /position을 지우세요/)
  delete images[0].position
  images[0].sources[0].src = '/images/episodes/missing-360.jpg'; manifest()
  assert.throws(run, /안전하지 않은 삽화 파일 경로/)
  images[0].sources[0].src = '/images/episodes/prolog-01-360.jpg'; manifest()
  rmSync(path.join(root, 'site/public/images/episodes/prolog-01-360.jpg'))
  assert.throws(run, /삽화 파일이 없습니다/)
})


test('새 삽화를 기존 표시 사이에 넣거나 이동해도 기존 ID와 자산 주소를 바꾸지 않는다', t => {
  const { root, write } = fixture(t)
  // Asset listing order is deliberately different from narrative order.
  const images = ['ep01-02', 'ep01-01', 'ep01-03'].map(id => ({ id, episodeId: 'ep01', alt: '장면', width: 1280, height: 720,
    sources: [360, 720, 1280].map(width => ({ src: `/images/episodes/${id}-${width}.jpg`, width })) }))
  write('content/episode-illustrations.json', JSON.stringify({ version: 2, images }))
  for (const image of images) for (const source of image.sources) write(`site/public${source.src}`, 'fixture')
  const initial = '<!-- illustration: ep01-01 -->\n\n첫 장면.\n\n<!-- illustration: ep01-03 -->\n\n새로 넣은 장면.\n\n<!-- illustration: ep01-02 -->\n\n원래 다음 장면.'
  const inserted = loadEpisodeIllustrations(root, [{ id: 'ep01', body: initial }]).ep01
  assert.deepEqual(inserted.map(image => image.id), ['ep01-01', 'ep01-03', 'ep01-02'])
  for (const image of inserted) assert.deepEqual(image.sources, images.find(row => row.id === image.id).sources)
  const moved = initial.replace('<!-- illustration: ep01-01 -->', '<!-- illustration: temporary -->')
    .replace('<!-- illustration: ep01-03 -->', '<!-- illustration: ep01-01 -->')
    .replace('<!-- illustration: temporary -->', '<!-- illustration: ep01-03 -->')
  const reordered = loadEpisodeIllustrations(root, [{ id: 'ep01', body: moved }]).ep01
  assert.deepEqual(reordered.map(image => image.id), ['ep01-03', 'ep01-01', 'ep01-02'])
  assert.equal(reordered.find(image => image.position.start).id, 'ep01-03')
  for (const image of reordered) assert.deepEqual(image.sources, images.find(row => row.id === image.id).sources)
  const semantic = { ...images[0], id: 'ep01-oyster-work', sources: [360, 720, 1280].map(width => ({ src: `/images/episodes/ep01-oyster-work-${width}.jpg`, width })) }
  images.push(semantic)
  for (const source of semantic.sources) write(`site/public${source.src}`, 'fixture')
  write('content/episode-illustrations.json', JSON.stringify({ version: 2, images }))
  const expanded = initial.replace('<!-- illustration: ep01-02 -->', '<!-- illustration: ep01-oyster-work -->\n\n의미로 이름 붙인 삽화의 장면.\n\n<!-- illustration: ep01-02 -->')
  assert.deepEqual(loadEpisodeIllustrations(root, [{ id: 'ep01', body: expanded }]).ep01.map(image => image.id), ['ep01-01', 'ep01-03', 'ep01-oyster-work', 'ep01-02'])
})


test('빈 줄 없는 소제목·빈 소제목·장면 구분도 본문 문단을 잃거나 위치를 바꾸지 않는다', () => {
  for (const boundary of ['### 소제목\n', '###\n', '* * *\n', '---\n', '_ _ _\n']) {
    const body = `<!-- illustration: ep01-first -->\n\n${boundary}첫 문단.\n\n<!-- illustration: ep01-next -->\n\n둘째 문단.`
    assert.deepEqual(parseIllustrationMarkers(body).map(({ paragraphIndex, start }) => ({ paragraphIndex, start })), [
      { paragraphIndex: 0, start: true }, { paragraphIndex: 1, start: false },
    ])
  }
  const afterProse = '<!-- illustration: ep01-first -->\n\n첫 문단.\n* * *\n\n<!-- illustration: ep01-next -->\n\n둘째 문단.'
  assert.equal(parseIllustrationMarkers(afterProse)[1].paragraphIndex, 1)
  const mixedCharacters = '<!-- illustration: ep01-first -->\n\n*-_\n\n<!-- illustration: ep01-next -->\n\n둘째 문단.'
  assert.equal(parseIllustrationMarkers(mixedCharacters)[1].paragraphIndex, 1)
  const consecutive = '<!-- illustration: ep01-first -->\n\n<!-- illustration: ep01-next -->\n\n본문.'
  assert.throws(() => parseIllustrationMarkers(consecutive), /하나만/)
})


test('대표 그림은 본문 표식 순서·첫 문단과 분리해 유지하며 나중의 첫 삽화를 허용한다', async t => {
  const { root, write } = fixture(t)
  const images = ['ep01-01', 'ep01-02'].map(id => ({ id, episodeId: 'ep01', alt: '장면', width: 1280, height: 720,
    ...(id === 'ep01-01' ? { representative: true } : {}),
    sources: [360, 720, 1280].map(width => ({ src: `/images/episodes/${id}-${width}.jpg`, width })) }))
  write('content/episode-illustrations.json', JSON.stringify({ version: 2, images }))
  for (const image of images) for (const source of image.sources) write(`site/public${source.src}`, 'fixture')
  const body = '서두의 설명은 그림 없이 읽는다.\n\n<!-- illustration: ep01-02 -->\n\n첫 실제 그림의 장면.\n\n<!-- illustration: ep01-01 -->\n\n나중에 나오는 대표 그림의 장면.'
  const illustrations = loadEpisodeIllustrations(root, [{ id: 'ep01', body }])
  assert.deepEqual(illustrations.ep01.map(image => image.id), ['ep01-02', 'ep01-01'])
  assert.deepEqual(illustrations.ep01.map(image => image.position.start), [false, false])
  assert.equal(illustrations.ep01.find(image => image.representative).id, 'ep01-01')
  disposeMdItInstance()
  const md = await createMarkdownRenderer(path.join(repo, 'independent-representative-renderer'), {
    config(md) { md.set({ html: false }); md.use(episodeIllustrations, { base: '/test/', images: illustrations }) },
  })
  const html = md.render(`# 회차\n\n${body}`, { frontmatter: { kind: 'episode', episodeId: 'ep01' } })
  assert.ok(html.indexOf('서두의 설명은 그림 없이 읽는다.') < html.indexOf('data-illustration="ep01-02"'))
  assert.ok(html.indexOf('data-illustration="ep01-02"') < html.indexOf('data-illustration="ep01-01"'))
  assert.equal((html.match(/loading="eager"/g) ?? []).length, 2)
  assert.equal((html.match(/fetchpriority="high"/g) ?? []).length, 2)
  images[1].representative = true
  write('content/episode-illustrations.json', JSON.stringify({ version: 2, images }))
  assert.throws(() => loadEpisodeIllustrations(root, [{ id: 'ep01', body }]), /하나만/)
  images[0].representative = false; images[1].representative = false
  write('content/episode-illustrations.json', JSON.stringify({ version: 2, images }))
  assert.throws(() => loadEpisodeIllustrations(root, [{ id: 'ep01', body }]), /하나만/)
  delete images[0].representative; delete images[1].representative
  write('content/episode-illustrations.json', JSON.stringify({ version: 2, images }))
  assert.equal(loadEpisodeIllustrations(root, [{ id: 'ep01', body }]).ep01.find(image => image.representative).id, 'ep01-02')
  disposeMdItInstance()
})
