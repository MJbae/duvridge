import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { sharingCardImages } from '../scripts/render-sharing-cards.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const image = (src, alt = 'A book sharing preview') => ({ src, width: 1200, height: 630, type: 'image/png', alt })
const book = () => ({ id: 'another-book', sharing: { description: 'A work description.', image: image('/images/another-book.png') } })

test('sharing cards support a default image and optional original/video artwork for any book', () => {
  const another = book()
  assert.deepEqual(sharingCardImages(another), { original: another.sharing.image })
  another.sharing.images = {
    original: image('/images/another-original.png', 'The original series preview'),
    video: image('/images/another-video.png', 'The video preview'),
  }
  assert.deepEqual(sharingCardImages(another), another.sharing.images)
  delete another.sharing.images.original
  assert.deepEqual(sharingCardImages(another), { original: another.sharing.image, video: another.sharing.images.video })
})

test('sharing card metadata rejects unusable assets and ambiguous format outputs', () => {
  for (const [field, value] of [
    ['src', '/images/another-book.jpg'],
    ['src', '../another-book.png'],
    ['src', '/images/another?book.png'],
    ['src', '/images/another#book.png'],
    ['width', 1199],
    ['height', 631],
    ['alt', ''],
    ['type', 'image/jpeg'],
  ]) {
    const invalid = book()
    invalid.sharing.image[field] = value
    assert.throws(() => sharingCardImages(invalid), `${field}=${value}`)
  }
  const invalidDescription = book()
  invalidDescription.sharing.description = ' '
  assert.throws(() => sharingCardImages(invalidDescription))
  const unknownFormat = book()
  unknownFormat.sharing.images = { audiobook: image('/images/audio.png') }
  assert.throws(() => sharingCardImages(unknownFormat))
  const duplicate = book()
  duplicate.sharing.images = { video: { ...duplicate.sharing.image } }
  assert.throws(() => sharingCardImages(duplicate))
  const invalidOverride = book()
  invalidOverride.sharing.images = { video: { ...image('/images/video.png'), width: 0 } }
  assert.throws(() => sharingCardImages(invalidOverride))
  for (const fallback of [undefined, { ...image('/images/default.png'), width: 0 }]) {
    const invalidDefault = book()
    invalidDefault.sharing.image = fallback
    invalidDefault.sharing.images = { original: image('/images/original.png') }
    assert.throws(() => sharingCardImages(invalidDefault))
  }
})

test('the canonical original and video previews are distinct 1200×630 PNGs with format-specific alt text', () => {
  const source = path.join(root, 'content/books/bae-byunghee')
  const canonical = JSON.parse(readFileSync(path.join(source, 'book.json'), 'utf8'))
  assert.equal(canonical.sharing.description, '갯벌에서 들녘까지, 가족과 이웃을 위해 살아온 한평생.')
  const images = sharingCardImages(canonical)
  assert.equal(images.original.src, '/images/share-bae-byunghee-original-v3.png')
  assert.equal(images.video.src, '/images/share-bae-byunghee-video-v3.png')
  assert.match(images.original.alt, /오리지널/)
  assert.match(images.video.alt, /영상/)
  assert.notEqual(images.original.alt, images.video.alt)
  const bytes = Object.values(images).map(entry => {
    const png = readFileSync(path.join(source, 'public', entry.src))
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    assert.equal(png.subarray(12, 16).toString(), 'IHDR')
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [entry.width, entry.height])
    return png
  })
  assert.notDeepEqual(bytes[0], bytes[1])
})
