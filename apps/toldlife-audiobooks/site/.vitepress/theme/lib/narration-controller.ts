import { computed, onBeforeUnmount, onMounted, reactive, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { useRouter, withBase } from 'vitepress'
import { cueIndexAt } from '../../shared/narration-cues.mjs'
import { nextSleepChoice, resumeStart } from '../../shared/playback-selection.mjs'
import { catalog, type NarrationTrack } from './reader-catalog'
import { createWakeLock, describeEpisode, reportPosition, reportState, setMediaControls } from './narration-device-controls'

export const narrationRates = [0.8, 1, 1.25, 1.5] as const
const keys = {
  session: 'family-library:narration',
  rate: 'family-library:narration-rate',
  autoplay: 'family-library:narration-autoplay',
}
const skipSeconds = 10
/** How long an episode's end stays on screen before the next episode starts by itself. */
export const advanceDelay = 5000

export const narrationFor = (id: string): NarrationTrack | undefined => catalog.narration?.[id]
/** Only a plain click follows a link in this tab; a modified click opens it elsewhere and leaves playback alone. */
export const followsHere = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

/** Where an episode's closing music starts; from there on the episode counts as heard. */
function outroAt(current: NarrationTrack | undefined) {
  const last = current?.cues.at(-1)
  return last?.[2] === 'music' ? last[0] : current?.duration ?? Infinity
}

function readStorage(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* Listening works without browser storage. */ }
}
function savedSession(): { id: string; time: number } | null {
  try {
    const saved = JSON.parse(readStorage(keys.session) || 'null')
    if (typeof saved?.id !== 'string' || !Number.isFinite(saved.time) || !narrationFor(saved.id)) return null
    // A place in the closing music belongs to an episode already heard.
    return saved.time < outroAt(narrationFor(saved.id)) ? { id: saved.id, time: saved.time } : null
  } catch { return null }
}
function listen(target: EventTarget, entries: [string, EventListener, AddEventListenerOptions?][]) {
  for (const [name, handler, options] of entries) target.addEventListener(name, handler, options)
  return () => { for (const [name, handler] of entries) target.removeEventListener(name, handler) }
}

/** The audiobook and the video play the same narration; only the page that shows it differs. */
export type NarrationMode = 'listen' | 'watch'
type Options = { audio: Ref<HTMLAudioElement | undefined>; page: ComputedRef<string>; mode: ComputedRef<NarrationMode>; onFinish: (id: string) => void }
export type Narration = ReturnType<typeof useNarration>
export const narrationKey: InjectionKey<Narration> = Symbol('narration')

/** Where an episode opens in each format. */
export function episodePath(id: string, mode: NarrationMode) {
  const episode = catalog.readingOrder.find(entry => entry.id === id)
  if (!episode) return withBase('/')
  return withBase(mode === 'watch' ? `/watch/${id}.html` : episode.url)
}

/**
 * One recording at a time, for the audiobook player and the video alike. It keeps playing while the
 * listener moves between pages, resumes from the sentence where it stopped, and at an episode's end
 * shows that end before the next episode starts.
 */
