import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import matter from 'gray-matter'
import { stripIllustrationMarkers } from '@duvridge/content-processing/illustrations/parse-illustration-markers.mjs'
import { parseManuscript } from '../site/.vitepress/shared/episode-heading.mjs'
import {
  clock,
  compact,
  cueIndexAt,
  formatSrt,
  listeningMinutes,
  locateSentences,
  nextCueStart,
  parseSrt,
  previousCueStart,
  spokenTime,
} from '../site/.vitepress/shared/narration-cues.mjs'
import { classifyCues, cueDisplayText, episodeParagraphs, loadNarration } from '../site/.vitepress/shared/narration-catalog.mjs'
import { buildScenes, narrationScripts, splitCaptions } from '../scripts/build-narration-scenes.mjs'
import { alignSentences, findOutro, findSilences } from '../scripts/narration-align.mjs'
import { syncNarration } from '../scripts/sync-narration.mjs'
import { plainText, prepareContent } from '../scripts/prepare-reader-content.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainFilename = 'manuscript.md'
const original = readFileSync(path.join(repo, mainFilename), 'utf8')
const silent = { log() {}, warn() {} }
const work = { title: '내 논을 파는 한이 있어도', subtitle: '배병희 자전소설' }
const sample = {
  id: 'ep01',
  label: '1화',
  title: '어머니의 쇠갈고리',
  time: '1930년대 · 안면도 중장리',
  body: '첫 문장이다. 둘째 문장이다.\n\n셋째 문장이다.',
}
const timing = `${[
  '1\n00:00:00,000 --> 00:00:08,000\n1화\n어머니의 쇠갈고리',
  '2\n00:00:08,000 --> 00:00:13,000\n1화\n어머니의 쇠갈고리\n1930년대 · 안면도 중장리',
  '3\n00:00:13,000 --> 00:00:20,000\n첫 문장이다.',
  '4\n00:00:20,000 --> 00:00:27,500\n둘째\n문장이다.',
  '5\n00:00:27,500 --> 00:00:33,250\n셋째 문장이다.',
  '6\n00:00:33,250 --> 00:00:46,750\n♪',
].join('\n\n')}\n`

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'family-narration-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (filename, body) => {
    mkdirSync(path.dirname(path.join(root, filename)), { recursive: true })
    writeFileSync(path.join(root, filename), body)
  }
  return { root, write }
}


test('자막 시각을 읽고 같은 형식으로 다시 쓴다', () => {
  const source = '1\n00:00:00,000 --> 00:00:08,066\n1화\n어머니의 쇠갈고리\n\n2\n00:01:30,724 --> 00:01:37,296\n물때가 되면 어머니는\n바다로 나섰다.\n'
  const cues = parseSrt(source)
  assert.deepEqual(cues, [
    { start: 0, end: 8.066, text: '1화\n어머니의 쇠갈고리' },
    { start: 90.724, end: 97.296, text: '물때가 되면 어머니는\n바다로 나섰다.' },
  ])
  assert.equal(formatSrt(cues), source)
  assert.deepEqual(parseSrt('﻿1\r\n00:00:01,000 --> 00:00:02,500\r\n가\r\n'), [{ start: 1, end: 2.5, text: '가' }])
  assert.throws(() => parseSrt('1\n00:00:01 --> 00:00:02\n가'), /시각/)
  assert.throws(() => parseSrt('1\n00:00:01,000 --> 00:00:02,000\n'), /비어/)
})

test('줄바꿈과 띄어쓰기가 달라도 원고 문단 순서대로 문장을 찾고, 고친 문장은 건너뛴다', () => {
  assert.equal(compact(' 가 나\n다 '), '가나다')
  assert.deepEqual(
    locateSentences(['첫 문장이다. 둘째 문장이다.', '셋째 문장이다.'], ['첫 문장\n이다.', '둘째  문장이다.', '없는 문장이다.', '셋째 문장이다.']),
    [{ paragraph: 0, start: 0, end: 6 }, { paragraph: 0, start: 6, end: 13 }, null, { paragraph: 1, start: 0, end: 7 }]
  )
  assert.deepEqual(locateSentences(['그랬다. 그랬다.'], ['그랬다.', '그랬다.']), [
    { paragraph: 0, start: 0, end: 4 },
    { paragraph: 0, start: 4, end: 8 },
  ])
})

