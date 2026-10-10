import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { partitionCharacters, unicodeRange } from '../src/fonts/reader-fonts.mjs'
import { readerFontHead, readerFontHeadHtml } from '../src/fonts/font-head.mjs'
import { readingFontPreloadScript } from '../src/fonts/font-head.mjs'
import { runInNewContext } from 'node:vm'

test('subsets preserve every upstream glyph exactly once, including new titles and supplementary characters', () => {
  const supported = [32, 65, 66, 67, 0xAC00, 0xB098, 0x1F600]
  const parts = partitionCharacters(supported, 'B가😀😀?', 2)
  assert.deepEqual(parts[0], [66, 0xAC00, 0x1F600])
  assert.deepEqual(parts.flat().sort((a, b) => a - b), supported)
  assert.equal(new Set(parts.flat()).size, supported.length)
  assert.deepEqual(partitionCharacters(supported, 'A나', 2)[0], [65, 0xB098])
  assert.equal(unicodeRange([67, 65, 66, 66, 0xAC00, 0x1F600]), 'U+41-43,U+AC00,U+1F600')
  const frequent = partitionCharacters(supported, 'A', 2, [0xAC00, 0x1F600, 66])
  assert.deepEqual(frequent[1], [0xAC00, 0x1F600])
  assert.deepEqual(frequent.flat().sort((a, b) => a - b), supported)
})

test('only the common title and UI 600 are preloaded; body shards stay demand loaded', () => {
  const manifest = { stylesheet: 'reader.0123456789abcdef.css', faces: [
    { family: 'ToldLife Serif', file: 'serif-400.a.woff2', common: true, weight: '400' },
    { family: 'ToldLife Serif', file: 'serif.a.woff2', common: true, weight: '500 800' },
    { family: 'ToldLife Serif', file: 'serif.b.woff2', common: false, weight: '500 800' },
    ...['400', '500', '600', '700'].map(weight => ({ family: 'ToldLife UI', file: `ui-${weight}.woff2`, common: true, weight })),
  ] }
  const head = readerFontHead(manifest)
  assert.equal(head[0][1].href, '/fonts/reader.0123456789abcdef.css')
  assert.deepEqual(head.slice(1).map(([, attributes]) => attributes.href), ['/fonts/serif.a.woff2', '/fonts/ui-600.woff2'])
  assert(head.slice(1).every(([, attributes]) => attributes.crossorigin === '' && attributes.as === 'font'))
  const html = readerFontHeadHtml(manifest)
  assert(!html.includes('googleapis') && !html.includes('gstatic'))
  assert(html.includes('id="reader-fonts"'))
  for (const [saved, expected] of [['sans', '/fonts/ui-400.woff2'], ['serif', '/fonts/serif-400.a.woff2']]) {
    const links = []
    runInNewContext(readingFontPreloadScript(manifest), { document: {
      documentElement: { dataset: { readerFace: saved } }, createElement: () => ({}), head: { append: link => links.push(link) },
    } })
    assert.equal(links[0].href, expected)
    assert.equal(links[0].crossOrigin, 'anonymous')
  }
})

test('vendored source versions and licenses remain verifiable without network access', () => {
  const base = new URL('../../../assets/fonts/sources/', import.meta.url)
  const sources = JSON.parse(readFileSync(new URL('sources.json', base), 'utf8'))
  for (const source of sources.sources) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(source.file, base))).digest('hex'), source.sha256)
    assert(source.upstreamUrl.includes(sources.googleFontsCommit))
    assert(source.family.startsWith('ToldLife '))
  }
  for (const name of ['hahmlet-OFL.txt', 'ibmplexsanskr-OFL.txt']) assert.match(readFileSync(new URL(name, base), 'utf8'), /SIL OPEN FONT LICENSE/)
})
