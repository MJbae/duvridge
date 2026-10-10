import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createMarkdownRenderer, disposeMdItInstance } from 'vitepress'
import { episodeIllustrations } from '../src/markdown/render-episode-illustrations.ts'
import { episodeContext } from '../src/markdown/render-episode-context.ts'

test('배경 안내는 첫 삽화 뒤에, 삽화가 없거나 뒤에 나오면 본문 맨 앞에 둔다', async t => {
  disposeMdItInstance()
  t.after(disposeMdItInstance)
  const image = { id: 'scene', episodeId: 'ep01', alt: '삽화', width: 1280, height: 720,
    sources: [360, 720, 1280].map(width => ({ src: `/images/scene-${width}.jpg`, width })),
    position: { start: true, paragraphIndex: 0 } }
  const images = { ep01: [image] }
  const md = await createMarkdownRenderer(path.join(process.cwd(), 'context-renderer'), {
    config(md) {
      md.set({ html: false })
      md.use(episodeIllustrations, { base: '/test/', images })
      md.use(episodeContext)
    },
  })
  const render = (body, frontmatter = {}) => md.render(`# 회차\n\n${body}`, {
    frontmatter: { kind: 'episode', episodeId: 'ep01', time: '어느 날 · 마을', ...frontmatter },
  })
  const pictured = render('<!-- illustration: scene -->\n\n첫 문단.\n\n둘째 문단.')
  assert.ok(pictured.indexOf('</figure>') < pictured.indexOf('episode-context'))
  assert.ok(pictured.indexOf('episode-context') < pictured.indexOf('첫 문단.'))
  assert.equal((pictured.match(/class="episode-context"/g) ?? []).length, 1)
  assert.ok(!pictured.includes('<hr>'))

  image.position = { start: false, paragraphIndex: 1 }
  const later = render('첫 문단.\n\n<!-- illustration: scene -->\n\n둘째 문단.')
  assert.ok(later.indexOf('episode-context') < later.indexOf('첫 문단.'))
  assert.ok(later.indexOf('첫 문단.') < later.indexOf('data-illustration='))

  const plain = render('첫 문단.\n\n둘째 문단.', { episodeId: 'unillustrated' })
  assert.ok(plain.indexOf('</h1>') < plain.indexOf('episode-context'))
  assert.ok(plain.indexOf('episode-context') < plain.indexOf('첫 문단.'))
  assert.ok(!plain.includes('<figure'))
  assert.ok(!render('본문.', { episodeId: 'unillustrated', time: '' }).includes('episode-context'))
  assert.ok(!render('자료.', { kind: 'document' }).includes('episode-context'))

  const regularImage = render('![삽화](/images/plain.jpg)\n\n본문.', { episodeId: 'unillustrated' })
  assert.ok(regularImage.indexOf('<img ') < regularImage.indexOf('episode-context'))
  assert.ok(regularImage.indexOf('episode-context') < regularImage.indexOf('본문.'))
  const escaped = render('본문.', { episodeId: 'unillustrated', time: '<script> & {{ message }}' })
  assert.ok(escaped.includes('v-pre>&lt;script&gt; &amp; {{ message }}'))
})