test('재생 위치로 문장을 찾고 이전·다음 문장으로 옮긴다', () => {
  const cues = [[0, 8, 'title'], [8, 13, 'dateline'], [13, 22], [22, 30], [30, 44, 'music']]
  assert.equal(cueIndexAt(cues, -1), -1)
  assert.equal(cueIndexAt(cues, 0), 0)
  assert.equal(cueIndexAt(cues, 12.99), 1)
  assert.equal(cueIndexAt(cues, 22), 3)
  assert.equal(cueIndexAt(cues, 99), 4)
  // A sentence under way restarts; right after it starts, the previous one plays.
  assert.equal(previousCueStart(cues, 25), 22)
  assert.equal(previousCueStart(cues, 22.5), 13)
  assert.equal(previousCueStart(cues, 3), 0)
  assert.equal(nextCueStart(cues, 14), 22)
  assert.equal(nextCueStart(cues, 31), null)
  assert.equal(clock(241.3), '4:01')
  assert.equal(clock(59.9), '0:59')
  assert.equal(spokenTime(241.3), '4분 1초')
  assert.equal(spokenTime(120), '2분')
  assert.equal(spokenTime(7), '7초')
  assert.equal(listeningMinutes(241.3), 4)
  assert.equal(listeningMinutes(124.6), 2)
  assert.equal(listeningMinutes(20), 1)
})

test('낭독이 쉬는 구간을 찾는다', () => {
  const rate = 1000
  const samples = new Float32Array(3 * rate)
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate
    if (time < 1 || time >= 1.6) samples[index] = 0.3 * Math.sin(2 * Math.PI * 220 * time)
  }
  const silences = findSilences(samples, rate)
  assert.equal(silences.length, 1)
  assert.ok(Math.abs(silences[0].start - 1) < 0.02)
  assert.ok(Math.abs(silences[0].end - 1.6) < 0.02)
  assert.deepEqual(findSilences(samples, rate, { minimum: 0.7 }), [])
})

test('문단 안 문장의 시작은 가장 가까운 긴 쉼 뒤로 옮기고 문단 첫 문장은 그대로 둔다', () => {
  const cues = [
    { start: 0, end: 8, text: '1화\n제목' },
    { start: 8, end: 21.64, text: '첫 문장' },
    { start: 21.64, end: 29.91, text: '둘째 문장' },
    { start: 29.91, end: 36.44, text: '셋째 문장' },
    { start: 36.44, end: 44, text: '새 문단' },
  ]
  const silences = [
    { start: 19.38, end: 19.7 },
    { start: 21.74, end: 21.85 },
    { start: 22, end: 23.05 },
    { start: 29.93, end: 30.05 },
    { start: 30.19, end: 31.19 },
    { start: 35.53, end: 36.43 },
  ]
  const aligned = alignSentences(cues, new Set([2, 3]), silences)
  assert.deepEqual(aligned.map(cue => [cue.start, cue.end]), [[0, 8], [8, 22.93], [22.93, 31.07], [31.07, 36.44], [36.44, 44]])
  assert.equal(cues[2].start, 21.64)
  assert.equal(alignSentences(cues, new Set([2]), [{ start: 26, end: 27 }])[2].start, 21.64)
})

test('마지막 문장 뒤 음악이 시작되기 전의 쉼에서 낭독이 끝난다', () => {
  const cues = [{ start: 214.78, end: 221.77, text: '앞 문장' }, { start: 221.77, end: 241.3, text: '마지막 문장' }]
  assert.equal(findOutro(cues, [{ start: 220.85, end: 221.86 }, { start: 224.2, end: 224.35 }, { start: 227.7, end: 228.5 }]), 227.8)
  assert.equal(findOutro(cues, [{ start: 224.2, end: 224.35 }]), null)
  // 3화: a breath inside the last sentence is shorter than the pause before the music, and the file fades out at the end.
  const third = [{ start: 202.55, end: 208.78, text: '앞 문장' }, { start: 208.78, end: 232.68, text: '마지막 문장' }]
  const pauses = [{ start: 212.77, end: 213.23 }, { start: 214.9, end: 215.25 }, { start: 218.28, end: 219.78 }, { start: 232.1, end: 232.68 }]
  assert.equal(findOutro(third, pauses), 218.38)
})

