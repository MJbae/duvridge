import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compact, musicCueText, parseSrt } from '../site/.vitepress/shared/narration-cues.mjs'
import { timingDirectory } from '../site/.vitepress/shared/narration-catalog.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** The production tool's narration scripts say which illustration each spoken line shows. */
export const narrationScripts = '../../tools/audiobook-production/narration-scripts'

/** One subtitle per sentence, split as the production tool splits its captions. */
export function splitCaptions(text) {
  return String(text).split(/(?<=[.!?”])\s+/).filter(Boolean)
}

/**
 * Where the picture changes, as subtitle (cue) indexes. A script line is one cue for the cover, the
 * title and the dateline, and one cue per sentence for a paragraph; scene breaks have no subtitle.
 */
export function buildScenes(lines, cues, id = '') {
  const spoken = cues.at(-1)?.text.trim() === musicCueText ? cues.slice(0, -1) : cues
  const units = lines
    .filter(line => line.kind !== 'break')
    .flatMap(line => (line.kind === 'para' ? splitCaptions(line.show) : [line.show]).map(text => ({ kind: line.kind, image: line.image, text })))
  if (units.length !== spoken.length)
    throw new Error(`${id}: 낭독 대본의 자막 ${units.length}개와 문장 시각 ${spoken.length}개가 맞지 않습니다.`)
  units.forEach((unit, index) => {
    if (unit.kind === 'para' && compact(unit.text) !== compact(spoken[index].text))
      throw new Error(`${id}: ${index + 1}번째 문장이 낭독 대본과 다릅니다.`)
  })
  return units.reduce((scenes, unit, index) => (scenes.at(-1)?.image === unit.image ? scenes : [...scenes, { cue: index, image: unit.image }]), [])
}

/** Writes content/narration/<id>.scenes.json beside each episode's subtitle timing. */
export function writeScenes({ root = projectRoot, ids, logger = console, skipMissing = false } = {}) {
  const timing = path.join(root, timingDirectory)
  const episodes = ids ?? readdirSync(timing).filter(name => name.endsWith('.srt')).map(name => name.slice(0, -4))
  for (const id of episodes) {
    const script = path.join(root, narrationScripts, `${id}.json`)
    if (!existsSync(script)) {
      // Without a script the player keeps the episode's representative painting.
      if (skipMissing) { logger.warn?.(`[narration] ${id}: 낭독 대본이 없어 장면 정보를 만들지 않았습니다.`); continue }
      throw new Error(`낭독 대본이 없습니다: ${path.relative(root, script)}`)
    }
    const scenes = buildScenes(JSON.parse(readFileSync(script, 'utf8')), parseSrt(readFileSync(path.join(timing, `${id}.srt`), 'utf8')), id)
    const target = path.join(timing, `${id}.scenes.json`)
    const json = `${JSON.stringify({ version: 1, scenes }, null, 2)}\n`
    if (!existsSync(target) || readFileSync(target, 'utf8') !== json) writeFileSync(target, json)
    logger.log?.(`[narration] ${id}: 장면 ${scenes.length}개 (${scenes.map(scene => scene.image).join(', ')})`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { writeScenes({ ids: process.argv.slice(2).length ? process.argv.slice(2) : undefined }) }
  catch (error) { console.error(`[narration] ${error.message}`); process.exitCode = 1 }
}
