import assert from 'node:assert/strict'
import test from 'node:test'
import { listenAction, lyricLines, nextSleepChoice, resumeStart, sceneAt, sceneStarts, sleepLabel } from '../site/.vitepress/shared/playback-selection.mjs'

const readingOrder = ['prolog', 'ep01', 'ep02', 'ep03', 'ep04'].map(id => ({ id }))
const track = duration => ({ src: '', duration, cues: [[0, 5, 'title'], [5, 20], [20, duration - 10], [duration - 10, duration, 'music']] })
const narration = { prolog: track(115), ep01: track(220), ep02: track(170), ep03: track(213) }
const base = { readingOrder, narration, saved: null, completed: [] }

test('작품 홈 버튼은 이어 들을 회차, 다음에 들을 회차, 처음 회차 순으로 정한다', () => {
  assert.deepEqual(listenAction(base), { id: 'prolog', kind: 'start' })
  assert.deepEqual(listenAction({ ...base, saved: { id: 'ep01', time: 82 } }), { id: 'ep01', kind: 'resume' })
  assert.deepEqual(listenAction({ ...base, completed: ['prolog', 'ep01'] }), { id: 'ep02', kind: 'next' })
  assert.deepEqual(listenAction({ ...base, completed: ['ep01'] }), { id: 'ep02', kind: 'next' })
  assert.deepEqual(listenAction({ ...base, completed: ['ep02', 'ep01'] }), { id: 'ep03', kind: 'next' })
  assert.deepEqual(listenAction({ ...base, completed: ['prolog', 'ep01', 'ep02', 'ep03'] }), { id: 'prolog', kind: 'again' })
  assert.deepEqual(listenAction({ ...base, saved: { id: 'gone', time: 3 } }), { id: 'prolog', kind: 'start' })
  // 소설로만 읽은 회차는 들은 회차가 아니다.
  assert.deepEqual(listenAction({ ...base, completed: ['ep09'] }), { id: 'prolog', kind: 'start' })
  assert.equal(listenAction({ ...base, narration: {} }), null)
})

test('이어 들을 때는 멈춘 문장의 처음부터 시작한다', () => {
  assert.equal(resumeStart(narration.ep01.cues, 12), 5)
  assert.equal(resumeStart(narration.ep01.cues, 0), 0)
  assert.equal(resumeStart(narration.ep01.cues, 999), 210)
})

test('타이머는 끔 → 15분 → 30분 → 회차 끝 → 끔으로 바뀐다', () => {
  assert.deepEqual([0, 15, 30, -1].map(nextSleepChoice), [15, 30, -1, 0])
  assert.deepEqual([0, 15, 30, -1].map(sleepLabel), ['타이머', '15분', '30분', '회차 끝'])
})

test('낭독 문장은 앞뒤 문장과 함께 보이고, 끝 음악에서는 마지막 문장이 남는다', () => {
  const texts = ['3화 열두 자리 숫자', '1950년대 · 안면도 중장리', '첫 문장.', '둘째 문장.', '']
  assert.deepEqual(lyricLines(texts, -1), { previous: -1, current: 0, next: 1 })
  assert.deepEqual(lyricLines(texts, 2), { previous: 1, current: 2, next: 3 })
  assert.deepEqual(lyricLines(texts, 4), { previous: 2, current: 3, next: -1 })
})

test('장면은 시작한 마지막 그림을 보여 주고, 목록은 장면이 시작하는 시각을 안다', () => {
  const scenes = [[0, 'ep03-01'], [12, 'ep03-02']]
  assert.equal(sceneAt(scenes, -1), 'ep03-01')
  assert.equal(sceneAt(scenes, 11), 'ep03-01')
  assert.equal(sceneAt(scenes, 12), 'ep03-02')
  assert.equal(sceneAt([], 3), undefined)
  const cues = Array.from({ length: 14 }, (_, index) => [index * 5, index * 5 + 5])
  assert.deepEqual(sceneStarts(scenes, cues), [{ image: 'ep03-01', start: 0 }, { image: 'ep03-02', start: 60 }])
})
