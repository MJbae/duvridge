import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

import { parseIllustrationMarkers } from './parse-illustration-markers.mjs'
export { illustrationMarkerId, parseIllustrationMarkers, stripIllustrationMarkers } from './parse-illustration-markers.mjs'

/** The manifest owns assets; the manuscript alone owns their stable insertion anchors. */
export function loadEpisodeIllustrations(root, episodes) {
  const filename = path.join(root, 'content/episode-illustrations.json')
  if (!existsSync(filename)) {
    const marker = episodes.flatMap(episode => parseIllustrationMarkers(episode.body))[0]
    if (marker) throw new Error(`삽화 표시의 자산 목록이 없습니다: ${marker.id}`)
    return {}
  }
  const manifest = JSON.parse(readFileSync(filename, 'utf8'))
  if (manifest.version !== 2 || !Array.isArray(manifest.images))
    throw new Error('회차 삽화 목록은 위치 정보 없는 version: 2 형식을 사용하세요.')
  const explicitRepresentatives = manifest.images.some(image => Object.hasOwn(image, 'representative'))
  const byEpisode = Object.fromEntries(episodes.map(episode => [episode.id, episode]))
  const byId = new Map()
  const images = {}
  for (const image of manifest.images) {
    const episode = byEpisode[image.episodeId]
    if (!episode || !/^[a-z0-9][a-z0-9-]*$/.test(image.id) || byId.has(image.id))
      throw new Error(`삽화의 회차 또는 ID가 잘못되었습니다: ${image.id}`)
    if (Object.hasOwn(image, 'representative') && typeof image.representative !== 'boolean')
      throw new Error(`대표 삽화 여부는 true 또는 false로 지정하세요: ${image.id}`)
    if (Object.hasOwn(image, 'position')) throw new Error(`삽화 위치는 원고 표시로만 관리합니다. position을 지우세요: ${image.id}`)
    if (!image.id.startsWith(`${episode.id}-`) || image.id === `${episode.id}-`)
      throw new Error(`삽화 ID는 소속 회차 ID로 시작해야 합니다: ${image.id} → ${episode.id}-…`)
    if (!image.alt?.trim() || image.width !== 1280 || image.height !== 720)
      throw new Error(`삽화 설명 또는 16:9 크기를 확인하세요: ${image.id}`)
    const publicRoot = realpathSync(path.join(root, 'site/public'))
    for (const [format, sources] of [['jpg', image.sources], ...(image.webpSources ? [['webp', image.webpSources]] : [])]) {
      if (!Array.isArray(sources) || sources.length !== 3 || sources.map(source => source.width).join(',') !== '360,720,1280')
        throw new Error(`삽화의 모바일·고해상도 파일을 확인하세요: ${image.id}`)
      for (const source of sources) {
        if (source.src !== `/images/episodes/${image.id}-${source.width}.${format}`)
          throw new Error(`안전하지 않은 삽화 파일 경로: ${image.id}`)
        const asset = path.join(publicRoot, source.src)
        if (!existsSync(asset) || !realpathSync(asset).startsWith(`${publicRoot}${path.sep}`))
          throw new Error(`삽화 파일이 없습니다: ${source.src}`)
      }
    }
    byId.set(image.id, image)
    ;(images[episode.id] ??= []).push(image)
  }
  for (const episode of episodes) {
    const markers = parseIllustrationMarkers(episode.body)
    const seen = new Set()
    for (const marker of markers) {
      if (seen.has(marker.id)) throw new Error(`삽화 표시가 중복되었습니다: ${marker.id}`)
      seen.add(marker.id)
      const image = byId.get(marker.id)
      if (!image) throw new Error(`등록되지 않은 삽화 표시입니다: ${marker.id}`)
      if (image.episodeId !== episode.id) throw new Error(`다른 회차의 삽화 표시입니다: ${episode.id} → ${marker.id}`)
    }
    const rows = images[episode.id] ?? []
    // A book can illustrate some episodes and leave others as prose only.
    if (!rows.length) continue
    for (const image of rows)
      if (!seen.has(image.id)) throw new Error(`원고에 삽화 표시가 없습니다: ${image.id}`)
    const representatives = rows.filter(image => image.representative === true)
    if (explicitRepresentatives && representatives.length !== 1)
      throw new Error(`회차마다 대표 삽화를 하나만 지정하세요: ${episode.id}`)
    const representativeId = representatives[0]?.id ?? markers[0]?.id
    if (!representativeId) throw new Error(`회차의 대표 삽화가 없습니다: ${episode.id}`)
    images[episode.id] = markers.map(marker => ({ ...byId.get(marker.id), representative: marker.id === representativeId, position: { start: marker.start, paragraphIndex: marker.paragraphIndex } }))
  }
  return images
}

export const loadIllustrationManifest = loadEpisodeIllustrations
