import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { compact, parseSrt } from './narration-cues.mjs'

/** A book's videos: content/video/media.json lists each file and content/video/timings/<id>.srt its subtitle times. */
export const videoDirectory = 'content/video'
export const videoFilePattern = /^[a-z0-9-]+\.[a-f0-9]{10}\.mp4$/
const round = value => Math.round(value * 100) / 100

/**
 * One video per recorded episode. A video is the recording at its own pace, so it keeps the recording's
 * sentences, kinds and scenes and only its times differ. The closing music has no subtitle; it takes the
 * rest of the video.
 */
export function loadVideo(root, tracks, { work }) {
  const manifestFile = path.join(root, videoDirectory, 'media.json')
  if (!existsSync(manifestFile)) return { videos: {} }
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const videos = {}
  for (const [id, entry] of Object.entries(manifest.videos ?? {})) {
    const track = tracks[id]
    if (!track) throw new Error(`낭독이 없는 회차의 영상입니다: ${id}`)
    if (!videoFilePattern.test(entry.file) || !entry.file.startsWith(`${id}.`) || !(entry.duration > 0)) throw new Error(`영상 목록이 잘못되었습니다: ${id}`)
    const timing = path.join(root, videoDirectory, 'timings', `${id}.srt`)
    if (!existsSync(timing)) throw new Error(`영상 자막 시각 파일이 없습니다: ${videoDirectory}/timings/${id}.srt`)
    const cues = parseSrt(readFileSync(timing, 'utf8'))
    const spoken = track.cues.at(-1)?.[2] === 'music' ? track.cues.length - 1 : track.cues.length
    const heard = parseSrt(readFileSync(path.join(root, 'content/narration', `${id}.srt`), 'utf8'))
    if (cues.length !== spoken || cues.some((cue, index) => compact(cue.text) !== compact(heard[index]?.text ?? '')))
      throw new Error(`영상과 낭독의 문장이 다릅니다: ${id}`)
    const times = cues.map((cue, index) => {
      const kind = track.cues[index][2]
      return kind ? [round(cue.start), round(cue.end), kind] : [round(cue.start), round(cue.end)]
    })
    if (spoken < track.cues.length) times.push([round(cues.at(-1).end), round(entry.duration), 'music'])
    videos[id] = { src: `/works/${work.id}/media/${entry.file}`, duration: round(entry.duration), cues: times, texts: track.texts, scenes: track.scenes }
  }
  return { videos }
}
