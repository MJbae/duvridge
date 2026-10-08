import { computed, nextTick, onBeforeUnmount, onMounted, reactive, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { useRouter, withBase } from 'vitepress'
import { cueIndexAt, nextCueStart, previousCueStart } from '../../shared/narration-cues.mjs'
import { resumeStart } from '../../shared/player.mjs'
import { catalog, type NarrationTrack } from './catalog'
import { createWakeLock, describeEpisode, reportPosition, reportState, setMediaControls } from './narration-device'
import { bringIntoView, cueElements, placement, setMark, showElement } from './narration-page'

export const narrationRates = [
  { value: 0.8, label: '느리게' },
  { value: 1, label: '보통' },
  { value: 1.25, label: '빠르게' },
  { value: 1.5, label: '더 빠르게' },
] as const
const keys = {
  session: 'family-library:narration',
  rate: 'family-library:narration-rate',
  autoplay: 'family-library:narration-autoplay',
  tip: 'family-library:read-along-tip',
}
const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])
const skipSeconds = 10

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

type Options = { audio: Ref<HTMLAudioElement | undefined>; page: ComputedRef<string>; onFinish: (id: string) => void }
export type Narration = ReturnType<typeof useNarration>
export const narrationKey: InjectionKey<Narration> = Symbol('narration')

/**
 * One recording at a time. It keeps playing while the listener browses, and the episode page it
 * belongs to reads along with it.
 */
