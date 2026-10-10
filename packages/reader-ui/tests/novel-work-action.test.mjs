import assert from 'node:assert/strict'
import test from 'node:test'
import { novelWorkAction } from '../src/series/novel-work-action.mjs'

const order = [
  { id: 'prolog', label: '프롤로그', url: '/prolog' },
  { id: 'ep01', label: '1화', url: '/ep01' },
  { id: 'ep02', label: '2화', url: '/ep02' },
  { id: 'ep03', label: '3화', url: '/ep03' },
]

test('처음 읽거나 저장된 회차가 없으면 첫 회차부터 읽는다', () => {
  for (const saved of [null, { id: 'removed' }]) {
    assert.deepEqual(novelWorkAction(order, saved), {
      label: '처음부터 읽기', episode: order[0], resume: false, current: false,
    })
  }
})

test('읽던 번호 회차와 이름 붙은 회차는 해당 회차를 이어 읽는다', () => {
  for (const episode of [order[0], order[3]]) {
    assert.deepEqual(novelWorkAction(order, { id: episode.id, finished: false }), {
      label: `${episode.label} 이어 읽기`, episode, resume: true, current: true,
    })
  }
})

test('완독한 회차 다음으로 이동하며 문구에 다음 회차 라벨을 넣는다', () => {
  assert.deepEqual(novelWorkAction(order, { id: 'ep02', finished: true }, ['prolog', 'ep01', 'ep02']), {
    label: '3화 읽기', episode: order[3], resume: false, current: true,
  })
})

test('전체 완독은 첫 회차로 돌아가고 이어 읽기 표시를 해제한다', () => {
  assert.deepEqual(novelWorkAction(order, { id: 'ep03', finished: true }, order.map(entry => entry.id)), {
    label: '처음부터 다시 읽기', episode: order[0], resume: false, current: false,
  })
})

test('마지막 회차 이후에는 기존처럼 앞의 미완독 회차를 찾아 읽는다', () => {
  assert.deepEqual(novelWorkAction(order, { id: 'ep03', finished: true }, ['ep01', 'ep02', 'ep03']), {
    label: '프롤로그 읽기', episode: order[0], resume: false, current: true,
  })
})

test('저장된 finished 값이 없으면 완독 목록을 쓰고 명시된 false는 이어 읽기를 유지한다', () => {
  assert.equal(novelWorkAction(order, { id: 'ep02' }, ['ep02']).label, '3화 읽기')
  assert.deepEqual(novelWorkAction(order, { id: 'ep02', finished: false }, ['ep02']), {
    label: '2화 이어 읽기', episode: order[2], resume: true, current: true,
  })
})

test('완독한 다음 회차가 있어도 기존 순서대로 그 회차를 연다', () => {
  const action = novelWorkAction(order, { id: 'ep02', finished: true }, ['ep02', 'ep03'])
  assert.equal(action.episode, order[3])
  assert.equal(action.label, '3화 읽기')
})
