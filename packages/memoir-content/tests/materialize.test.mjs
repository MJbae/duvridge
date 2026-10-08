import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { materializeContent } from '../materialize.mjs'

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
  write(source, '배병희_자서전.md', 'latest')
  write(source, 'content/old.json', 'old')
  write(source, 'site/public/images/old.jpg', 'old image')
  write(app, 'content/narration/ep02.srt', 'timing')
  write(app, 'site/public/record/ep02.mp3', 'recording')
  write(app, 'content/app-only.txt', 'local')
  materializeContent(app, { source })
  rmSync(path.join(source, 'content/old.json'))
  rmSync(path.join(source, 'site/public/images/old.jpg'))
  write(source, 'content/new.json', 'new')
  materializeContent(app, { source })
  assert.equal(existsSync(path.join(app, 'content/old.json')), false)
  assert.equal(existsSync(path.join(app, 'site/public/images/old.jpg')), false)
  assert.equal(readFileSync(path.join(app, 'content/new.json'), 'utf8'), 'new')
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
