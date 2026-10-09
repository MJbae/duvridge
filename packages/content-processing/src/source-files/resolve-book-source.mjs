import { readFileSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

/** Resolve an app's declared editorial source; package code never embeds a particular book. */
export function resolveBookSource({ repositoryRoot, appRoot, registryFile = 'service-registry.json' }) {
  const root = path.resolve(repositoryRoot)
  const registry = JSON.parse(readFileSync(path.join(root, registryFile), 'utf8'))
  const appPath = path.relative(root, path.resolve(appRoot)).split(path.sep).join('/')
  const service = registry.services.find(service => service.path === appPath)
  const binding = registry.books?.[service?.book]
  if (!binding?.path) throw new Error(`앱에 연결된 책 원본을 등록하세요: ${appPath}`)
  const source = path.resolve(root, binding.path)
  const relative = path.relative(root, source)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('책 원본은 저장소 안에 두세요.')
  const book = JSON.parse(readFileSync(path.join(source, 'book.json'), 'utf8'))
  if (book.id !== service.book) throw new Error(`책 원본 ID와 서비스 연결이 다릅니다: ${service.book}`)
  const manuscript = book.manuscript ?? 'manuscript.md'
  if (typeof manuscript !== 'string' || !/^[^/\\]+\.md$/u.test(manuscript) || manuscript.startsWith('.'))
    throw new Error('원고는 책 원본 폴더의 Markdown 파일이어야 합니다.')
  const { data } = matter(readFileSync(path.join(source, manuscript), 'utf8'))
  // The editorial document owns its title; asset builders use the same effective values as the reader.
  book.work = { ...book.work, ...Object.fromEntries(['title', 'subtitle'].filter(key => data[key] !== undefined).map(key => [key, data[key]])) }
  return { source, book }
}
