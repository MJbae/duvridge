import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

const markerLine = /^ {0,3}<!--\s*illustration:\s*([a-z0-9][a-z0-9-]*)\s*-->\s*$/u
const fenceLine = /^\s{0,3}(`{3,}|~{3,})/
const headingLine = /^ {0,3}#{1,6}(?:[ \t]+|$)/
const horizontalRule = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const commentBlock = /^<!--[\s\S]*-->$/

export function illustrationMarkerId(line) {
  return String(line).replace(/[\r\n]+$/, '').match(markerLine)?.[1] ?? null
}

/** Stable manuscript anchors; paragraph indexes are derived, never editorial inputs. */
export function parseIllustrationMarkers(body) {
  const lines = String(body).split(/(?<=\n)/)
  const markers = []
  let fence = null, offset = 0, paragraphs = 0, block = []
  const flush = () => {
    const text = block.join('').trim()
    if (text && !commentBlock.test(text)) paragraphs++
    block = []
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const delimiter = line.match(fenceLine)
    if (delimiter) {
      flush()
      if (!fence) fence = delimiter[1]
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = null
    } else if (!fence) {
      const id = illustrationMarkerId(line)
      if (id) {
        if (index && lines[index - 1].trim() || index + 1 < lines.length && lines[index + 1].trim())
          throw new Error(`삽화 표시는 독립된 줄에 두고 앞뒤를 빈 줄로 구분하세요: ${id}`)
        flush()
        markers.push({ id, offset, paragraphIndex: paragraphs, start: paragraphs === 0 })
      } else if (/<!--\s*illustration:/i.test(line)) {
        throw new Error(`삽화 표시 형식은 <!-- illustration: ep01-01 -->입니다: ${line.trim()}`)
      } else if (!line.trim()) flush()
      else if (headingLine.test(line.replace(/[\r\n]+$/, '')) || horizontalRule.test(line.replace(/[\r\n]+$/, ''))) flush()
      else block.push(line)
    }
    offset += line.length
  }
  flush()
  for (const [index, marker] of markers.entries()) {
    if (marker.paragraphIndex >= paragraphs) throw new Error(`삽화 표시 뒤에는 본문 문단이 있어야 합니다: ${marker.id}`)
    if (index && marker.paragraphIndex === markers[index - 1].paragraphIndex)
      throw new Error(`한 본문 문단 앞에는 삽화 표시를 하나만 두세요: ${markers[index - 1].id}, ${marker.id}`)
  }
  return markers
}

/** Remove only our standalone comments, leaving fenced examples and all prose unchanged. */
export function stripIllustrationMarkers(markdown) {
  let fence = null, separator = false
  return String(markdown).split(/(?<=\n)/).map(line => {
    const delimiter = line.match(fenceLine)
    if (delimiter) {
      if (!fence) fence = delimiter[1]
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = null
      separator = false
      return line
    }
    if (!fence && illustrationMarkerId(line)) { separator = true; return '' }
    if (separator && !line.trim()) { separator = false; return '' }
    separator = false
    return line
  }).join('')
}

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
  const byEpisode = Object.fromEntries(episodes.map(episode => [episode.id, episode]))
  const byId = new Map()
  const images = {}
  for (const image of manifest.images) {
    const episode = byEpisode[image.episodeId]
    if (!episode || !/^[a-z0-9][a-z0-9-]*$/.test(image.id) || byId.has(image.id))
      throw new Error(`삽화의 회차 또는 ID가 잘못되었습니다: ${image.id}`)
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
    for (const image of rows)
      if (!seen.has(image.id)) throw new Error(`원고에 삽화 표시가 없습니다: ${image.id}`)
    if (!rows.length || !markers[0]?.start)
      throw new Error(`회차 첫 본문 앞에 대표 삽화 표시를 두세요: ${episode.id}`)
    images[episode.id] = markers.map(marker => ({ ...byId.get(marker.id), position: { start: marker.start, paragraphIndex: marker.paragraphIndex } }))
  }
  return images
}
