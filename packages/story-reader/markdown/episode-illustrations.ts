import type { MarkdownOptions } from 'vitepress'
import { episodeImageSizes, imageSrcset } from '../shared/image-sources.mjs'
import { illustrationMarkerId } from '../shared/episode-illustrations.mjs'

type Markdown = Parameters<NonNullable<MarkdownOptions['config']>>[0]
export type Illustration = {
  id: string
  episodeId: string
  alt: string
  width: number
  height: number
  position: { start: boolean; paragraphIndex: number }
  sources: { src: string; width: number }[]
  webpSources?: { src: string; width: number }[]
}

export function episodeIllustrations(md: Markdown, options: { base: string; images: Record<string, Illustration[]> }) {
  // A narrow block rule works with html:false; it does not enable arbitrary source HTML.
  md.block.ruler.before('html_block', 'illustration_marker', (state, startLine, _endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false
    const line = state.src.slice(state.bMarks[startLine], state.eMarks[startLine])
    const id = illustrationMarkerId(line)
    if (!id) return false
    if (silent) return true
    const token = state.push('illustration_marker', '', 0)
    token.block = true
    token.content = id
    token.map = [startLine, startLine + 1]
    state.line = startLine + 1
    return true
  }, { alt: ['paragraph'] })
  md.core.ruler.after('inline', 'episode_illustrations', state => {
    const frontmatter = state.env.frontmatter
    const episodeId = frontmatter?.kind === 'episode' ? String(frontmatter.episodeId || '') : ''
    const images = options.images[episodeId] ?? []
    const byId = new Map(images.map(image => [image.id, image]))
    const seen = new Set<string>()
    const tokens: typeof state.tokens = []
    for (const token of state.tokens) {
      if (token.type !== 'illustration_marker') { tokens.push(token); continue }
      if (!episodeId) continue
      const illustration = byId.get(token.content)
      if (!illustration) throw new Error(`이 회차에 등록되지 않은 삽화 표시입니다: ${token.content}`)
      if (seen.has(illustration.id)) throw new Error(`삽화 표시가 중복되었습니다: ${illustration.id}`)
      // Body illustrations introduce a scene; reuse an existing break when present.
      if (!illustration.position.start && tokens.at(-1)?.type !== 'hr') {
        const sceneBreak = new state.Token('hr', 'hr', 0)
        sceneBreak.block = true
        sceneBreak.markup = '* * *'
        tokens.push(sceneBreak)
      }
      const imageToken = new state.Token('episode_illustration', '', 0)
      imageToken.block = true
      imageToken.meta = { illustration, first: seen.size === 0 }
      seen.add(illustration.id)
      tokens.push(imageToken)
    }
    for (const image of images)
      if (!seen.has(image.id)) throw new Error(`본문에 삽화 표시가 없습니다: ${image.id}`)
    state.tokens = tokens
  })
  md.renderer.rules.illustration_marker = () => ''
  md.renderer.rules.episode_illustration = (tokens, index) => {
    const { illustration: image, first } = tokens[index].meta as { illustration: Illustration; first: boolean }
    const base = options.base.endsWith('/') ? options.base : `${options.base}/`
    const url = (src: string) => base + src.replace(/^\//, '')
    const binding = (value: string) => md.utils.escapeHtml(JSON.stringify(value))
    const fallback = image.sources.find(source => source.width === 720) || image.sources.at(-1)!
    const srcset = imageSrcset(image.sources, base)
    const webp = image.webpSources?.length
      ? ` :webp-srcset="${binding(imageSrcset(image.webpSources, base))}"`
      : ''
    return `<figure class="episode-illustration" data-illustration="${md.utils.escapeHtml(image.id)}"><ResponsiveImage :src="${binding(url(fallback.src))}" :srcset="${binding(srcset)}"${webp} sizes="${episodeImageSizes}" :width="${image.width}" :height="${image.height}" alt="${md.utils.escapeHtml(image.alt)}" loading="${first ? 'eager' : 'lazy'}" fetchpriority="${first ? 'high' : 'auto'}" /></figure>\n`
  }
}
