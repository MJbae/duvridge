import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

/** Every track uses the same ID as its episode and MP3 filename. */
export function loadMusic(root, episodes) {
  const filename = path.join(root, 'content/music.json')
  if (!existsSync(filename)) return null
  const manifest = JSON.parse(readFileSync(filename, 'utf8'))
  if (manifest.version !== 3 || !Array.isArray(manifest.tracks))
    throw new Error('배경 음악 목록의 형식을 확인하세요.')
  const publicRoot = path.join(root, 'site/public')
  const registered = new Set()
  function asset(src) {
    if (typeof src !== 'string' || !/^\/music\/[a-z0-9][a-z0-9-]*\.mp3$/.test(src) || registered.has(src))
      throw new Error(`배경 음악 파일 경로가 잘못되었거나 중복되었습니다: ${src}`)
    const file = path.join(publicRoot, src)
    if (!existsSync(file) || !statSync(file).isFile() || !statSync(file).size ||
        !realpathSync(file).startsWith(`${realpathSync(publicRoot)}${path.sep}`))
      throw new Error(`배경 음악 파일이 없습니다: ${src}`)
    registered.add(src)
    return src
  }
  const byId = new Map(episodes.map(episode => [episode.id, episode]))
  let home
  const tracks = {}
  for (const track of manifest.tracks) {
    if (!track || typeof track.id !== 'string') throw new Error('배경 음악의 회차 ID를 확인하세요.')
    const episode = byId.get(track.id)
    if (track.id === 'intro' ? home : !episode || Object.hasOwn(tracks, track.id))
      throw new Error(`배경 음악의 회차가 잘못되었거나 중복되었습니다: ${track.id}`)
    if (track.src !== `/music/${track.id}.mp3`)
      throw new Error(`배경 음악 ID와 파일명이 맞지 않습니다: ${track.id} → ${track.src}`)
    const value = { id: track.id, src: asset(track.src), label: episode ? `${episode.label} 음악` : '작품 소개 음악' }
    if (track.id === 'intro') home = value
    else tracks[track.id] = value
  }
  if (!home) throw new Error('작품 소개의 배경 음악이 없습니다: intro')
  for (const episode of episodes) {
    if (!Object.hasOwn(tracks, episode.id)) throw new Error(`회차의 배경 음악이 없습니다: ${episode.id}`)
  }
  for (const entry of readdirSync(path.join(publicRoot, 'music'), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && /\.mp3$/i.test(entry.name)) {
      const src = '/' + path.relative(publicRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')
      if (!registered.has(src)) throw new Error(`서비스에 연결하지 않은 음악이 있습니다: ${src}`)
    }
  }
  return { home, episodes: tracks }
}
