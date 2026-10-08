import assert from 'node:assert/strict'
import test from 'node:test'
import { listenState, minutesLeft, playerTarget, resumeStart } from '../site/.vitepress/shared/playback-selection.mjs'

const readingOrder = ['prolog', 'ep01', 'ep02', 'ep03', 'ep04'].map(id => ({ id }))
const track = duration => ({ src: '', duration, cues: [[0, 5, 'title'], [5, 20], [20, duration - 10], [duration - 10, duration, 'music']] })
const narration = { prolog: track(115), ep01: track(220), ep02: track(170), ep03: track(213) }
const base = { readingOrder, narration, page: '', session: null, saved: null, completed: [] }

test('듣고 있는 회차가 있으면 아래 막대는 어느 화면에서나 그 회차를 보여 준다', () => {
  assert.deepEqual(playerTarget({ ...base, page: 'ep03', session: { id: 'ep01', playing: true, failed: false } }), { id: 'ep01', mode: 'playing' })
  assert.deepEqual(playerTarget({ ...base, session: { id: 'ep01', playing: false, failed: false } }), { id: 'ep01', mode: 'paused' })
  assert.deepEqual(playerTarget({ ...base, session: { id: 'ep01', playing: false, failed: true } }), { id: 'ep01', mode: 'error' })
})

test('회차 화면에서는 그 회차를 듣기·이어 듣기·다시 듣기·준비 중으로 보여 준다', () => {
  assert.deepEqual(playerTarget({ ...base, page: 'ep02' }), { id: 'ep02', mode: 'idle' })
  assert.deepEqual(playerTarget({ ...base, page: 'ep02', saved: { id: 'ep02', time: 82 } }), { id: 'ep02', mode: 'resume', time: 82 })
  assert.deepEqual(playerTarget({ ...base, page: 'ep02', saved: { id: 'ep01', time: 82 } }), { id: 'ep02', mode: 'idle' })
  assert.deepEqual(playerTarget({ ...base, page: 'ep02', completed: ['ep02'] }), { id: 'ep02', mode: 'replay' })
  assert.deepEqual(playerTarget({ ...base, page: 'ep04' }), { id: 'ep04', mode: 'unavailable' })
})

test('홈에서는 이어 들을 회차, 없으면 아직 안 들은 첫 회차를 보여 준다', () => {
  assert.deepEqual(playerTarget(base), { id: 'prolog', mode: 'idle' })
  assert.deepEqual(playerTarget({ ...base, saved: { id: 'ep01', time: 82 } }), { id: 'ep01', mode: 'resume', time: 82 })
  assert.deepEqual(playerTarget({ ...base, completed: ['prolog', 'ep01'] }), { id: 'ep02', mode: 'idle' })
  assert.deepEqual(playerTarget({ ...base, completed: ['prolog', 'ep01', 'ep02', 'ep03'] }), { id: 'prolog', mode: 'replay' })
  assert.deepEqual(playerTarget({ ...base, saved: { id: 'gone', time: 3 } }), { id: 'prolog', mode: 'idle' })
  assert.equal(playerTarget({ ...base, narration: {} }), null)
})

test('홈은 마지막으로 다 들은 회차의 다음 화를 먼저 권하고, 건너뛴 회차는 그 뒤에 권한다', () => {
  assert.deepEqual(playerTarget({ ...base, completed: ['ep01'] }), { id: 'ep02', mode: 'idle' })
  assert.deepEqual(playerTarget({ ...base, completed: ['ep02', 'ep01'] }), { id: 'ep03', mode: 'idle' })
  assert.deepEqual(playerTarget({ ...base, completed: ['ep01', 'ep02', 'ep03'] }), { id: 'prolog', mode: 'idle' })
  assert.deepEqual(playerTarget({ ...base, completed: ['ep09'] }), { id: 'prolog', mode: 'idle' })
})

test('이어 들을 때는 멈춘 문장의 처음부터, 남은 시간은 분 단위로 올려 센다', () => {
  assert.equal(resumeStart(narration.ep01.cues, 12), 5)
  assert.equal(resumeStart(narration.ep01.cues, 0), 0)
  assert.equal(resumeStart(narration.ep01.cues, 999), 210)
  assert.equal(minutesLeft(220, 82), 3)
  assert.equal(minutesLeft(220, 219.5), 1)
  assert.equal(minutesLeft(220, 300), 1)
})

test('목차는 회차마다 재생 중·남은 시간·재생 완료·준비 중을 알려 준다', () => {
  const state = { narration, session: { id: 'ep01', playing: true, time: 30 }, saved: { id: 'ep01', time: 82 }, completed: ['prolog'] }
  assert.deepEqual(listenState('ep01', state), { kind: 'playing' })
  assert.deepEqual(listenState('ep01', { ...state, session: { id: 'ep01', playing: false, time: 30 } }), { kind: 'progress', minutes: 4 })
  assert.deepEqual(listenState('ep01', { ...state, session: null }), { kind: 'progress', minutes: 3 })
  assert.deepEqual(listenState('prolog', state), { kind: 'done', minutes: 2 })
  assert.deepEqual(listenState('ep02', state), { kind: 'ready', minutes: 3 })
  assert.deepEqual(listenState('ep04', state), { kind: 'unavailable' })
})
