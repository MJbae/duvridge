/** Narration timing shared by the content build and the reader. Times are in seconds. */

/** The last cue covers the closing music after the final sentence. */
export const musicCueText = '♪'

const srtTime = /^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/

export function parseSrtTime(value) {
  const match = srtTime.exec(String(value).trim())
  if (!match) throw new Error(`자막 시각을 읽을 수 없습니다: ${value}`)
  const [, hours, minutes, seconds, milliseconds] = match.map(Number)
  return (hours * 3_600_000 + minutes * 60_000 + seconds * 1000 + milliseconds) / 1000
}

export function formatSrtTime(seconds) {
  const total = Math.max(0, Math.round(seconds * 1000))
  const two = value => String(value).padStart(2, '0')
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor(total / 60_000) % 60
  return `${two(hours)}:${two(minutes)}:${two(Math.floor(total / 1000) % 60)},${String(total % 1000).padStart(3, '0')}`
}

/** Reads SubRip text. A cue's subtitle lines stay separated by newlines. */
export function parseSrt(source) {
  return String(source)
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const lines = block.split('\n')
      const timing = lines.findIndex(line => line.includes('-->'))
      if (timing < 0) throw new Error(`${index + 1}번째 자막에 시각이 없습니다.`)
      const [start, end] = lines[timing].split('-->').map(part => parseSrtTime(part.trim().split(/\s+/)[0]))
      const text = lines.slice(timing + 1).join('\n').trim()
      if (!text) throw new Error(`${index + 1}번째 자막의 문장이 비어 있습니다.`)
      return { start, end, text }
    })
}

export function formatSrt(cues) {
  return cues
    .map((cue, index) => `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`)
    .join('\n')
}

/** Subtitle lines break where the manuscript has spaces, so sentences match without whitespace. */
export function compact(text) {
  return String(text).normalize('NFC').replace(/\s+/g, '')
}

/**
 * Finds each sentence in reading order. A sentence that is no longer in the manuscript is null,
 * and the search continues after the last sentence that was found.
 */
export function locateSentences(paragraphs, sentences) {
  const texts = paragraphs.map(compact)
  let paragraph = 0
  let offset = 0
  return sentences.map(sentence => {
    const needle = compact(sentence)
    if (!needle) return null
    for (let index = paragraph; index < texts.length; index++) {
      const start = texts[index].indexOf(needle, index === paragraph ? offset : 0)
      if (start < 0) continue
      paragraph = index
      offset = start + needle.length
      return { paragraph: index, start, end: offset }
    }
    return null
  })
}

/** Index of the cue under way at a time, or -1 before the first cue. Cues are [start, end, kind?]. */
export function cueIndexAt(cues, time) {
  let low = 0
  let high = cues.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (cues[middle][0] <= time) {
      found = middle
      low = middle + 1
    } else high = middle - 1
  }
  return found
}

/** A sentence already under way starts over; right after it begins, the previous one plays. */
export function previousCueStart(cues, time, grace = 1.5) {
  if (!cues.length) return 0
  const index = Math.max(0, cueIndexAt(cues, time))
  const start = cues[index][0]
  return index === 0 || time - start > grace ? start : cues[index - 1][0]
}

export function nextCueStart(cues, time) {
  const next = cues[cueIndexAt(cues, time) + 1]
  return next ? next[0] : null
}

/** 4:01 */
export function clock(seconds) {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** 4분 1초, for screen readers. */
export function spokenTime(seconds) {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (!minutes) return `${rest}초`
  return rest ? `${minutes}분 ${rest}초` : `${minutes}분`
}

/** Whole minutes shown on the listen button. */
export function listeningMinutes(seconds) {
  return Math.max(1, Math.round(seconds / 60))
}
