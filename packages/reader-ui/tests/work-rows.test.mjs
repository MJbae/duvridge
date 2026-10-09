import assert from 'node:assert/strict'
import test from 'node:test'
import { episodeName, episodeThumb, episodeWindow, progressPercent } from '../src/series/work-rows.mjs'
import { seriesHomeHref, seriesLinks } from '../src/series/series-tabs.mjs'

test('회차 이름은 번호 회차는 띄어 쓰고, 프롤로그처럼 이름 붙은 회차는 가운뎃점으로 잇는다', () => {
  assert.equal(episodeName({ label: '3화', title: '열두 자리 숫자', number: 3 }), '3화 열두 자리 숫자')
  assert.equal(episodeName({ label: '프롤로그', title: '벼 한 톨의 무게', number: null }), '프롤로그 · 벼 한 톨의 무게')
  assert.equal(episodeName({ label: '', title: '이야기', number: null }), '이야기')
})

test('접힌 목록은 처음 다섯 화, 읽던 회차가 있으면 그 회차를 네 번째에 둔다', () => {
  assert.deepEqual(episodeWindow(26, -1), { start: 0, end: 5 })
  assert.deepEqual(episodeWindow(26, 3), { start: 0, end: 5 })
  assert.deepEqual(episodeWindow(26, 12), { start: 9, end: 14 })
  assert.deepEqual(episodeWindow(26, 25), { start: 21, end: 26 })
  assert.deepEqual(episodeWindow(4, 2), { start: 0, end: 4 })
})

test('진행 막대는 0에서 100 사이의 정수로 보여 준다', () => {
  assert.equal(progressPercent(0.304), 30)
  assert.equal(progressPercent(1.4), 100)
  assert.equal(progressPercent(-1), 0)
  assert.equal(progressPercent(Number.NaN), 0)
})

test('썸네일은 대표 그림의 작은 크기를 쓰고 없으면 비워 둔다', () => {
  const sources = [360, 720, 1280].map(width => ({ src: `/images/episodes/ep01-01-${width}.jpg`, width }))
  const webpSources = sources.map(source => ({ ...source, src: source.src.replace('.jpg', '.webp') }))
  const illustrations = { ep01: [{ id: 'ep01-02', alt: '둘째', sources, webpSources }, { id: 'ep01-01', alt: '대표', representative: true, sources, webpSources }] }
  const thumb = episodeThumb(illustrations, 'ep01', path => `/novels${path}`)
  assert.equal(thumb.src, '/novels/images/episodes/ep01-01-360.jpg')
  assert.equal(thumb.alt, '대표')
  assert.match(thumb.webpSrcset, /ep01-01-720\.webp 720w/)
  assert.equal(episodeThumb(illustrations, 'ep02', path => path), undefined)
})

test('탭 링크는 플랫폼 홈의 해당 탭으로 돌아간다', () => {
  assert.deepEqual(seriesLinks('audio').map(link => [link.label, link.href, link.current]), [
    ['오리지널 시리즈', '/#novels', false], ['오디오북', '/#audiobooks', true], ['영상', '/#videos', false],
  ])
  assert.equal(seriesHomeHref('video'), '/#videos')
})
