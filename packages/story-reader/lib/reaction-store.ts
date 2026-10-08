// This module stays small and SDK-free so reaction buttons can respond immediately.
export const reactionOptions = [
  { key: 'heart', icon: 'heart', label: '응원해요' },
  { key: 'like', icon: 'thumb', label: '좋아요' },
  { key: 'moved', icon: 'drop', label: '뭉클해요' },
  { key: 'wow', icon: 'sparkle', label: '대단해요' },
] as const
export type Reaction = typeof reactionOptions[number]['key']
export type Counts = Record<Reaction, number>
export const emptyCounts = (): Counts => ({ heart: 0, like: 0, moved: 0, wow: 0 })
export type ReactionState = { counts: Counts; selected: Reaction | null; error: string }
type Listener = (state: ReactionState) => void
type Entry = {
  pageId: string; state: ReactionState; pending: boolean; revision: number; lastSaved: number
  saving: boolean; timer?: ReturnType<typeof setTimeout>; refreshing?: Promise<void>; listeners: Set<Listener>
}
const entries = new Map<string, Entry>()
const storagePrefix = 'family-library:reaction:'
let initialized = false

function entryFor(pageId: string): Entry {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(pageId)) throw new Error('연결 오류예요. 운영자에게 알려 주세요.')
  const existing = entries.get(pageId)
  if (existing) return existing
  const entry: Entry = { pageId, state: { counts: emptyCounts(), selected: null, error: '' },
    pending: false, revision: 0, lastSaved: 0, saving: false, listeners: new Set() }
  try {
    const cached = JSON.parse(localStorage.getItem(storagePrefix + pageId) || 'null')
    if (cached?.version === 1 && (cached.selected === null || reactionOptions.some(option => option.key === cached.selected))) {
      if (reactionOptions.every(option => Number.isSafeInteger(cached.counts?.[option.key]) && cached.counts[option.key] >= 0)) {
        entry.state.counts = Object.fromEntries(reactionOptions.map(option => [option.key, cached.counts[option.key]])) as Counts
      }
      entry.state.selected = cached.selected
      entry.pending = cached.pending === true
      entry.lastSaved = Number.isFinite(cached.lastSaved) ? cached.lastSaved : 0
    }
  } catch { /* Browser storage is optional; in-memory navigation still works. */ }
  entries.set(pageId, entry)
  return entry
}

function snapshot(entry: Entry): ReactionState { return { ...entry.state, counts: { ...entry.state.counts } } }
function publish(entry: Entry) {
  try {
    localStorage.setItem(storagePrefix + entry.pageId, JSON.stringify({ version: 1,
      counts: entry.state.counts, selected: entry.state.selected, pending: entry.pending, lastSaved: entry.lastSaved }))
  } catch { /* optional */ }
  for (const listener of entry.listeners) listener(snapshot(entry))
}
function adjustCounts(counts: Counts, previous: Reaction | null, next: Reaction | null) {
  if (previous) counts[previous] = Math.max(0, counts[previous] - 1)
  if (next) counts[next]++
}
function schedule(entry: Entry) {
  clearTimeout(entry.timer)
  // Coalesce fast taps and respect the existing one-second Firestore update rule.
  entry.timer = setTimeout(() => void flush(entry), Math.max(1000, entry.lastSaved + 1100 - Date.now()))
}
async function flush(entry: Entry) {
  entry.timer = undefined
  if (!entry.pending || entry.saving) return
  const revision = entry.revision, target = entry.state.selected
  entry.saving = true
  try {
    const backend = await import('./reaction-firestore')
    await backend.saveReaction(entry.pageId, target)
    entry.lastSaved = Date.now()
    if (entry.revision === revision) entry.pending = false
    entry.state.error = ''
    publish(entry)
  } catch {
    if (entry.revision === revision) {
      entry.state.error = '반응을 저장하지 못했어요. 다시 시도해 주세요.'
      publish(entry)
    }
  } finally {
    entry.saving = false
    if (entry.pending && entry.revision !== revision) schedule(entry)
  }
}

function refresh(entry: Entry) {
  if (entry.refreshing) return
  const revision = entry.revision, lastSaved = entry.lastSaved
  entry.refreshing = import('./reaction-firestore').then(backend => backend.fetchReactions(entry.pageId)).then(data => {
    // A slow initial read must never replace a newer local choice or a completed write.
    if (entry.revision !== revision || entry.lastSaved !== lastSaved || entry.saving) return
    entry.state.counts = data.counts
    if (entry.pending) adjustCounts(entry.state.counts, data.selected, entry.state.selected)
    else entry.state.selected = data.selected
    publish(entry)
  }).catch(() => { /* Counts may stay cached; readers can still leave a reaction. */ })
    .finally(() => { entry.refreshing = undefined })
}
function resumePending() {
  for (const entry of entries.values()) {
    if (entry.pending && !entry.saving) { entry.state.error = ''; publish(entry); schedule(entry) }
  }
}
function initialize() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(storagePrefix)) entryFor(key.slice(storagePrefix.length))
    }
  } catch { /* optional */ }
  resumePending()
  window.addEventListener('online', resumePending)
}

export function getReactionState(pageId: string): ReactionState { return snapshot(entryFor(pageId)) }
export function subscribeReactions(pageId: string, listener: Listener): () => void {
  initialize()
  const entry = entryFor(pageId)
  entry.listeners.add(listener)
  listener(snapshot(entry))
  refresh(entry)
  return () => { entry.listeners.delete(listener) }
}
export function chooseReaction(pageId: string, key: Reaction) {
  const entry = entryFor(pageId)
  const next = entry.state.selected === key ? null : key
  adjustCounts(entry.state.counts, entry.state.selected, next)
  entry.state.selected = next
  entry.state.error = ''
  entry.pending = true
  entry.revision++
  publish(entry)
  schedule(entry)
}
export function retryReaction(pageId: string) {
  const entry = entryFor(pageId)
  entry.state.error = ''
  publish(entry)
  if (entry.pending) schedule(entry)
}
