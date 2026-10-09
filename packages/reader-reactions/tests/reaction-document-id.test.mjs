import test from 'node:test'
import assert from 'node:assert/strict'
import { storedPageId } from '../src/model/reaction-document-id.mjs'
test('existing first-work reactions keep their document IDs while new works have independent IDs', () => {
  for (const id of ['prolog', 'ep01', 'ep23', 'epilog', 'side']) assert.equal(storedPageId(id), `memoir-${id}`)
  assert.equal(storedPageId('another-work-ep01'), 'another-work-ep01')
  assert.notEqual(storedPageId('another-work-ep01'), storedPageId('ep01'))
})
