import { withBase } from 'vitepress'
import type { Catalog } from './reader-catalog'

type Controls = { play(): void; pause(): void; stop(): void; back(): void; forward(): void; seek(time: number): void }
const actions: MediaSessionAction[] = ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto']
// Track buttons stay unset: iOS shows either track or skip buttons, and listeners expect skips.
const trackActions: MediaSessionAction[] = ['previoustrack', 'nexttrack']
const supported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator

function handlerFor(action: MediaSessionAction, controls: Controls): MediaSessionActionHandler {
  if (action === 'play') return () => controls.play()
  if (action === 'pause') return () => controls.pause()
  if (action === 'stop') return () => controls.stop()
  if (action === 'seekbackward') return () => controls.back()
  if (action === 'seekforward') return () => controls.forward()
  return details => { if (details.seekTime !== undefined) controls.seek(details.seekTime) }
}

/**
 * Lock screen and earphone buttons control the narration while it is in use. The skip buttons move
 * ten seconds, which matches the "10" iOS draws on them whatever the interval.
 */
export function setMediaControls(controls: Controls | null) {
  if (!supported()) return
  for (const action of actions) {
    try { navigator.mediaSession.setActionHandler(action, controls ? handlerFor(action, controls) : null) } catch { /* The system keeps its default for this button. */ }
  }
  for (const action of trackActions) {
    try { navigator.mediaSession.setActionHandler(action, null) } catch { /* Not every browser knows every action. */ }
  }
  if (!controls) {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
  }
}

/** The lock screen keeps the episode's representative watercolor, regardless of inline order. */
export function describeEpisode(catalog: Catalog, id: string) {
  if (!supported() || typeof MediaMetadata === 'undefined') return
  const episode = catalog.readingOrder.find(candidate => candidate.id === id)
  if (!episode) return
  const images = catalog.illustrations[id]
  const image = images?.find(image => image.representative) ?? images?.[0]
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `${episode.label} ${episode.title}`,
    artist: catalog.work.subtitle,
    album: catalog.work.title,
    artwork: (image?.sources ?? []).map(source => ({
      src: withBase(source.src),
      sizes: `${source.width}x${Math.round(source.width * 9 / 16)}`,
      type: 'image/jpeg',
    })),
  })
}

export function reportPosition(duration: number, position: number, playbackRate: number) {
  if (!supported() || !navigator.mediaSession.setPositionState) return
  try {
    navigator.mediaSession.setPositionState({ duration, playbackRate, position: Math.min(Math.max(0, position), duration) })
  } catch { /* The position is reported again on the next update. */ }
}

export function reportState(state: MediaSessionPlaybackState) {
  if (supported()) navigator.mediaSession.playbackState = state
}

/** Keeps the screen on while the reader follows the voice; one request at a time, released when no longer wanted. */
export function createWakeLock() {
  let sentinel: WakeLockSentinel | null = null
  let pending = false
  let wanted = false
  async function acquire() {
    if (!wanted || sentinel || pending || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    pending = true
    try {
      const lock = await navigator.wakeLock.request('screen')
      if (!wanted) return void lock.release()
      sentinel = lock
      lock.addEventListener('release', () => { if (sentinel === lock) sentinel = null })
    } catch {
      sentinel = null
    } finally {
      pending = false
    }
  }
  return {
    hold() { wanted = true; void acquire() },
    release() { wanted = false; void sentinel?.release(); sentinel = null },
    refresh() { void acquire() },
  }
}
