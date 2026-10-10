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
test('every recorded episode has its video: the recording\'s sentences and scenes in the video\'s own times', () => {
  assert.deepEqual(Object.keys(catalog.video), Object.keys(catalog.narration))
  for (const [id, track] of Object.entries(catalog.video)) {
    const recording = catalog.narration[id]
    assert.match(track.src, new RegExp(`^/works/${catalog.work.id}/media/${id}\\.[a-f0-9]{10}\\.mp4$`))
    assert.equal(track.cues.length, recording.cues.length)
    assert.deepEqual(track.cues.map(cue => cue[2] ?? null), recording.cues.map(cue => cue[2] ?? null))
    assert.deepEqual(track.texts, recording.texts)
    assert.deepEqual(track.scenes, recording.scenes)
    assert.equal(track.cues.at(-1)[1], track.duration)
    for (let index = 1; index < track.cues.length; index++) assert.ok(track.cues[index][0] >= track.cues[index - 1][0], `${id} cue ${index}`)
  }
})
test('films made from the work keep their published file and pictures, each with its own page', () => {
  assert.deepEqual(catalog.films.map(film => film.id), ['nureon-bongtu', 'byeotgap', 'mot-bon-cheok'])
  for (const film of catalog.films) {
    assert.match(film.src, new RegExp(`^/works/${catalog.work.id}/media/${film.id}\\.[a-f0-9]{10}\\.mp4$`))
    assert.ok(film.duration > 0 && film.width > 0 && film.height > 0)
    for (const image of [film.poster, film.card]) assert.ok(existsSync(new URL(`../site/public${image.src}`, import.meta.url)), image.src)
    const page = readFileSync(new URL(`../site/${catalog.work.id}/${film.id}.md`, import.meta.url), 'utf8')
    assert.match(page, new RegExp(`kind: "film"[\\s\\S]*filmId: "${film.id}"`))
  }
})
