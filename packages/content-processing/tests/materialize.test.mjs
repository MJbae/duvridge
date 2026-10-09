import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { materializeBookContent as materializeContent } from '../src/source-files/materialize-book-content.mjs'

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'memoir-materialize-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, 'source'), app = path.join(root, 'app')
  mkdirSync(source); mkdirSync(app)
  const write = (root, filename, value) => { const file = path.join(root, filename); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, value) }
  return { source, app, write }
}

test('removed and renamed common inputs disappear while recordings, timing and app files survive', t => {
  const { source, app, write } = fixture(t)
  write(source, 'manuscript.md', 'latest')
  write(source, 'illustrations/manifest.json', 'old')
  write(source, 'public/images/old.jpg', 'old image')
  write(app, 'content/narration/ep02.srt', 'timing')
  write(app, 'site/public/record/ep02.mp3', 'recording')
  write(app, 'content/app-only.txt', 'local')
  materializeContent(app, { source })
  rmSync(path.join(source, 'illustrations/manifest.json'))
  rmSync(path.join(source, 'public/images/old.jpg'))
  write(source, 'music/manifest.json', 'new')
  materializeContent(app, { source })
  assert.equal(existsSync(path.join(app, 'content/episode-illustrations.json')), false)
  assert.equal(existsSync(path.join(app, 'site/public/images/old.jpg')), false)
  assert.equal(readFileSync(path.join(app, 'content/music.json'), 'utf8'), 'new')
  assert.equal(readFileSync(path.join(app, 'content/narration/ep02.srt'), 'utf8'), 'timing')
  assert.equal(readFileSync(path.join(app, 'site/public/record/ep02.mp3'), 'utf8'), 'recording')
  assert.equal(readFileSync(path.join(app, 'content/app-only.txt'), 'utf8'), 'local')
})

test('a corrupt cleanup manifest cannot delete a recording or escape the app', t => {
  const { source, app, write } = fixture(t)
  for (const filename of ['../other', 'site/public/record/ep02.mp3', 'content/narration/ep02.srt']) {
    write(app, '.memoir-content-manifest.json', JSON.stringify({ version: 1, files: [filename] }))
    assert.throws(() => materializeContent(app, { source }), /안전하지/)
  }
})

test('canonical book inputs replace legacy staging without changing public paths or reference bytes', t => {
  const { source, app, write } = fixture(t)
  write(source, 'manuscript.md', 'unchanged manuscript')
  write(source, 'book.json', JSON.stringify({ manuscript: 'manuscript.md' }))
  write(source, 'references/documents/interview.txt', 'interview')
  write(source, 'references/images/portrait.png', 'portrait')
  write(source, 'illustrations/source-images/master.png', 'master')
  write(source, 'public/music/intro.mp3', 'music bytes')
  write(app, 'legacy-manuscript.md', 'old')
  write(app, '.memoir-content-manifest.json', JSON.stringify({ version: 1, files: ['legacy-manuscript.md'] }))
  materializeContent(app, { source })
  assert.equal(existsSync(path.join(app, 'legacy-manuscript.md')), false)
  for (const [target, bytes] of [
    ['manuscript.md', 'unchanged manuscript'],
    ['원자료/interview.txt', 'interview'],
    ['content/ref_images/portrait.png', 'portrait'],
    ['content/illustration-sources/master.png', 'master'],
    ['site/public/music/intro.mp3', 'music bytes'],
  ]) assert.equal(readFileSync(path.join(app, target), 'utf8'), bytes)
})
