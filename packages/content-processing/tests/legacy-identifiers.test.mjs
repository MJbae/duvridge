import assert from 'node:assert/strict'
import test from 'node:test'
import { createLegacyEpisodeMaps } from '../src/manuscripts/episode-ids.mjs'
import { parseManuscript } from '../src/manuscripts/parse-manuscript.mjs'

test('each book supplies its own legacy links and incompatible scroll positions', () => {
  const first = createLegacyEpisodeMaps({ headingIds: { old: 'ep01', prologue: 'prolog' }, decadeIds: { '1950s': 'ep01' } })
  const second = createLegacyEpisodeMaps({ headingIds: { elsewhere: 'ep01' } })
  assert.equal(first.legacyPageIds['ep-old'], 'ep01')
  assert.equal(first.legacyPageIds['life-prologue'], 'prolog')
  assert.equal(first.legacyReadingIds['life-1950s'], 'ep01')
  assert.deepEqual(first.legacyScrollResetIds, ['1950s', 'life-1950s'])
  assert.equal(second.legacyEpisodes.old, undefined)
  assert.deepEqual(createLegacyEpisodeMaps().legacyReadingIds, {})
})

test('reserved compatibility identifiers come from the selected book', () => {
  const manuscript = '# 1950. 터전\n\n## 이야기 {#ep01}\n\n*어느 날, 터전*\n\n본문.\n'
  assert.equal(parseManuscript(manuscript).episodes[0].id, 'ep01')
  assert.throws(() => parseManuscript(manuscript, undefined, { legacyEpisodes: { ep01: 'other' } }), /예약된 회차 ID/)
})
