import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { compact, musicCueText, parseSrt } from './narration-cues.mjs'

/** Narration uses the episode ID: site/public/record/<id>.mp3 read along content/narration/<id>.srt. */
export const recordDirectory = 'site/public/record'
export const timingDirectory = 'content/narration'
// Existing recordings will be regenerated. Editorial changes never depend on their text match rate.

const round = value => Math.round(value * 100) / 100

const notParagraph = /^\s{0,3}(?:#{1,6}\s|(?:[*_-]\s*){3,}$)/

/** Paragraph text as readers see it, in reading order; headings and scene breaks are not read as sentences. */
export function episodeParagraphs(body, toText = text => text) {
  return body.split(/\n\s*\n/).filter(block => !notParagraph.test(block.trim())).map(toText).filter(Boolean)
}

/** The recording opens with the book cover (prologue only), the episode title and its dateline. */
export function classifyCues(cues, episode, work) {
  let opening = true
  return cues.map((cue, index) => {
    const text = cue.text.trim()
    if (text === musicCueText) {
      if (index !== cues.length - 1) throw new Error(`끝 음악은 마지막 자막이어야 합니다: ${episode.id}`)
      return 'music'
    }
    if (!opening) return null
    const lines = text.split('\n').map(line => line.trim())
    if (lines[0] === episode.label) return lines.length > 2 ? 'dateline' : 'title'
    if (index === 0 && work && compact(text) === compact(`${work.title}${work.subtitle}`)) return 'cover'
    opening = false
    return null
  })
}

function checkTimes(cues, id) {
  if (cues.length < 2) throw new Error(`문장 시각 파일에 문장이 없습니다: ${id}`)
  cues.forEach((cue, index) => {
    if (!(cue.start >= 0 && cue.end > cue.start))
      throw new Error(`문장 시각이 잘못되었습니다: ${id} ${index + 1}번째 문장`)
    if (index && cue.start < cues[index - 1].end - 0.005)
      throw new Error(`문장 시각이 앞 문장과 겹칩니다: ${id} ${index + 1}번째 문장`)
  })
}

function listIds(directory, extension) {
  if (!existsSync(directory)) return new Set()
  return new Set(readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(extension))
    .map(entry => entry.name.slice(0, -extension.length)))
}

function checkPairs(root, episodes) {
  const recorded = listIds(path.join(root, recordDirectory), '.mp3')
  const timed = listIds(path.join(root, timingDirectory), '.srt')
  for (const id of recorded) {
    if (!timed.has(id)) throw new Error(`낭독 음성의 문장 시각 파일이 없습니다: ${timingDirectory}/${id}.srt`)
  }
  const known = new Set(episodes.map(episode => episode.id))
  for (const id of timed) {
    if (!recorded.has(id)) throw new Error(`문장 시각 파일의 낭독 음성이 없습니다: ${recordDirectory}/${id}.mp3`)
    if (!known.has(id)) throw new Error(`낭독 파일의 회차 ID가 원고에 없습니다: ${id}`)
  }
  return timed
}

function checkAudio(root, id) {
  const publicRoot = realpathSync(path.join(root, 'site/public'))
  const file = path.join(root, recordDirectory, `${id}.mp3`)
  if (!realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) throw new Error(`낭독 음성 경로가 안전하지 않습니다: ${id}`)
  if (!statSync(file).size) throw new Error(`낭독 음성 파일이 비어 있습니다: ${id}`)
}

/**
 * What the player shows for a cue, as it is heard: the opening cards on one line, only the place
 * and time of a dateline card (the title was shown just before), and nothing for the closing music.
 */
export function cueDisplayText(text, kind) {
  const lines = String(text).split('\n').map(line => line.trim()).filter(Boolean)
  if (kind === 'music') return ''
  if (kind === 'dateline') return lines.at(-1) ?? ''
  return lines.join(' ')
}

/** content/narration/<id>.scenes.json names the cue where each illustration comes on screen. */
function readScenes(root, id, cueCount) {
  const file = path.join(root, timingDirectory, `${id}.scenes.json`)
  if (!existsSync(file)) return []
  const scenes = JSON.parse(readFileSync(file, 'utf8')).scenes
  if (!Array.isArray(scenes) || !scenes.length) throw new Error(`장면 정보가 비어 있습니다: ${timingDirectory}/${id}.scenes.json`)
  scenes.forEach((scene, index) => {
    if (!Number.isInteger(scene.cue) || scene.cue < 0 || scene.cue >= cueCount || (index && scene.cue <= scenes[index - 1].cue) || typeof scene.image !== 'string')
      throw new Error(`장면 정보가 잘못되었습니다: ${timingDirectory}/${id}.scenes.json ${index + 1}번째`)
  })
  return scenes.map(scene => [scene.cue, scene.image])
}

/** Opening and music cues carry their kind; every cue keeps the words heard, for the player and the video subtitles. */
function readTrack(root, episode, { work }) {
  const cues = parseSrt(readFileSync(path.join(root, timingDirectory, `${episode.id}.srt`), 'utf8'))
  checkTimes(cues, episode.id)
  const kinds = classifyCues(cues, episode, work)
  return {
    src: `/record/${episode.id}.mp3`,
    duration: round(cues.at(-1).end),
    cues: cues.map((cue, index) => kinds[index] ? [round(cue.start), round(cue.end), kinds[index]] : [round(cue.start), round(cue.end)]),
    texts: cues.map((cue, index) => cueDisplayText(cue.text, kinds[index])),
    scenes: readScenes(root, episode.id, cues.length),
  }
}

/** Recorded episodes for the player and the video. */
export function loadNarration(root, episodes, { work } = {}) {
  const tracks = {}
  const timed = checkPairs(root, episodes)
  for (const episode of episodes) {
    if (!timed.has(episode.id)) continue
    checkAudio(root, episode.id)
    tracks[episode.id] = readTrack(root, episode, { work })
  }
  return { tracks }
}