test('제목과 장면 구분은 낭독 문장을 찾는 문단에서 뺀다', () => {
  assert.deepEqual(episodeParagraphs('# 제목\n\n첫 문단이다.\n\n* * *\n\n둘째 문단이다.\n\n---\n\n### 소제목\n\n셋째 문단이다.'), [
    '첫 문단이다.',
    '둘째 문단이다.',
    '셋째 문단이다.',
  ])
})

test('프롤로그 녹음은 책 표지와 회차 제목, 시대·장소로 시작하고 끝 음악으로 마친다', () => {
  const prolog = { id: 'prolog', label: '프롤로그', title: '벼 한 톨의 무게', time: '1990년대 초 · 독정 정미소', body: '' }
  const texts = ['내 논을 파는 한이 있어도\n배병희 자전소설', '프롤로그\n벼 한 톨의 무게', '프롤로그\n벼 한 톨의 무게\n1990년대 초 · 독정 정미소', '믿었던 상회가 사라졌다.', '♪']
  assert.deepEqual(classifyCues(texts.map(text => ({ text })), prolog, work), ['cover', 'title', 'dateline', null, 'music'])
  assert.throws(() => classifyCues([{ text: '♪' }, { text: '문장' }], prolog, work), /끝 음악/)
})

test('낭독 음성과 문장 시각을 같은 회차 ID로 연결하고, 들리는 그대로의 자막 문장을 함께 싣는다', t => {
  const { root, write } = fixture(t)
  write('site/public/record/ep01.mp3', 'mp3')
  write('content/narration/ep01.srt', timing)
  const { tracks } = loadNarration(root, [sample], { work })
  assert.deepEqual(tracks, {
    ep01: {
      src: '/record/ep01.mp3',
      duration: 46.75,
      cues: [[0, 8, 'title'], [8, 13, 'dateline'], [13, 20], [20, 27.5], [27.5, 33.25], [33.25, 46.75, 'music']],
      texts: ['1화 어머니의 쇠갈고리', '1930년대 · 안면도 중장리', '첫 문장이다.', '둘째 문장이다.', '셋째 문장이다.', ''],
      scenes: [],
    },
  })
  assert.deepEqual(loadNarration(path.join(root, 'missing'), [sample], { work }), { tracks: {} })
})

test('자막 문장은 표지·제목을 한 줄로, 시대·장소 화면은 그 줄만, 끝 음악은 비워 둔다', () => {
  assert.equal(cueDisplayText('내 논을 파는 한이 있어도\n배병희 자전소설', 'cover'), '내 논을 파는 한이 있어도 배병희 자전소설')
  assert.equal(cueDisplayText('3화\n열두 자리 숫자', 'title'), '3화 열두 자리 숫자')
  assert.equal(cueDisplayText('3화\n열두 자리 숫자\n1950년대 · 안면도 중장리', 'dateline'), '1950년대 · 안면도 중장리')
  assert.equal(cueDisplayText('♪', 'music'), '')
  assert.equal(cueDisplayText('징집\n영장을 받았다.', null), '징집 영장을 받았다.')
})

test('장면 정보는 낭독 대본의 그림 순서를 자막 번호로 옮기고, 대본과 자막이 어긋나면 멈춘다', t => {
  assert.deepEqual(splitCaptions('첫 문장이다. “둘째다.” 셋째인가?'), ['첫 문장이다.', '“둘째다.”', '셋째인가?'])
  const script = [
    { kind: 'title', show: '어머니의 쇠갈고리', image: 'ep01-01' },
    { kind: 'dateline', show: '1930년대 · 안면도 중장리', image: 'ep01-01' },
    { kind: 'para', show: '첫 문장이다. 둘째 문장이다.', image: 'ep01-01' },
    { kind: 'break', show: '', image: 'ep01-02' },
    { kind: 'para', show: '셋째 문장이다.', image: 'ep01-02' },
  ]
  const cues = parseSrt(timing)
  assert.deepEqual(buildScenes(script, cues, 'ep01'), [{ cue: 0, image: 'ep01-01' }, { cue: 4, image: 'ep01-02' }])
  assert.throws(() => buildScenes(script.slice(0, -1), cues, 'ep01'), /맞지 않습니다/)
  // Prose before the first illustration marker carries no image; the opening painting stays on screen.
  const late = script.map((line, index) => (index === 2 ? { ...line, image: null } : line))
  assert.deepEqual(buildScenes(late, cues, 'ep01'), [{ cue: 0, image: 'ep01-01' }, { cue: 4, image: 'ep01-02' }])
  assert.throws(() => buildScenes([...script.slice(0, -1), { kind: 'para', show: '다른 문장이다.', image: 'ep01-02' }], cues, 'ep01'), /다릅니다/)
  const { root, write } = fixture(t)
  write('site/public/record/ep01.mp3', 'mp3')
  write('content/narration/ep01.srt', timing)
  write('content/narration/ep01.scenes.json', JSON.stringify({ version: 1, scenes: [{ cue: 0, image: 'ep01-01' }, { cue: 4, image: 'ep01-02' }] }))
  assert.deepEqual(loadNarration(root, [sample], { work }).tracks.ep01.scenes, [[0, 'ep01-01'], [4, 'ep01-02']])
  write('content/narration/ep01.scenes.json', JSON.stringify({ version: 1, scenes: [{ cue: 4, image: 'ep01-02' }, { cue: 2, image: 'ep01-01' }] }))
  assert.throws(() => loadNarration(root, [sample], { work }), /장면 정보가 잘못되었습니다/)
})

