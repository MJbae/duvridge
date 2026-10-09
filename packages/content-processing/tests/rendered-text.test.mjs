import test from 'node:test'
import assert from 'node:assert/strict'
import { renderedText } from '../src/manuscripts/rendered-text.mjs'
test('published text comparisons follow HTML space collapsing and retain intentional non-breaking spaces', () => {
  assert.equal(renderedText('첫 문장.  다음\n문장.'), '첫 문장. 다음 문장.')
  assert.equal(renderedText('첫\u00a0\u00a0문장.'), '첫\u00a0\u00a0문장.')
  assert.notEqual(renderedText('첫 문장.'), renderedText('다른 문장.'))
})