export function useNarration({ audio, page, onFinish }: Options) {
  const router = useRouter()
  const state = reactive({
    episodeId: '', active: false, playing: false, waiting: false, failed: false,
    time: 0, cue: -1, follow: true, away: 0 as -1 | 0 | 1, rate: 1, autoplay: true, pick: -1, advancing: '',
    saved: null as { id: string; time: number } | null,
    // Assumed seen until the browser says otherwise, so the tip never flashes before it is known.
    tipSeen: true,
  })
  const wakeLock = createWakeLock()
  let marked: Element[] = []
  let pendingSeek: number | null = null
  let savedAt = 0
  let reported = ''
  let frame = 0
  let unbind: (() => void)[] = []

  const track = computed(() => narrationFor(state.episodeId))
  const pageTrack = computed(() => narrationFor(page.value))
  const onPage = computed(() => state.active && state.episodeId === page.value)
  const outroStart = computed(() => outroAt(track.value))
  const closing = computed(() => state.active && state.time >= outroStart.value)
  const next = computed(() => {
    const index = catalog.readingOrder.findIndex(episode => episode.id === state.episodeId)
    return index < 0 ? undefined : catalog.readingOrder[index + 1]
  })
  const nextTrack = computed(() => (next.value ? narrationFor(next.value.id) : undefined))
  const countdown = computed(() => Math.max(0, Math.ceil(((track.value?.duration ?? 0) - state.time) / state.rate)))
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
    if (state.follow && onPage.value) bringIntoView(marked)
    element()!.play()?.catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'AbortError') return
      state.playing = false
      state.failed = name !== 'NotAllowedError'
    })
  }

  function pause() { element()?.pause() }

  function mark() {
    setMark(marked, 'is-reading', false)
    const cue = track.value?.cues[state.cue]
    marked = onPage.value && cue ? cueElements(state.cue, cue[2]) : []
    setMark(marked, 'is-reading', true)
  }

  /** What the reader should see now: the sentence read aloud, or the way on once the closing music plays. */
  function focusElements(): Element[] {
    if (marked.length) return marked
    const navigation = closing.value ? document.querySelector('.episode-navigation') : null
    return navigation ? [navigation] : []
  }

  function setCue(index: number, force = false) {
    if (index === state.cue && !force) return
    state.cue = index
    mark()
    if (!onPage.value) return
    if (state.follow) bringIntoView(marked)
    else state.away = placement(focusElements())
  }

  function save() {
    savedAt = Date.now()
    if (!state.active || !state.episodeId) return
    // Once the closing music plays the episode is heard, so there is no place left in it to come back to.
    if (closing.value) return clearSaved()
    state.saved = { id: state.episodeId, time: Math.round(state.time * 100) / 100 }
    writeStorage(keys.session, JSON.stringify(state.saved))
  }

  /** Once the closing music starts, the episode counts as heard and the way on comes into view. */
  function closeEpisode() {
    reported = state.episodeId
    onFinish(state.episodeId)
    void nextTick(() => {
      if (!onPage.value) return
      if (state.follow) showElement(document.querySelector('.episode-navigation'))
      else measure()
    })
  }

  function tick() {
    const current = track.value
    if (!current || !state.active || !loaded()) return
    state.time = element()!.currentTime
    setCue(cueIndexAt(current.cues, state.time))
    if (state.time >= outroStart.value && reported !== state.episodeId) closeEpisode()
    if (Date.now() - savedAt > 3000) save()
    reportPosition(current.duration, state.time, state.rate)
  }

  function begin(id: string, time: number) {
    closePick()
    Object.assign(state, { episodeId: id, active: true, failed: false, follow: true, away: 0, time, cue: -1 })
    reported = time >= outroStart.value ? id : ''
    load(time)
  }

  function start(id: string, time = 0) {
    if (!narrationFor(id)) return
    begin(id, time)
    play()
    setCue(cueIndexAt(track.value!.cues, time), true)
    save()
  }

  /**
   * Plays an episode: the one already in use carries on, any other starts where the listener left
   * it or from the top. Opening it from another page keeps playing on the way there.
   */
  function open(id: string, time?: number) {
    const current = narrationFor(id)
    if (!current) return false
    if (state.active && state.episodeId === id) {
      if (time !== undefined) seek(time)
      play()
    } else start(id, time ?? (state.saved?.id === id ? resumeStart(current.cues, state.saved.time) : 0))
    state.advancing = id === page.value ? '' : id
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
    setCue(cueIndexAt(current.cues, state.time))
    save()
  }

  function seekBy(seconds: number) { seek(now() + seconds) }

  function previousSentence() {
    if (!track.value) return
    state.follow = true
    seek(previousCueStart(track.value.cues, now()))
  }

  function nextSentence() {
    const target = track.value ? nextCueStart(track.value.cues, now()) : null
    if (target === null) return
    state.follow = true
    seek(target)
  }

  /** A tapped sentence plays from its start, also before anything was playing on this page. */
  function playFrom(index: number) {
    const cue = pageTrack.value?.cues[index]
    if (!cue) return
    closePick()
    if (!onPage.value) return void open(page.value, cue[0])
    state.follow = true
    seek(cue[0])
    play()
  }

  function returnToCue() {
    Object.assign(state, { follow: true, away: 0 })
    mark()
    if (marked.length) bringIntoView(marked, true)
    else showElement(document.querySelector('.episode-navigation'))
  }

  function clearSaved() {
    state.saved = null
    writeStorage(keys.session, null)
  }

  /** Stopping keeps the place, so the listener can carry on later from the same sentence. */
  function stop() {
    closePick()
    save()
    Object.assign(state, { active: false, playing: false, waiting: false, advancing: '' })
    release()
    mark()
  }

  /** The last episode with a recording has played out: nothing is left to resume in it. */
  function finish() {
    closePick()
    Object.assign(state, { active: false, playing: false, waiting: false, advancing: '', cue: -1 })
    clearSaved()
    release()
    mark()
  }

  /** The next episode plays at once; a listener following the text is taken to its page. */
  function advance() {
    const following = next.value
    if (!following || !narrationFor(following.id)) return finish()
    const navigate = onPage.value
    start(following.id, 0)
    if (!navigate) return
    state.advancing = following.id
    void router.go(withBase(following.url))
  }

  function onEnded() {
    if (reported !== state.episodeId) closeEpisode()
    if (state.autoplay && nextTrack.value) return advance()
    finish()
  }

  function retry() {
    element()?.removeAttribute('src')
    play()
  }

  /** Called once an episode's text is on screen. */
  function attach() {
    mark()
    if (onPage.value && state.playing && state.follow) bringIntoView(marked)
    else state.away = placement(focusElements())
  }

  function closePick() {
    if (state.pick < 0) return
    setMark(cueElements(state.pick), 'is-picked', false)
    state.pick = -1
  }

  function dismissTip() {
    if (state.tipSeen) return
    state.tipSeen = true
    writeStorage(keys.tip, '1')
  }

  /** Tapping a sentence of an episode with a recording offers to play from it. */
  function choose(event: Event) {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('.narration-pick')) return
    const cue = pageTrack.value ? target?.closest('.story-content .cue') : null
    closePick()
    if (!cue || !window.getSelection()?.isCollapsed) return
    state.pick = Number(cue.getAttribute('data-cue'))
    setMark(cueElements(state.pick), 'is-picked', true)
    dismissTip()
  }

  function measure() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { state.away = placement(focusElements()) })
  }

  /** Reading elsewhere pauses the page's movement until the reader comes back. */
  function leaveFollow(event: Event) {
    if (!onPage.value || !state.follow) return
    if (event.target instanceof Element && event.target.closest('.player-bar, dialog, .narration-pick')) return
    state.follow = false
    measure()
  }

  function onKey(event: Event) {
    if (!(event instanceof KeyboardEvent)) return
    if (event.key === 'Escape') return closePick()
    if (!scrollKeys.has(event.key)) return
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return
    leaveFollow(event)
  }

  function setRate(value: number) {
    state.rate = value
    applyRate()
    writeStorage(keys.rate, String(value))
  }

  function setAutoplay(value: boolean) {
    state.autoplay = value
    writeStorage(keys.autoplay, value ? '1' : '0')
  }

  const controls = { play, pause, stop, seek, back: () => seekBy(-skipSeconds), forward: () => seekBy(skipSeconds) }

  // Another page takes over the screen: marks on the old text go, and the recording plays on.
  watch(page, id => {
    closePick()
    setMark(marked, 'is-reading', false)
    marked = []
    if (state.advancing && state.advancing === id) state.follow = true
    state.advancing = ''
  })

  onMounted(() => {
    const rate = Number(readStorage(keys.rate))
    if (narrationRates.some(option => option.value === rate)) state.rate = rate
    state.autoplay = readStorage(keys.autoplay) !== '0'
    state.saved = savedSession()
    state.tipSeen = readStorage(keys.tip) === '1'
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
      listen(window, [
        ['wheel', leaveFollow, { passive: true }],
        ['touchmove', leaveFollow, { passive: true }],
        ['keydown', onKey],
        ['scroll', () => { if (!state.follow && onPage.value) measure() }, { passive: true }],
        ['pagehide', save],
      ]),
      listen(document, [['click', choose], ['visibilitychange', wakeLock.refresh]]),
    ]
  })

  onBeforeUnmount(() => {
    for (const remove of unbind) remove()
    cancelAnimationFrame(frame)
    wakeLock.release()
    setMediaControls(null)
  })

  return {
    state, page, track, pageTrack, next, nextTrack, countdown, closing, onPage,
    open, play, pause, toggle, seek, previousSentence, nextSentence, playFrom, returnToCue, stop, retry,
    attach, setRate, setAutoplay, dismissTip,
  }
}