test('짝이 없거나 원고에 없는 낭독 파일, 비었거나 겹친 시각을 준비 단계에서 거절한다', t => {
  const { root, write } = fixture(t)
  const load = () => loadNarration(root, [sample], { work })
  write('content/narration/ep01.srt', timing)
  assert.throws(load, /낭독 음성이 없습니다/)
  write('site/public/record/ep01.mp3', 'mp3')
  write('site/public/record/ep02.mp3', 'mp3')
  assert.throws(load, /문장 시각 파일이 없습니다/)
  rmSync(path.join(root, 'site/public/record/ep02.mp3'))
  write('site/public/record/ep09.mp3', 'mp3')
  write('content/narration/ep09.srt', timing)
  assert.throws(load, /원고에 없습니다/)
  rmSync(path.join(root, 'site/public/record/ep09.mp3'))
  rmSync(path.join(root, 'content/narration/ep09.srt'))
  write('content/narration/ep01.srt', timing.replace('00:00:20,000 --> 00:00:27,500', '00:00:19,000 --> 00:00:27,500'))
  assert.throws(load, /겹칩니다/)
  write('content/narration/ep01.srt', timing)
  write('site/public/record/ep01.mp3', '')
  assert.throws(load, /비어 있습니다/)
})

test('원고를 고쳐도 기존 재생 자료와 자막 문장을 그대로 쓴다', t => {
  const { root, write } = fixture(t)
  write('site/public/record/ep01.mp3', 'mp3')
  write('content/narration/ep01.srt', timing)
  const original = loadNarration(root, [sample], { work }).tracks.ep01
  const edited = { ...sample, title: '새 제목', body: '전혀 다른 원고다.' }
  assert.deepEqual(loadNarration(root, [edited], { work }).tracks.ep01, original)
})

test('오디오북 결과물에서 음성을 옮기고 문장 시각을 실제 쉼에 맞춘다', t => {
  const { root, write } = fixture(t)
  // Alignment needs three sentences in one paragraph. Use a dedicated import
  // fixture so rewriting the author's opening cannot change that test scenario.
  const opening = '첫 문장이다. 둘째 문장이다. 셋째 문장이다.'
  write(mainFilename, `---\ntitle: ${work.title}\nsubtitle: ${work.subtitle}\n---\n\n# 1936. 안면도 중장리\n\n## ${sample.title} {#ep01}\n\n*${sample.time}*\n\n${opening}\n`)
  const source = path.join(root, 'audiobook')
  const [first, second, third] = opening.match(/[^.]+\./g).map(sentence => sentence.trim())
  write('audiobook/ep01.mp3', 'recorded-mp3')
  write('audiobook/ep01.srt', formatSrt([
    { start: 0, end: 4, text: '1화\n어머니의 쇠갈고리' },
    { start: 4, end: 6, text: '1화\n어머니의 쇠갈고리\n1930년대 · 안면도 중장리' },
    { start: 6, end: 11, text: first },
    { start: 11, end: 16, text: second },
    { start: 16, end: 30, text: third },
  ]))
  const rate = 16000
  const pauses = [[11.5, 12.4], [16.6, 17.4], [21, 21.8]]
  const samples = new Float32Array(30 * rate)
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate
    if (!pauses.some(([from, to]) => time >= from && time < to)) samples[index] = 0.2 * Math.sin(2 * Math.PI * 180 * time)
  }
  syncNarration({ root, from: source, ids: ['ep01'], decodeAudio: () => samples, logger: silent })
  assert.equal(readFileSync(path.join(root, 'site/public/record/ep01.mp3'), 'utf8'), 'recorded-mp3')
  const cues = parseSrt(readFileSync(path.join(root, 'content/narration/ep01.srt'), 'utf8'))
  assert.deepEqual(cues.map(cue => [cue.start, cue.end]), [[0, 4], [4, 6], [6, 12.28], [12.28, 17.28], [17.28, 21.1], [21.1, 30]])
  assert.equal(cues.at(-1).text, '♪')
  write('audiobook/ep01.srt', formatSrt([{ start: 0, end: 4, text: '1화\n어머니의 쇠갈고리' }, { start: 4, end: 30, text: '원고에 없는 문장이다.' }]))
  assert.throws(() => syncNarration({ root, from: source, ids: ['ep01'], decodeAudio: () => samples, logger: silent }), /원고에서 찾지 못한 문장/)
  assert.throws(() => syncNarration({ root, from: source, ids: ['ep99'], decodeAudio: () => samples, logger: silent }), /원고에 없는 회차/)
})

