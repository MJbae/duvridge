import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { parseManuscript } from '@duvridge/story-reader/shared/episode-heading.mjs'
import { stripIllustrationMarkers } from '@duvridge/story-reader/shared/episode-illustrations.mjs'
import { compact, locateSentences, musicCueText, parseSrt } from './narration-cues.mjs'

/** Narration uses the episode ID: site/public/record/<id>.mp3 read along content/narration/<id>.srt. */
export const recordDirectory = 'site/public/record'
export const timingDirectory = 'content/narration'
// An edited sentence only loses its highlight; a recording that no longer fits the episode stops the build.
const minimumMatch = 0.5

const round = value => Math.round(value * 100) / 100
const oneLine = text => text.replace(/\s*\n\s*/g, ' ')

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

/** A reviewed legacy recording is accepted only for the reviewed episode's exact text, MP3 and SRT bytes. */
export function acceptsRecordedRevision(root, id, matched, total) {
  const filename = path.join(root, 'content/narration-compatibility.json')
  if (!existsSync(filename)) return false
  const revision = JSON.parse(readFileSync(filename, 'utf8'))
  const entry = revision.version === 2 ? revision.recordings?.[id] : undefined
  if (!entry || matched !== entry.matchedSentences || total !== entry.bodySentences) return false
  const digest = filename => createHash('sha256').update(readFileSync(filename)).digest('hex')
  const manuscript = matter(readFileSync(path.join(root, '배병희_자서전.md'), 'utf8')).content
  const episode = parseManuscript(manuscript).episodes.find(episode => episode.id === id)
  if (!episode) return false
  const text = JSON.stringify({ id: episode.id, label: episode.label, title: episode.title, time: episode.time, body: stripIllustrationMarkers(episode.body) })
  const episodeDigest = createHash('sha256').update(text).digest('hex')
  return entry.episodeTextSha256 === episodeDigest
    && entry.audioSha256 === digest(path.join(root, recordDirectory, `${id}.mp3`))
    && entry.timingSha256 === digest(path.join(root, timingDirectory, `${id}.srt`))
}

/** Opening and music cues carry their kind; sentences found in the manuscript can be highlighted. */
function readTrack(root, episode, { work, toText, warn }) {
  const cues = parseSrt(readFileSync(path.join(root, timingDirectory, `${episode.id}.srt`), 'utf8'))
  checkTimes(cues, episode.id)
  const kinds = classifyCues(cues, episode, work)
  const body = cues.map((cue, index) => ({ cue, index })).filter(({ index }) => !kinds[index])
  const found = locateSentences(episodeParagraphs(episode.body, toText), body.map(({ cue }) => cue.text))
  const missing = body.filter((_, position) => !found[position])
  if (body.length && (body.length - missing.length) / body.length < minimumMatch
    && !acceptsRecordedRevision(root, episode.id, body.length - missing.length, body.length))
    throw new Error(`원고와 낭독 문장이 맞지 않습니다: ${episode.id} (${body.length}개 중 ${missing.length}개를 찾지 못함)`)
  for (const { cue, index } of missing)
    warn(`원고에서 찾지 못한 낭독 문장은 표시하지 않습니다: ${episode.id} ${index + 1}번째 문장 “${oneLine(cue.text)}”`)
  return {
    track: {
      src: `/record/${episode.id}.mp3`,
      duration: round(cues.at(-1).end),
      cues: cues.map((cue, index) => kinds[index] ? [round(cue.start), round(cue.end), kinds[index]] : [round(cue.start), round(cue.end)]),
    },
    sentences: body.filter((_, position) => found[position]).map(({ cue, index }) => ({ cue: index, text: oneLine(cue.text) })),
  }
}

/** Recorded episodes for the reader (tracks) and the sentence text for the Markdown wrapper. */
export function loadNarration(root, episodes, { work, toText = text => text, warn = () => {} } = {}) {
  const tracks = {}
  const sentences = {}
  const timed = checkPairs(root, episodes)
  for (const episode of episodes) {
    if (!timed.has(episode.id)) continue
    checkAudio(root, episode.id)
    const result = readTrack(root, episode, { work, toText, warn })
    tracks[episode.id] = result.track
    sentences[episode.id] = result.sentences
  }
  return { tracks, sentences }
}
