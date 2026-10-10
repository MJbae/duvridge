import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { listBookSources } from '../src/source-files/list-book-sources.mjs'
import { prepareWorkCatalogs } from '../src/source-files/prepare-work-catalogs.mjs'
const make = t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'work-catalogs-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, data) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), data) }
  write('service-registry.json', JSON.stringify({ bookCatalog: { path: 'content/books' }, services: [{ path: 'apps/reader', bookCatalog: true }] }))
  const book = (id, legacyRoot = false) => {
    write(`content/books/${id}/book.json`, JSON.stringify({ id, legacy: { servedAtRoot: legacyRoot }, work: { title: id }, cover: { sources: [{ src: '/images/cover.jpg', width: 720 }] } }))
    write(`content/books/${id}/manuscript.md`, `---\ntitle: "${id} source title"\n---\n# 2000. 시험 마을\n\n## 시작 {#ep01}\n\n*2000년, 시험 마을*\n\n${id}의 첫 문단.\n\n## 다음 {#ep02}\n\n*2001년, 시험 마을*\n\n${id}의 둘째 문단.\n`)
    write(`content/books/${id}/public/images/cover.jpg`, id)
  }
  return { root, write, book }
}
test('two works with identical episode IDs get separate pages, catalogs and media; removed works disappear', t => {
  const { root, book } = make(t); book('first', true); book('second')
  const appRoot = path.join(root, 'apps/reader')
  const { catalogs } = prepareWorkCatalogs({ repositoryRoot: root, appRoot })
  assert.deepEqual(Object.keys(catalogs), ['first', 'second'])
  for (const id of ['first', 'second']) {
    assert.equal(catalogs[id].work.title, `${id} source title`)
    assert.equal(catalogs[id].readingOrder[0].url, `/${id}/ep01`)
    assert.equal(catalogs[id].work.cover.sources[0].src, `/works/${id}/images/cover.jpg`)
    assert.match(readFileSync(path.join(appRoot, `site/${id}/ep01.md`), 'utf8'), new RegExp(`${id}의 첫 문단`))
    assert.equal(readFileSync(path.join(appRoot, `site/public/works/${id}/images/cover.jpg`), 'utf8'), id)
  }
  assert.equal(catalogs.first.formerPages.ep01, 'ep01')
  assert.equal(catalogs.second.formerPages, undefined)
  rmSync(path.join(root, 'content/books/second'), { recursive: true })
  prepareWorkCatalogs({ repositoryRoot: root, appRoot })
  assert.equal(existsSync(path.join(appRoot, 'site/second/ep01.md')), false)
  assert.equal(existsSync(path.join(appRoot, 'site/.vitepress/generated/works/second.json')), false)
})
test('reserved, mismatched and duplicate legacy work IDs fail before build', t => {
  const { root, write, book } = make(t); book('first', true); book('second', true)
  assert.throws(() => listBookSources(root), /하나만/)
  rmSync(path.join(root, 'content/books/second'), { recursive: true }); book('read')
  assert.throws(() => listBookSources(root), /예약된/)
  rmSync(path.join(root, 'content/books/read'), { recursive: true })
  write('content/books/first/book.json', JSON.stringify({ id: 'other' }))
  assert.throws(() => listBookSources(root), /작품 id/)
})

test('materialized work pages preserve hand-written files and reject a conflicting page', t => {
  const { root, book, write } = make(t); book('first', true)
  const appRoot = path.join(root, 'apps/reader')
  prepareWorkCatalogs({ repositoryRoot: root, appRoot })
  write('apps/reader/site/first/manual.md', '# Manual')
  prepareWorkCatalogs({ repositoryRoot: root, appRoot })
  assert.equal(readFileSync(path.join(appRoot, 'site/first/manual.md'), 'utf8'), '# Manual')
  book('second')
  write('apps/reader/site/second/ep01.md', '# Manual conflict')
  assert.throws(() => prepareWorkCatalogs({ repositoryRoot: root, appRoot }), /직접 작성한/)
})

test('upgrading an existing local app removes only owned legacy read pages', t => {
  const { root, book, write } = make(t); book('first', true)
  const appRoot = path.join(root, 'apps/reader')
  write('apps/reader/site/read/ep01.md', '# Old generated chapter')
  write('apps/reader/site/read/manual.md', '# Manual page')
  write('apps/reader/site/.vitepress/generated/content-manifest.json', JSON.stringify({ version: 1, files: ['ep01.md'] }))
  prepareWorkCatalogs({ repositoryRoot: root, appRoot })
  assert.equal(existsSync(path.join(appRoot, 'site/read/ep01.md')), false)
  assert.equal(readFileSync(path.join(appRoot, 'site/read/manual.md'), 'utf8'), '# Manual page')
  assert.equal(existsSync(path.join(appRoot, 'site/first/ep01.md')), true)
})
test('a work\'s films travel with the work, and an app can add one page for each film', t => {
  const { root, write } = make(t)
  const film = { id: 'short', title: '짧은 영상', card: { src: '/images/films/short-card.jpg', width: 720, height: 1080, alt: '그림' }, poster: { src: '/images/films/short-poster.jpg', width: 1280, height: 720 } }
  const bookWith = films => write('content/books/first/book.json', JSON.stringify({ id: 'first', work: { title: 'first' }, cover: { sources: [{ src: '/images/cover.jpg', width: 720 }] }, films }))
  bookWith([film])
  for (const name of ['cover.jpg', 'films/short-card.jpg', 'films/short-poster.jpg']) write(`content/books/first/public/images/${name}`, name)
  write('content/books/first/manuscript.md', '---\ntitle: "first"\n---\n# 2000. 시험 마을\n\n## 시작 {#ep01}\n\n*2000년, 시험 마을*\n\n첫 문단.\n')
  const appRoot = path.join(root, 'apps/reader')
  const filmPages = ({ work }) => ({ catalog: {}, pages: work.films.map(entry => ({ filename: `${entry.id}.md`, frontmatter: { title: entry.title, workId: work.id, pageId: `film-${entry.id}`, kind: 'film', filmId: entry.id } })) })
  const { catalogs } = prepareWorkCatalogs({ repositoryRoot: root, appRoot, extendCatalog: filmPages })
  assert.equal(catalogs.first.work.films[0].title, '짧은 영상')
  assert.equal(catalogs.first.work.films[0].card.src, '/works/first/images/films/short-card.jpg')
  assert.equal(catalogs.first.work.films[0].poster.src, '/works/first/images/films/short-poster.jpg')
  assert.match(readFileSync(path.join(appRoot, 'site/first/short.md'), 'utf8'), /kind: "film"[\s\S]*filmId: "short"/)
  // Without the app's pages, the work still knows its films; a film's page never replaces an episode's.
  prepareWorkCatalogs({ repositoryRoot: root, appRoot })
  assert.equal(existsSync(path.join(appRoot, 'site/first/short.md')), false)
  assert.throws(() => prepareWorkCatalogs({ repositoryRoot: root, appRoot, extendCatalog: () => ({ catalog: {}, pages: [{ filename: 'ep01.md', frontmatter: {} }] }) }), /생성 경로 중복: ep01\.md/)
  bookWith([{ ...film, id: 'Bad id' }])
  assert.throws(() => prepareWorkCatalogs({ repositoryRoot: root, appRoot }), /영상 id/)
})
