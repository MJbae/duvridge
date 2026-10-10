import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { episodeNeighbours, sceneCountLabel } from '../site/.vitepress/shared/video-navigation.mjs'
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

test('scene disclosure names include zero, one and every scene', () => {
  assert.equal(sceneCountLabel(0), '장면 보기 · 0개')
  assert.equal(sceneCountLabel(1), '장면 보기 · 1개')
  assert.equal(sceneCountLabel(12), '장면 보기 · 12개')
})

test('episode neighbours follow the reading order at its first, middle and last episodes', () => {
  const order = Object.freeze([{ id: 'prolog', title: '시작' }, { id: 'ep01', title: '첫 회차' }, { id: 'ep02', title: '끝' }])
  const playable = () => true
  assert.deepEqual(episodeNeighbours(order, 'prolog', playable), { previous: undefined, next: order[1], nextPlayable: order[1] })
  assert.deepEqual(episodeNeighbours(order, 'ep01', playable), { previous: order[0], next: order[2], nextPlayable: order[2] })
  assert.deepEqual(episodeNeighbours(order, 'ep02', playable), { previous: order[1], next: undefined, nextPlayable: undefined })
  assert.deepEqual(episodeNeighbours(order, 'unknown', playable), { previous: undefined, next: undefined, nextPlayable: undefined })
  assert.deepEqual(order.map(episode => episode.id), ['prolog', 'ep01', 'ep02'])
})

test('previous skips unrecorded episodes while an unrecorded next stays pending without autoplay', () => {
  const order = [{ id: 'prolog' }, { id: 'ep01' }, { id: 'ep02' }, { id: 'ep03' }, { id: 'ep04' }]
  const savedOrder = [...order]
  const playable = id => ['prolog', 'ep02', 'ep04'].includes(id)
  assert.deepEqual(episodeNeighbours(order, 'ep02', playable), { previous: order[0], next: order[3], nextPlayable: undefined })
  assert.deepEqual(episodeNeighbours(order, 'ep04', playable), { previous: order[2], next: undefined, nextPlayable: undefined })
  assert.deepEqual(episodeNeighbours(order, 'ep01', () => false), { previous: undefined, next: order[2], nextPlayable: undefined })
  assert.deepEqual(order, savedOrder)
})
