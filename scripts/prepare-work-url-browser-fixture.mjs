import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const root = process.cwd()
const sources = '.deploy/work-url-books'
rmSync(sources, { recursive: true, force: true })
cpSync('content/books', sources, { recursive: true })
const first = JSON.parse(readFileSync('content/books/bae-byunghee/book.json', 'utf8'))
const sample = path.join(sources, 'url-rehearsal')
mkdirSync(sample, { recursive: true })
writeFileSync(path.join(sample, 'book.json'), JSON.stringify({ id: 'url-rehearsal', work: { title: '주소 검증 작품', subtitle: '로컬 테스트' }, cover: first.cover, sharing: { ...first.sharing, description: '작품 구분을 확인하는 로컬 테스트입니다.' } }))
writeFileSync(path.join(sample, 'manuscript.md'), '---\ntitle: 주소 검증 작품\nsubtitle: 로컬 테스트\n---\n# 2000. 시험 마을\n\n## 첫 이야기 {#ep01}\n\n*2000년, 시험 마을*\n\n두 번째 작품의 첫 회차 본문입니다.\n\n## 둘째 이야기 {#ep02}\n\n*2001년, 시험 마을*\n\n두 번째 작품의 둘째 회차 본문입니다.\n')
cpSync('content/books/bae-byunghee/public', path.join(sample, 'public'), { recursive: true })
mkdirSync(path.join(sample, 'narration/timings'), { recursive: true })
mkdirSync(path.join(sample, 'narration/record'), { recursive: true })
cpSync('apps/toldlife-audiobooks/site/public/record/prolog.mp3', path.join(sample, 'narration/record/ep01.mp3'))
writeFileSync(path.join(sample, 'narration/timings/ep01.srt'), '1\n00:00:00,000 --> 00:00:02,000\n1화\n첫 이야기\n\n2\n00:00:02,000 --> 00:00:04,000\n두 번째 작품의 첫 회차 본문입니다.\n')
// Its video: the same sentences at the video's pace, listed like a published one (the file itself is not needed here).
mkdirSync(path.join(sample, 'video/timings'), { recursive: true })
writeFileSync(path.join(sample, 'video/timings/ep01.srt'), '1\n00:00:00,000 --> 00:00:02,200\n1화\n첫 이야기\n\n2\n00:00:02,200 --> 00:00:04,400\n두 번째 작품의 첫 회차 본문입니다.\n')
writeFileSync(path.join(sample, 'video/media.json'), JSON.stringify({ version: 1, videos: { ep01: { file: 'ep01.0000000000.mp4', bytes: 1, sha256: '0'.repeat(64), duration: 4.4 } } }))
const env = { ...process.env, TOLDLIFE_BOOK_CATALOG: sources, VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_AUTH_DOMAIN: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '' }
for (const series of ['novels', 'audiobooks', 'videos']) execFileSync('npm', ['run', 'build', '--workspace', `@duvridge/toldlife-${series}`], { cwd: root, env: { ...env, SITE_BASE: `/${series}/`, SITE_OUT_DIR: path.resolve(`.deploy/work-url-readers/${series}/site/.vitepress/dist`) }, stdio: 'inherit' })
execFileSync('python3', ['scripts/assemble-toldlife-pages.py', '--skip-build', '--output', '.deploy/work-url-fixture', '--novels-source', '.deploy/work-url-readers/novels', '--audiobooks-source', '.deploy/work-url-readers/audiobooks', '--videos-source', '.deploy/work-url-readers/videos'], { cwd: root, stdio: 'inherit' })
