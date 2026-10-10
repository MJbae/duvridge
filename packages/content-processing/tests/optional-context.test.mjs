import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { parseManuscript } from '../src/manuscripts/parse-manuscript.mjs'
import { loadEpisodeIllustrations } from '../src/illustrations/load-illustration-manifest.mjs'

test('터전과 시대·장소를 쓰지 않는 작품도 본문을 그대로 보존한다', () => {
  const body = '첫 문단의 **강조**도 그대로 남는다.\n\n다음 문단.'
  const manuscript = `## 첫 이야기 {#ep01}\n\n${body}\n\n## 둘째 이야기 {#ep02}\n\n*어느 날 · 마을*\n\n두 번째 본문.`
  const { places, episodes } = parseManuscript(manuscript)
  assert.deepEqual(places, [])
  assert.equal(episodes[0].time, '')
  assert.equal(episodes[0].place, null)
  assert.equal(episodes[0].body, body)
  assert.equal(episodes[1].time, '어느 날 · 마을')
  assert.equal(episodes[1].body, '두 번째 본문.')
  assert.throws(() => parseManuscript('## 빈 회차 {#ep01}\n'), /본문이 비어/)
})

test('같은 작품에 삽화가 있는 회차와 없는 회차를 함께 둘 수 있다', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'optional-illustrations-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (filename, value) => {
    mkdirSync(path.dirname(path.join(root, filename)), { recursive: true })
    writeFileSync(path.join(root, filename), value)
  }
  const sources = [360, 720, 1280].map(width => ({ src: `/images/episodes/ep01-01-${width}.jpg`, width }))
  for (const source of sources) write(`site/public${source.src}`, 'image fixture')
  write('content/episode-illustrations.json', JSON.stringify({ version: 2, images: [{
    id: 'ep01-01', episodeId: 'ep01', alt: '첫 삽화', width: 1280, height: 720, sources, representative: true,
  }] }))
  const episodes = parseManuscript('## 삽화가 있는 회차 {#ep01}\n\n<!-- illustration: ep01-01 -->\n\n본문.\n\n## 삽화가 없는 회차 {#ep02}\n\n*어느 날 · 마을*\n\n본문.').episodes
  const images = loadEpisodeIllustrations(root, episodes)
  assert.equal(images.ep01[0].position.start, true)
  assert.equal(images.ep02, undefined)
  // Omitting artwork does not allow a misplaced marker to pass validation.
  episodes[1].body = '<!-- illustration: ep01-01 -->\n\n본문.'
  assert.throws(() => loadEpisodeIllustrations(root, episodes), /다른 회차/)
})
