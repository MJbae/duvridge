import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { reservedWorkIds } from '../catalog/prepare-reader-content.mjs'

/** Discover editorial works once; every reader and the portal consume this same catalog. */
export function listBookSources(repositoryRoot, { directory = 'content/books', ids } = {}) {
  const folder = path.resolve(repositoryRoot, directory)
  const relative = path.relative(repositoryRoot, folder)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('책 원본은 저장소 안에 두세요.')
  const works = readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
    const source = path.join(folder, entry.name)
    const book = JSON.parse(readFileSync(path.join(source, 'book.json'), 'utf8'))
    if (book.id !== entry.name || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(book.id) || reservedWorkIds.has(book.id)) throw new Error(`안전하지 않거나 예약된 작품 id: ${book.id}`)
    const manuscript = book.manuscript ?? 'manuscript.md'
    if (!/^[^/\\]+\.md$/u.test(manuscript) || manuscript.startsWith('.')) throw new Error('원고는 책 원본 폴더의 Markdown 파일이어야 합니다.')
    const { data } = matter(readFileSync(path.join(source, manuscript), 'utf8'))
    book.work = { ...book.work, ...Object.fromEntries(['title', 'subtitle'].filter(key => data[key] !== undefined).map(key => [key, data[key]])) }
    return { source, book }
  })
  if (works.filter(({ book }) => book.legacy?.servedAtRoot).length > 1) throw new Error('옛 형식 첫 주소를 사용할 작품은 하나만 등록하세요.')
  if (ids && ids.some(id => !works.some(({ book }) => book.id === id))) throw new Error('등록한 작품 원본이 없습니다.')
  return ids ? works.filter(({ book }) => ids.includes(book.id)) : works
}
