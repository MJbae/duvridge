import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createReactionStore } from '../src/state/create-reaction-store.ts'
import { emptyCounts, reactionOptions } from '../src/model/reaction-model.ts'

function browser(t) {
  const descriptors = Object.fromEntries(['window', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const storage = Object.create(null)
  Object.defineProperties(storage, {
    getItem: { value(key) { return Object.hasOwn(this, key) ? this[key] : null } },
    setItem: { value(key, value) { this[key] = String(value) } },
  })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2000 })
  t.after(() => {
    t.mock.timers.reset()
    for (const key of ['window', 'localStorage']) {
      if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key])
      else delete globalThis[key]
    }
  })
  return storage
}

test('visible reaction options retain existing labels and exclude the retired aggregate field', () => {
  assert.deepEqual(reactionOptions.map(option => [option.key, option.label]), [
    ['heart', '응원해요'], ['like', '좋아요'], ['moved', '뭉클해요'], ['wow', '대단해요'],
  ])
  assert.deepEqual(emptyCounts(), { heart: 0, like: 0, moved: 0, wow: 0 })
})

test('choices are immediate and rapid taps save only the final choice after the existing delay', async t => {
  const storage = browser(t)
  const writes = []
  let loads = 0
  const store = createReactionStore({ loadPersistence: async () => {
    loads++
    return { fetchReactions: async () => ({ counts: emptyCounts(), selected: null }),
      saveReaction: async (id, selected) => { writes.push({ id, selected }) } }
  } })
  store.chooseReaction('ep01', 'heart')
  store.chooseReaction('ep01', 'like')
  assert.deepEqual(store.getReactionState('ep01'), { counts: { heart: 0, like: 1, moved: 0, wow: 0 }, selected: 'like', error: '' })
  assert.equal(loads, 0)
  assert.equal(JSON.parse(storage.getItem('family-library:reaction:ep01')).pending, true)
  t.mock.timers.tick(999)
  await setImmediate()
  assert.deepEqual(writes, [])
  t.mock.timers.tick(1)
  await setImmediate()
  assert.deepEqual(writes, [{ id: 'ep01', selected: 'like' }])
  assert.deepEqual(JSON.parse(storage.getItem('family-library:reaction:ep01')), {
    version: 1, counts: { heart: 0, like: 1, moved: 0, wow: 0 }, selected: 'like', pending: false, lastSaved: 3000,
  })
})

test('a slow initial aggregate read cannot overwrite a newer local choice', async t => {
  browser(t)
  let finishRead
  const store = createReactionStore({ loadPersistence: async () => ({
    fetchReactions: () => new Promise(resolve => { finishRead = resolve }),
    saveReaction: async () => {},
  }) })
  const unsubscribe = store.subscribeReactions('ep01', () => {})
  await setImmediate()
  store.chooseReaction('ep01', 'heart')
  finishRead({ counts: { heart: 99, like: 20, moved: 4, wow: 2 }, selected: null })
  await setImmediate()
  assert.deepEqual(store.getReactionState('ep01'), { counts: { heart: 1, like: 0, moved: 0, wow: 0 }, selected: 'heart', error: '' })
  unsubscribe()
})

test('pending version-one browser selections resume through the same compatibility key', async t => {
  const storage = browser(t)
  storage.setItem('family-library:reaction:ep02', JSON.stringify({ version: 1,
    counts: { heart: 0, like: 1, moved: 0, wow: 0 }, selected: 'like', pending: true, lastSaved: 0 }))
  const writes = []
  const store = createReactionStore({ loadPersistence: async () => ({
    fetchReactions: async () => ({ counts: emptyCounts(), selected: null }),
    saveReaction: async (id, selected) => { writes.push({ id, selected }) },
  }) })
  const unsubscribe = store.subscribeReactions('ep02', () => {})
  await setImmediate()
  assert.equal(store.getReactionState('ep02').selected, 'like')
  assert.equal(store.getReactionState('ep02').counts.like, 1)
  t.mock.timers.tick(1000)
  await setImmediate()
  assert.deepEqual(writes, [{ id: 'ep02', selected: 'like' }])
  assert.equal(JSON.parse(storage.getItem('family-library:reaction:ep02')).pending, false)
  unsubscribe()
})

test('failed writes retain the choice and explicit retry clears the existing error after saving', async t => {
  browser(t)
  let writes = 0
  const store = createReactionStore({ loadPersistence: async () => ({
    fetchReactions: async () => ({ counts: emptyCounts(), selected: null }),
    saveReaction: async () => { if (++writes === 1) throw new Error('offline') },
  }) })
  store.chooseReaction('ep01', 'heart')
  t.mock.timers.tick(1000)
  await setImmediate()
  assert.equal(store.getReactionState('ep01').selected, 'heart')
  assert.equal(store.getReactionState('ep01').error, '반응을 저장하지 못했어요. 다시 시도해 주세요.')
  store.retryReaction('ep01')
  assert.equal(store.getReactionState('ep01').error, '')
  t.mock.timers.tick(1000)
  await setImmediate()
  assert.equal(writes, 2)
  assert.equal(store.getReactionState('ep01').counts.heart, 1)
  assert.equal(store.getReactionState('ep01').error, '')
})
