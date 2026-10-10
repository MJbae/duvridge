import assert from 'node:assert/strict'
import test from 'node:test'
import { episodeName, episodeThumb, progressPercent } from '../src/series/work-rows.mjs'
import { formatLinks, seriesHomeHref, seriesLinks, seriesWorkHref } from '../src/series/series-tabs.mjs'

test('회차 이름은 번호 회차는 띄어 쓰고, 프롤로그처럼 이름 붙은 회차는 가운뎃점으로 잇는다', () => {
  assert.equal(episodeName({ label: '3화', title: '열두 자리 숫자', number: 3 }), '3화 열두 자리 숫자')
  assert.equal(episodeName({ label: '프롤로그', title: '벼 한 톨의 무게', number: null }), '프롤로그 · 벼 한 톨의 무게')
  assert.equal(episodeName({ label: '', title: '이야기', number: null }), '이야기')
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

test('탭은 오리지널 시리즈와 영상 둘이고, 오디오북은 오리지널 시리즈 안에 있다', () => {
  assert.deepEqual(seriesLinks('novel').map(link => [link.label, link.href, link.current]), [
    ['오리지널 시리즈', '/#novels', true], ['영상', '/#videos', false],
  ])
  assert.deepEqual(seriesLinks('audio').map(link => [link.label, link.current]), [['오리지널 시리즈', true], ['영상', false]])
  assert.equal(seriesHomeHref('audio'), '/#novels')
  assert.equal(seriesHomeHref('video'), '/#videos')
})

test('형식마다 작품 홈 주소가 따로 있다', () => {
  assert.equal(seriesWorkHref('novel', 'bae-byunghee'), '/novels/bae-byunghee/')
  assert.equal(seriesWorkHref('audio', 'bae-byunghee'), '/audiobooks/bae-byunghee/')
  assert.equal(seriesWorkHref('video', 'bae-byunghee'), '/videos/bae-byunghee/')
})

test('작품 홈의 전환은 소설과 오디오북 두 칸이고, 지금 보는 쪽을 표시한다', () => {
  assert.deepEqual(formatLinks('bae-byunghee', 'novel').map(link => [link.label, link.href, link.icon, link.current]), [
    ['소설', '/novels/bae-byunghee/', 'book', true], ['오디오북', '/audiobooks/bae-byunghee/', 'headphones', false],
  ])
  assert.deepEqual(formatLinks('bae-byunghee', 'audio').map(link => link.current), [false, true])
})
