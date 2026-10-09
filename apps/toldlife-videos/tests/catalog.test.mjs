import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const catalog = JSON.parse(readFileSync(new URL('../site/.vitepress/generated/catalog.json', import.meta.url), 'utf8'))
test('video uses work-scoped narration, scene files and every manuscript episode', () => {
  assert.equal(catalog.readingOrder.length, 26)
  for (const [id, track] of Object.entries(catalog.narration)) {
    assert.equal(track.src, `/works/${catalog.work.id}/record/${id}.mp3`)
    assert.ok(existsSync(new URL(`../site/public${track.src}`, import.meta.url)))
    assert.equal(track.cues.length, track.texts.length)
    assert.equal(track.cues.at(-1)[1], track.duration)
  }
})
