import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { parseManuscript } from '../site/.vitepress/shared/episode-heading.mjs'
import { clock, formatSrt, locateSentences, musicCueText, parseSrt } from '../site/.vitepress/shared/narration-cues.mjs'
import { classifyCues, episodeParagraphs, recordDirectory, timingDirectory } from '../site/.vitepress/shared/narration.mjs'
import { alignSentences, findOutro, findSilences } from './narration-align.mjs'
import { plainText } from './prepare-content.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainFilename = '배병희_자서전.md'
const sampleRate = 16000
const usage = '사용법: npm run narration:sync -- <회차 ID…> [--from <오디오북 out 폴더>]\n예: npm run narration:sync -- prolog ep01 ep02 ep03'

/** Mono samples from an MP3. ffmpeg is needed only on the computer that adds recordings. */
export function decode(file) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'], {
    maxBuffer: 1024 * 1024 * 1024,
  })
  if (result.error?.code === 'ENOENT') throw new Error('ffmpeg가 필요합니다. brew install ffmpeg로 설치하세요.')
  if (result.status !== 0) throw new Error(`음성을 읽지 못했습니다: ${file}\n${result.stderr}`)
  const bytes = result.stdout
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength - (bytes.byteLength % 4)))
}

function readEpisodes(root) {
  const main = matter(readFileSync(path.join(root, mainFilename), 'utf8'))
  const work = {
    title: plainText(main.data.title || '내 논을 파는 한이 있어도'),
    subtitle: plainText(main.data.subtitle || '배병희 자전소설'),
  }
  return { episodes: parseManuscript(main.content).episodes, work }
}

/** Sentences after the first in a paragraph carry estimated starts; recordings must match the manuscript. */
function sentenceTiming(cues, episode, work) {
  const kinds = classifyCues(cues, episode, work)
  const body = cues.flatMap((_, index) => kinds[index] ? [] : [index])
  const found = locateSentences(episodeParagraphs(episode.body, plainText), body.map(index => cues[index].text))
  const missing = body.filter((_, position) => !found[position])
  if (missing.length) {
    const list = missing.map(index => `  ${index + 1}. ${cues[index].text.replace(/\n/g, ' ')}`).join('\n')
    throw new Error(`${episode.id}: 원고에서 찾지 못한 문장이 있습니다. 원고를 고쳤다면 오디오북을 다시 만드세요.\n${list}`)
  }
  const estimated = new Set(body.filter((_, position) => position > 0 && found[position].paragraph === found[position - 1].paragraph))
  return { sentences: body.length, estimated }
}

function closeWithMusic(cues, silences, id) {
  if (cues.at(-1).text === musicCueText) return cues
  const outro = findOutro(cues, silences)
  if (outro === null) throw new Error(`${id}: 마지막 문장이 끝나는 곳을 찾지 못했습니다.`)
  const last = cues.at(-1)
  return [...cues.slice(0, -1), { ...last, end: outro }, { start: outro, end: last.end, text: musicCueText }]
}

/** The audiobook's out/ folder, whether this site sits inside the audiobook project or beside it. */
function audiobookOutput(root) {
  const candidates = [path.join(root, '../out'), path.join(root, '../autobio-audiobook/out')]
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]
}

/** Copies each recording into the site and writes sentence timing fitted to the voice. */
export function syncNarration({ root = projectRoot, from, ids, decodeAudio = decode, logger = console }) {
  const source = path.resolve(from ?? process.env.NARRATION_SOURCE ?? audiobookOutput(root))
  const { episodes, work } = readEpisodes(root)
  for (const id of ids) {
    const episode = episodes.find(candidate => candidate.id === id)
    if (!episode) throw new Error(`원고에 없는 회차입니다: ${id}`)
    const audio = path.join(source, `${id}.mp3`)
    const timing = path.join(source, `${id}.srt`)
    for (const file of [audio, timing]) if (!existsSync(file)) throw new Error(`오디오북 결과물이 없습니다: ${file}`)
    const cues = parseSrt(readFileSync(timing, 'utf8'))
    const { sentences, estimated } = sentenceTiming(cues, episode, work)
    const silences = findSilences(decodeAudio(audio), sampleRate)
    const aligned = closeWithMusic(alignSentences(cues, estimated, silences), silences, id)
    mkdirSync(path.join(root, timingDirectory), { recursive: true })
    mkdirSync(path.join(root, recordDirectory), { recursive: true })
    writeFileSync(path.join(root, timingDirectory, `${id}.srt`), formatSrt(aligned))
    const target = path.join(root, recordDirectory, `${id}.mp3`)
    if (!existsSync(target) || !readFileSync(target).equals(readFileSync(audio))) copyFileSync(audio, target)
    const moved = [...estimated].map(index => Math.abs(aligned[index].start - cues[index].start))
    const average = moved.length ? (moved.reduce((sum, value) => sum + value, 0) / moved.length).toFixed(2) : '0'
    logger.log?.(`[narration] ${id}: 문장 ${sentences}개 · ${clock(aligned.at(-1).end)} · 문단 안 문장 ${estimated.size}개를 평균 ${average}초 보정`)
  }
}

function parseArguments(args) {
  const ids = []
  let from
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--from') from = args[++index]
    else if (args[index].startsWith('--from=')) from = args[index].slice('--from='.length)
    else ids.push(args[index])
  }
  return { ids, from }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { ids, from } = parseArguments(process.argv.slice(2))
  if (!ids.length) {
    console.error(usage)
    process.exitCode = 1
  } else {
    try {
      syncNarration({ ids, from })
    } catch (error) {
      console.error(`[narration] ${error.message}`)
      process.exitCode = 1
    }
  }
}