export function useNarration({ audio, page, mode, onFinish }: Options) {
  const router = useRouter()
  const state = reactive({
    episodeId: '', active: false, playing: false, waiting: false, failed: false,
    time: 0, cue: -1, rate: 1, autoplay: true,
    /** 0: no timer; minutes; -1: stop when this episode ends. */
    sleep: 0,
    /** The episode whose end is on screen. */
    ended: '',
    /** When the next episode starts by itself, in ms since the epoch; 0 when it does not. */
    advanceAt: 0,
    saved: null as { id: string; time: number } | null,
  })
  const wakeLock = createWakeLock()
  let pendingSeek: number | null = null
  let savedAt = 0
  let reported = ''
  let sleepTimer: ReturnType<typeof setTimeout> | undefined
  let advanceTimer: ReturnType<typeof setTimeout> | undefined
  let unbind: (() => void)[] = []

  const track = computed(() => narrationFor(state.episodeId))
  const outroStart = computed(() => outroAt(track.value))
  const next = computed(() => {
    const index = catalog.readingOrder.findIndex(episode => episode.id === state.episodeId)
    return index < 0 ? undefined : catalog.readingOrder[index + 1]
  })
  const nextTrack = computed(() => (next.value ? narrationFor(next.value.id) : undefined))
  const element = () => audio.value
  const loaded = () => Boolean(track.value && element()?.getAttribute('src') === withBase(track.value.src))
  const now = () => (loaded() ? element()!.currentTime : state.time)

  function applyRate() {
    const media = element()
    if (!media) return
    media.defaultPlaybackRate = state.rate
    media.playbackRate = state.rate
  }

  function moveTo(time: number) {
    const media = element()
    if (!media) return
    pendingSeek = time
    try { media.currentTime = time } catch { /* Applied once the recording's length is known. */ }
  }

  function applyPendingSeek() {
    const media = element()
    if (media && pendingSeek !== null && Math.abs(media.currentTime - pendingSeek) > 0.25) media.currentTime = pendingSeek
    pendingSeek = null
  }

  /** One element plays every episode, so the next episode may start without another tap. */
  function load(time: number) {
    const media = element()
    if (!media || !track.value) return false
    const src = withBase(track.value.src)
    if (media.getAttribute('src') !== src) {
      media.setAttribute('src', src)
      media.load()
    }
    applyRate()
    moveTo(time)
    return true
  }

  /** The lock screen shows and controls the episode while it is in use. */
  function claimMedia() {
    setMediaControls(controls)
    describeEpisode(state.episodeId)
  }

  /** Lets go of the recording once nothing is left to hear, so nothing can restart it unseen. */
  function release() {
    const media = element()
    media?.pause()
    if (media?.getAttribute('src')) {
      media.removeAttribute('src')
      media.load()
    }
    wakeLock.release()
    setMediaControls(null)
  }

  function play() {
    if (!state.active || (!loaded() && !load(state.time))) return
    state.failed = false
    claimMedia()
    element()!.play()?.catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'AbortError') return
      state.playing = false
      state.failed = name !== 'NotAllowedError'
    })
  }

  function pause() { element()?.pause() }

  function save() {
    savedAt = Date.now()
    if (!state.active || !state.episodeId) return
    // Once the closing music plays the episode is heard, so there is no place left in it to come back to.
    if (state.time >= outroStart.value) return clearSaved()
    state.saved = { id: state.episodeId, time: Math.round(state.time * 100) / 100 }
    writeStorage(keys.session, JSON.stringify(state.saved))
  }

  /** Once the closing music starts, the episode counts as heard. */
  function closeEpisode() {
    reported = state.episodeId
    onFinish(state.episodeId)
  }

  function tick() {
    const current = track.value
    if (!current || !state.active || !loaded()) return
    state.time = element()!.currentTime
    state.cue = cueIndexAt(current.cues, state.time)
    if (state.time >= outroStart.value && reported !== state.episodeId) closeEpisode()
    if (Date.now() - savedAt > 3000) save()
    reportPosition(current.duration, state.time, state.rate)
  }

  function cancelAdvance() {
    clearTimeout(advanceTimer)
    state.advanceAt = 0
  }

  function begin(id: string, time: number) {
    cancelAdvance()
    Object.assign(state, { episodeId: id, active: true, failed: false, time, ended: '' })
    state.cue = cueIndexAt(track.value?.cues ?? [], time)
    reported = time >= outroStart.value ? id : ''
    load(time)
  }

  function start(id: string, time = 0) {
    if (!narrationFor(id)) return
    begin(id, time)
    play()
    save()
  }

  /**
   * Plays an episode: the one already in use carries on, any other starts where the listener left
   * it or from the top. Opening it from another page keeps playing on the way there.
   */
  function open(id: string, time?: number) {
    const current = narrationFor(id)
    if (!current) return false
    if (state.active && state.episodeId === id && !state.ended) {
      if (time !== undefined) seek(time)
      play()
    } else start(id, time ?? (state.saved?.id === id ? resumeStart(current.cues, state.saved.time) : 0))
    return true
  }

  function toggle() {
    const media = element()
    if (media && loaded() && !media.paused) media.pause()
    else play()
  }

  function seek(time: number) {
    const current = track.value
    if (!current) return
    state.time = Math.min(Math.max(0, time), current.duration)
    if (loaded()) moveTo(state.time)
    state.cue = cueIndexAt(current.cues, state.time)
    save()
  }

  function seekBy(seconds: number) { seek(now() + seconds) }

  /** A tapped sentence plays from its start. */
  function playCue(id: string, index: number) {
    const cue = narrationFor(id)?.cues[index]
    if (!cue) return
    open(id, cue[0])
  }

  function clearSaved() {
    state.saved = null
    writeStorage(keys.session, null)
  }

  /** Stopping keeps the place, so the listener can carry on later from the same sentence. */
  function stop() {
    cancelAdvance()
    save()
    Object.assign(state, { active: false, playing: false, waiting: false })
    release()
  }

  /** Nothing plays on after this episode; its end stays on screen. */
  function finish() {
    cancelAdvance()
    Object.assign(state, { active: false, playing: false, waiting: false })
    clearSaved()
    release()
  }

  /** The next episode plays at once, on the next episode's page of the same format. */
  function advance() {
    cancelAdvance()
    const following = next.value
    if (!following || !narrationFor(following.id)) return
    const showing = page.value === state.episodeId
    start(following.id, 0)
    if (showing) void router.go(episodePath(following.id, mode.value))
  }

  function onEnded() {
    if (reported !== state.episodeId) closeEpisode()
    const stopHere = state.sleep === -1
    if (stopHere) setSleep(0)
    const carryOn = !stopHere && state.autoplay && Boolean(nextTrack.value)
    state.ended = state.episodeId
    state.playing = false
    if (!carryOn) return finish()
    state.advanceAt = Date.now() + advanceDelay
    advanceTimer = setTimeout(advance, advanceDelay)
  }

  function retry() {
    element()?.removeAttribute('src')
    play()
  }

  function setRate(value: number) {
    state.rate = value
    applyRate()
    writeStorage(keys.rate, String(value))
  }

  function cycleRate() {
    const index = narrationRates.findIndex(rate => rate === state.rate)
    setRate(narrationRates[(index + 1) % narrationRates.length])
  }

  /** The sleep timer pauses after a while, or stops at this episode's end instead of going on. */
  function setSleep(value: number) {
    clearTimeout(sleepTimer)
    state.sleep = value
    if (value > 0) sleepTimer = setTimeout(() => { pause(); state.sleep = 0 }, value * 60_000)
  }

  function cycleSleep() { setSleep(nextSleepChoice(state.sleep)) }

  const controls = { play, pause, stop, seek, back: () => seekBy(-skipSeconds), forward: () => seekBy(skipSeconds) }

  // Leaving an episode's end for another page: the end screen goes, and anything planned to start stays.
  watch(page, id => { if (state.ended && state.ended !== id) { state.ended = ''; cancelAdvance() } })

  onMounted(() => {
    const rate = Number(readStorage(keys.rate))
    if (narrationRates.some(option => option === rate)) state.rate = rate
    state.autoplay = readStorage(keys.autoplay) !== '0'
    state.saved = savedSession()
    unbind = [
      listen(element()!, [
        ['play', () => { state.playing = true; wakeLock.hold(); reportState('playing') }],
        ['playing', () => { state.playing = true; state.waiting = false }],
        ['pause', () => {
          Object.assign(state, { playing: false, waiting: false })
          wakeLock.release()
          if (state.active) reportState('paused')
          save()
        }],
        ['waiting', () => { state.waiting = true }],
        ['canplay', () => { state.waiting = false }],
        ['timeupdate', tick],
        ['seeked', tick],
        ['loadedmetadata', applyPendingSeek],
        ['ended', onEnded],
        ['error', () => {
          if (!element()?.error) return
          Object.assign(state, { failed: true, playing: false, waiting: false })
          wakeLock.release()
        }],
      ]),
      listen(window, [['pagehide', save]]),
      listen(document, [['visibilitychange', wakeLock.refresh]]),
    ]
  })

  onBeforeUnmount(() => {
    for (const remove of unbind) remove()
    clearTimeout(sleepTimer)
    cancelAdvance()
    wakeLock.release()
    setMediaControls(null)
  })

  return {
    state, page, mode, track, next, nextTrack,
    open, play, pause, toggle, seek, seekBy, playCue, stop, retry, advance, cancelAdvance,
    setRate, cycleRate, setSleep, cycleSleep,
  }
}
