import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

/** Artwork is separate from the canonical manuscript; stale placements fail the build. */
export function loadEpisodeIllustrations(root, episodes) {
  const filename = path.join(root, 'content/episode-illustrations.json')
  if (!existsSync(filename)) return {}
  const manifest = JSON.parse(readFileSync(filename, 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.images))
    throw new Error('회차 삽화 목록의 형식을 확인하세요.')
  const byEpisode = Object.fromEntries(episodes.map(e => [e.id, e]))
  const seen = new Set()
  const images = {}
  for (const image of manifest.images) {
    const episode = byEpisode[image.episodeId]
    if (!episode || !/^[a-z0-9][a-z0-9-]*$/.test(image.id) || seen.has(image.id))
      throw new Error(`삽화의 회차 또는 ID가 잘못되었습니다: ${image.id}`)
    const expectedId = `${episode.id}-${String((images[episode.id]?.length ?? 0) + 1).padStart(2, '0')}`
    if (image.id !== expectedId) throw new Error(`삽화 ID는 회차 ID와 장 번호를 사용하세요: ${image.id} → ${expectedId}`)
    seen.add(image.id)
    if (!image.alt?.trim() || image.width !== 1280 || image.height !== 720)
      throw new Error(`삽화 설명 또는 16:9 크기를 확인하세요: ${image.id}`)
    const position = image.position
    if (position?.start === true) {
      if (position.beforeParagraph || image.id !== `${episode.id}-01` || images[episode.id]?.some(i => i.position.start))
        throw new Error(`회차 첫 삽화가 중복되었습니다: ${image.id}`)
    } else {
      const paragraphs = episode.body.split(/\n\s*\n/)
      if (typeof position?.beforeParagraph !== 'string' || paragraphs.filter(p => p === position.beforeParagraph).length !== 1)
        throw new Error(`삽화 위치의 원문 문단을 찾을 수 없습니다: ${image.id}`)
    }
    const publicRoot = realpathSync(path.join(root, 'site/public'))
    for (const [format, sources] of [['jpg', image.sources], ...(image.webpSources ? [['webp', image.webpSources]] : [])]) {
      if (!Array.isArray(sources) || sources.length !== 3 || sources.map(s => s.width).join(',') !== '360,720,1280')
        throw new Error(`삽화의 모바일·고해상도 파일을 확인하세요: ${image.id}`)
      for (const source of sources) {
        if (source.src !== `/images/episodes/${image.id}-${source.width}.${format}`)
          throw new Error(`안전하지 않은 삽화 파일 경로: ${image.id}`)
        const asset = path.join(publicRoot, source.src)
        if (!existsSync(asset) || !realpathSync(asset).startsWith(`${publicRoot}${path.sep}`))
          throw new Error(`삽화 파일이 없습니다: ${source.src}`)
      }
    }
    ;(images[episode.id] ??= []).push(image)
  }
  for (const episode of episodes) {
    if (!images[episode.id]?.some(i => i.position.start))
      throw new Error(`회차의 대표 삽화가 없습니다: ${episode.id}`)
  }
  return images
}
