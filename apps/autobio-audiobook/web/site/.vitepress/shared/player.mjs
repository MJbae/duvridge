import { cueIndexAt, listeningMinutes } from './narration-cues.mjs'

/**
 * What the bottom player bar offers. A recording in use wins on every page; an episode page
 * offers its own recording; the home offers where the listener left off, or the next one to hear.
 */
export function playerTarget({ readingOrder, narration, page, session, saved, completed }) {
  if (session) return { id: session.id, mode: session.failed ? 'error' : session.playing ? 'playing' : 'paused' }
  if (page) {
    if (!narration[page]) return { id: page, mode: 'unavailable' }
    if (saved?.id === page) return { id: page, mode: 'resume', time: saved.time }
    return { id: page, mode: completed.includes(page) ? 'replay' : 'idle' }
  }
  if (saved && narration[saved.id]) return { id: saved.id, mode: 'resume', time: saved.time }
  const playable = readingOrder.filter(episode => narration[episode.id])
  if (!playable.length) return null
  const unheard = playable.filter(episode => !completed.includes(episode.id))
  // The story carries on after the episode heard last; one skipped earlier waits until then.
  const last = readingOrder.findIndex(episode => episode.id === completed.at(-1))
  const next = unheard.find(episode => readingOrder.indexOf(episode) > last) ?? unheard[0]
  return next ? { id: next.id, mode: 'idle' } : { id: playable[0].id, mode: 'replay' }
}

/** A saved position resumes from the start of the sentence it stopped in. */
export function resumeStart(cues, time) {
  const index = cueIndexAt(cues, time)
  return index < 0 ? 0 : cues[index][0]
}

/** Whole minutes still to hear, never below one. */
export function minutesLeft(duration, time) {
  return Math.max(1, Math.ceil((duration - time) / 60))
}

/** How the table of contents describes one episode. */
export function listenState(id, { narration, session, saved, completed }) {
  const track = narration[id]
  if (!track) return { kind: 'unavailable' }
  if (session?.id === id) {
    return session.playing ? { kind: 'playing' } : { kind: 'progress', minutes: minutesLeft(track.duration, session.time) }
  }
  if (saved?.id === id) return { kind: 'progress', minutes: minutesLeft(track.duration, saved.time) }
  return { kind: completed.includes(id) ? 'done' : 'ready', minutes: listeningMinutes(track.duration) }
}
