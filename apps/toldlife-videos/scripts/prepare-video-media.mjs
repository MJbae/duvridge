import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Videos are published apart from Git, so a build has none unless they are put where the site serves them.
 * TOLDLIFE_VIDEO_MEDIA names a folder with the files (by their published name or `<episode>.mp4`);
 * TOLDLIFE_VIDEO_FIXTURES=1 makes silent stand-ins of the same length for browser tests. With neither, the
 * build carries no video, as in CI, and deployment adds the published files.
 */
export function prepareVideoMedia({ media = process.env.TOLDLIFE_VIDEO_MEDIA, fixtures = process.env.TOLDLIFE_VIDEO_FIXTURES === '1' } = {}) {
  if (!media && !fixtures) return []
  const catalogs = JSON.parse(readFileSync(path.join(appRoot, 'site/.vitepress/generated/catalogs.json'), 'utf8'))
  const placed = []
  for (const catalog of Object.values(catalogs)) {
    // The episode videos and the films made from the work are placed the same way.
    const videos = [...Object.entries(catalog.video ?? {}), ...(catalog.films ?? []).map(film => [film.id, film])]
    for (const [id, video] of videos) {
      const target = path.join(appRoot, 'site/public', video.src)
      mkdirSync(path.dirname(target), { recursive: true })
      if (media) {
        const source = [path.join(media, path.basename(video.src)), path.join(media, `${id}.mp4`)].find(existsSync)
        if (!source) throw new Error(`영상 파일이 없습니다: ${path.basename(video.src)}`)
        rmSync(target, { force: true })
        try { linkSync(source, target) } catch { copyFileSync(source, target) }
      } else if (!existsSync(target)) {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${video.height > video.width ? '36x64' : '64x36'}:r=2:d=${video.duration}`,
          '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', String(video.duration),
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '16k', '-movflags', '+faststart', target])
      }
      placed.push(target)
    }
  }
  return placed
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const placed = prepareVideoMedia()
    if (placed.length) console.log(`[video] 영상 ${placed.length}개 준비`)
  } catch (error) { console.error(`[video] ${error.message}`); process.exitCode = 1 }
}
