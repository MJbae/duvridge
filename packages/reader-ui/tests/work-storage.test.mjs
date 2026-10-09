import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateWorkStorage, reactionPageId, workStorageKey } from '../src/state/work-storage.mjs'
test('legacy work history is copied once and rollback originals remain unchanged', () => {
  const values = new Map(['reading', 'resume', 'completed', 'narration'].map(kind => [`family-library:${kind}`, JSON.stringify({ kind })]))
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  migrateWorkStorage(storage, { id: 'first', legacyRoot: true })
  for (const kind of ['reading', 'resume', 'completed', 'narration']) assert.equal(storage.getItem(workStorageKey('first', kind)), storage.getItem(`family-library:${kind}`))
  storage.setItem(workStorageKey('first', 'reading'), 'new position')
  migrateWorkStorage(storage, { id: 'first', legacyRoot: true })
  assert.equal(storage.getItem(workStorageKey('first', 'reading')), 'new position')
  assert.notEqual(storage.getItem('family-library:reading'), 'new position')
  migrateWorkStorage(storage, { id: 'second' })
  assert.equal(storage.getItem(workStorageKey('second', 'reading')), null)
})
test('storage failure is optional and reactions keep existing first-work IDs', () => {
  assert.doesNotThrow(() => migrateWorkStorage({ getItem() { throw new Error('blocked') } }, { id: 'first', legacyRoot: true }))
  assert.equal(reactionPageId({ id: 'first', legacyRoot: true }, 'ep01'), 'ep01')
  assert.equal(reactionPageId({ id: 'second' }, 'ep01'), 'second-ep01')
})
