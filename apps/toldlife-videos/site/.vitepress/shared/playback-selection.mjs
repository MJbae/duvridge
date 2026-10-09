import { cueIndexAt } from './narration-cues.mjs'

/**
 * The work page's one action for the audiobook or the video: carry on where the listener stopped,
 * the next episode not heard yet, or the first one again.
 */
export function listenAction({ readingOrder, narration, saved, completed }) {
  if (saved && narration[saved.id]) return { id: saved.id, kind: 'resume' }
  const playable = readingOrder.filter(episode => narration[episode.id])
  if (!playable.length) return null
  const heard = completed.filter(id => narration[id])
  const unheard = playable.filter(episode => !completed.includes(episode.id))
  // The story carries on after the episode heard last; one skipped earlier waits until then.
  const last = readingOrder.findIndex(episode => episode.id === completed.at(-1))
  const next = unheard.find(episode => readingOrder.indexOf(episode) > last) ?? unheard[0]
  if (!next) return { id: playable[0].id, kind: 'again' }
  return { id: next.id, kind: heard.length ? 'next' : 'start' }
}

/** A saved position resumes from the start of the sentence it stopped in. */
export function resumeStart(cues, time) {
  const index = cueIndexAt(cues, time)
  return index < 0 ? 0 : cues[index][0]
}

/** The sleep timer button goes off → 15 min → 30 min → this episode's end → off. */
export const sleepChoices = [0, 15, 30, -1]
export function nextSleepChoice(value) {
  return sleepChoices[(sleepChoices.indexOf(value) + 1) % sleepChoices.length]
}
export function sleepLabel(value) {
  if (value === -1) return '회차 끝'
  return value > 0 ? `${value}분` : '타이머'
}

/**
 * The sentence being heard with the one before and after it, as in song lyrics. Cues without words
 * (the closing music) keep the last sentence on screen.
 */
export function lyricLines(texts, cueIndex) {
  const spoken = index => index >= 0 && index < texts.length && Boolean(texts[index])
  let current = Math.min(Math.max(0, cueIndex), texts.length - 1)
  while (current > 0 && !spoken(current)) current--
  if (!spoken(current)) current = texts.findIndex(Boolean)
  let previous = current - 1
  while (previous >= 0 && !spoken(previous)) previous--
  let next = current + 1
  while (next < texts.length && !spoken(next)) next++
  return { previous, current, next: next < texts.length ? next : -1 }
}

/** The illustration on screen at a cue: the last scene that has started. */
export function sceneAt(scenes, cueIndex) {
  let image = scenes[0]?.[1]
  for (const [cue, id] of scenes) if (cue <= Math.max(0, cueIndex)) image = id
  return image
}

/** Where each scene begins, in seconds, for the video's scene list. */
export function sceneStarts(scenes, cues) {
  return scenes.map(([cue, image]) => ({ image, start: cues[cue]?.[0] ?? 0 }))
}
