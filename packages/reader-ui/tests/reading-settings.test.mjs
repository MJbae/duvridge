import assert from 'node:assert/strict'
import test from 'node:test'
import { faceOptions, fontSizeOptions, leadingOptions, readingSettings } from '../src/state/reading-settings.mjs'

test('reading defaults to the second font step, normal leading and serif', () => {
  assert.deepEqual(readingSettings(), { font: 1, leading: 'normal', face: 'serif' })
})

test('the four named font steps preview 18, 20, 23 and 26 pixels', () => {
  assert.deepEqual(fontSizeOptions.map(option => option.label), ['작게', '기본', '크게', '아주 크게'])
  assert.deepEqual(fontSizeOptions.map(option => option.pixels), [18, 20, 23, 26])
  for (const option of fontSizeOptions) assert.equal(parseFloat(option.sample) * 16, option.pixels)
})

test('all stored font indices remain compatible as strings and numbers', () => {
  for (let font = 0; font < 4; font++) {
    assert.equal(readingSettings({ font }).font, font)
    assert.equal(readingSettings({ font: String(font) }).font, font)
  }
})

test('invalid font preferences cannot create a missing or fractional step', () => {
  for (const font of [null, undefined, '', ' ', '4', '-1', '1.5', 'default', -1, 4, 1.5, NaN, Infinity, true, []]) {
    assert.equal(readingSettings({ font }).font, 1)
  }
})

test('leading and face choices restore every valid combination', () => {
  for (const { value: leading } of leadingOptions) {
    for (const { value: face } of faceOptions) {
      assert.deepEqual(readingSettings({ font: '3', leading, face }), { font: 3, leading, face })
    }
  }
})

test('invalid preferences fall back independently while retaining valid choices', () => {
  assert.deepEqual(readingSettings({ font: '2', leading: 'narrow', face: 'sans' }), { font: 2, leading: 'normal', face: 'sans' })
  assert.deepEqual(readingSettings({ font: 'bad', leading: 'wide', face: 'gothic' }), { font: 1, leading: 'wide', face: 'serif' })
})
