import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { computed } from 'vue'
import { listenAction, lyricLines, nextSleepChoice, proseCueTexts, resumeStart, sceneAt, sceneStarts, sleepLabel } from '../site/.vitepress/shared/playback-selection.mjs'

const readingOrder = ['prolog', 'ep01', 'ep02', 'ep03', 'ep04'].map(id => ({ id }))
const track = duration => ({ src: '', duration, cues: [[0, 5, 'title'], [5, 20], [20, duration - 10], [duration - 10, duration, 'music']] })
const narration = { prolog: track(115), ep01: track(220), ep02: track(170), ep03: track(213) }
const base = { readingOrder, narration, saved: null, completed: [] }

function componentDeclaration(filename, name) {
  const component = readFileSync(new URL(`../site/.vitepress/theme/${filename}`, import.meta.url), 'utf8')
  const script = component.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1]
  const source = ts.createSourceFile(filename, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declaration = source.statements.find(statement => statement.name?.text === name
    || statement.declarationList?.declarations.some(entry => entry.name.getText(source) === name))
  assert.ok(declaration, `${filename}: ${name}`)
  return ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
}

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

test('작품 홈 버튼은 상태별 회차 문구를 화면과 접근 가능한 이름에 함께 쓴다', () => {
  const evaluate = new Function('computed', 'listenAction', 'catalog', 'position', 'completed', 'verb',
    `${componentDeclaration('AudiobookReaderLayout.vue', 'action')}\nreturn action.value`)
  const catalog = { readingOrder: readingOrder.map((entry, index) => ({ ...entry, label: index ? `${index}화` : '프롤로그' })), narration }
  const label = (saved, completed = [], tracks = narration) => evaluate(computed, listenAction,
    { ...catalog, narration: tracks }, { value: saved }, { value: completed }, { value: '듣기' }).label
  assert.equal(label(null), '처음부터 듣기')
  assert.equal(label({ id: 'ep01', time: 82 }), '1화 이어 듣기')
  assert.equal(label({ id: 'prolog', time: 8 }), '프롤로그 이어 듣기')
  assert.equal(label(null, ['prolog', 'ep01']), '2화 듣기')
  assert.equal(label(null, ['prolog', 'ep01', 'ep02', 'ep03']), '처음부터 다시 듣기')
  assert.equal(label(null, [], {}), '준비 중')
  const layout = readFileSync(new URL('../site/.vitepress/theme/AudiobookReaderLayout.vue', import.meta.url), 'utf8')
  assert.match(layout, /:action="\{ label: action\.label, ariaLabel: action\.label,/)
})

test('낭독 목록은 첫 문장을 마스크 아래에 두고 주변 문장 대비를 높이며 종료 화면을 유지한다', () => {
  const css = readFileSync(new URL('../site/.vitepress/theme/audiobook-reader.css', import.meta.url), 'utf8')
  const rule = selector => {
    const body = css.split(`${selector} {`)[1]?.split('}')[0]
    assert.ok(body, selector)
    return Object.fromEntries(body.split(';').filter(value => value.trim()).map(value => value.trim().split(/:\s*/, 2)))
  }
  assert.equal(rule('.lyrics:not(.is-closing)')['padding-top'], '1.75rem')
  assert.equal(rule('.lyric-line').color, '#8e929c')
  const mask = 'linear-gradient(to bottom, transparent 0, #000000 20px, #000000 calc(100% - 44px), transparent 100%)'
  assert.equal(rule('.lyrics')['mask-image'], mask)
  assert.equal(rule('.lyrics')['-webkit-mask-image'], mask)
  assert.equal(rule('.lyrics.is-closing .lyric-line').color, 'var(--gray-dim)')
  assert.equal(rule('.lyrics.is-closing')['padding-top'], undefined)
  assert.equal(rule('.lyrics.is-closing')['mask-image'], 'linear-gradient(to bottom, transparent 0, #000000 64px)')
})

test('자동 따라가기는 여백을 포함한 문장을 위에서 1/3 지점에 두고 첫 문장은 맨 위에 둔다', () => {
  const calls = []
  const line = { offsetTop: 28 }
  const box = { clientHeight: 360, querySelector: () => line, scrollTo: options => calls.push(options) }
  const follow = new Function('lyrics', 'touchedAt',
    `${componentDeclaration('components/AudiobookPlayer.vue', 'follow')}\nreturn follow`)({ value: box }, 0)
  follow(false)
  assert.equal(calls[0].top, 0)
  assert.equal(calls[0].behavior, 'instant')
  line.offsetTop = 428
  follow(true)
  assert.equal(line.offsetTop - calls[1].top, box.clientHeight / 3)
  assert.equal(calls[1].behavior, 'smooth')
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

test('제목·배경 안내는 본문 목록에 중복하지 않으며 문장 클릭과 재생 시각의 인덱스를 보존한다', () => {
  const cues = [[0, 2, 'cover'], [2, 4, 'title'], [4, 6, 'dateline'], [6, 9], [9, 12], [12, 18, 'music']]
  const source = ['작품', '회차', '어느 날 · 마을', '첫 문장.', '둘째 문장.', '']
  const texts = proseCueTexts(source, cues)
  assert.deepEqual(texts, ['', '', '', '첫 문장.', '둘째 문장.', ''])
  assert.deepEqual(source, ['작품', '회차', '어느 날 · 마을', '첫 문장.', '둘째 문장.', ''])
  assert.equal(lyricLines(texts, 3).current, 3)
  assert.equal(lyricLines(texts, 5).current, 4)
  assert.equal(cues[texts.findIndex(text => text === '둘째 문장.')][0], 9)
  assert.deepEqual(proseCueTexts(['도입 없이 시작.'], [[0, 4]]), ['도입 없이 시작.'])
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