test('콘텐츠를 준비하면 낭독 회차를 목록에 넣고 본문은 따로 감싸지 않는다', t => {
  const { root, write } = fixture(t)
  write(mainFilename, stripIllustrationMarkers(original))
  write('site/public/record/prolog.mp3', readFileSync(path.join(repo, 'site/public/record/prolog.mp3')))
  write('content/narration/prolog.srt', readFileSync(path.join(repo, 'content/narration/prolog.srt'), 'utf8'))
  const { catalog, warnings } = prepareContent({ root, logger: silent })
  assert.deepEqual(Object.keys(catalog.narration), ['prolog'])
  assert.equal(catalog.narration.prolog.texts.length, catalog.narration.prolog.cues.length)
  assert.deepEqual(warnings, [])
  assert.equal(existsSync(path.join(root, 'site/.vitepress/generated/narration.json')), false)
  assert.equal(matter(readFileSync(path.join(root, 'site/bae-byunghee/prolog.md'), 'utf8')).data.narration, undefined)
})

test('모든 회차의 낭독 음성과 문장 시각, 장면이 같은 회차 ID로 연결된다', () => {
  const main = matter(original)
  const { episodes } = parseManuscript(main.content)
  const { tracks } = loadNarration(repo, episodes, { work })
  const manifest = JSON.parse(readFileSync(path.join(repo, '../../content/books/bae-byunghee/illustrations/manifest.json'), 'utf8'))
  const known = new Set(['cover', ...manifest.images.map(image => image.id)])
  assert.deepEqual(Object.keys(tracks), episodes.map(episode => episode.id))
  for (const [id, track] of Object.entries(tracks)) {
    assert.equal(track.src, `/record/${id}.mp3`)
    assert.ok(existsSync(path.join(repo, 'site/public', track.src)))
    assert.equal(track.cues.at(-1)[2], 'music')
    assert.equal(track.duration, track.cues.at(-1)[1])
    assert.equal(track.texts.length, track.cues.length)
    assert.equal(track.texts.at(-1), '')
    assert.equal(track.scenes[0][0], 0)
    for (const [, image] of track.scenes) assert.ok(known.has(image), `${id}: ${image}`)
    // The committed scenes are what the narration script gives today.
    const script = JSON.parse(readFileSync(path.join(repo, narrationScripts, `${id}.json`), 'utf8'))
    const cues = parseSrt(readFileSync(path.join(repo, `content/narration/${id}.srt`), 'utf8'))
    assert.deepEqual(buildScenes(script, cues, id).map(scene => [scene.cue, scene.image]), track.scenes)
  }
  assert.deepEqual(tracks.prolog.cues.slice(0, 3).map(cue => cue[2]), ['cover', 'title', 'dateline'])
  assert.deepEqual(tracks.ep01.cues.slice(0, 2).map(cue => cue[2]), ['title', 'dateline'])
  assert.deepEqual(tracks.prolog.scenes.map(scene => scene[1]), ['cover', 'prolog-01'])
})
