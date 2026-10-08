import type { MarkdownOptions } from 'vitepress'
import { episodeImageSizes, imageSrcset } from '../shared/image-sources.mjs'

type Markdown = Parameters<NonNullable<MarkdownOptions['config']>>[0]
export type Illustration = {
  id: string
  episodeId: string
  alt: string
  width: number
  height: number
  position: { start?: boolean; beforeParagraph?: string }
  sources: { src: string; width: number }[]
  webpSources?: { src: string; width: number }[]
}

export function episodeIllustrations(md: Markdown, options: { base: string; images: Record<string, Illustration[]> }) {
  md.core.ruler.after('inline', 'episode_illustrations', state => {
    const frontmatter = state.env.frontmatter
    if (frontmatter?.kind !== 'episode') return
    const episodeId = String(frontmatter.episodeId || '')
    let pendingStart = false
    let inserted = 0
    const tokens: typeof state.tokens = []
    const append = (illustration: Illustration) => {
      // Body illustrations introduce a visual scene; reuse an existing break when present.
      if (!illustration.position.start && tokens.at(-1)?.type !== 'hr') {
        const sceneBreak = new state.Token('hr', 'hr', 0)
        sceneBreak.block = true
        sceneBreak.markup = '* * *'
        tokens.push(sceneBreak)
      }
      const token = new state.Token('episode_illustration', '', 0)
      token.block = true
      token.meta = { illustration, first: inserted++ === 0 }
      tokens.push(token)
    }
    state.tokens.forEach((token, index) => {
      if (token.type === 'heading_open' && token.level === 0) {
        if (token.tag === 'h1') pendingStart = true
      }
      if (token.type === 'paragraph_open' && token.level === 0 && episodeId) {
        if (pendingStart) {
          for (const illustration of options.images[episodeId] || []) {
            if (illustration.position.start) append(illustration)
          }
          pendingStart = false
        }
        for (const illustration of options.images[episodeId] || []) {
          if (illustration.position.beforeParagraph === state.tokens[index + 1]?.content) append(illustration)
        }
      }
      tokens.push(token)
    })
    state.tokens = tokens
  })
  md.renderer.rules.episode_illustration = (tokens, index) => {
    const { illustration: image, first } = tokens[index].meta as { illustration: Illustration; first: boolean }
    const base = options.base.endsWith('/') ? options.base : `${options.base}/`
    const url = (src: string) => base + src.replace(/^\//, '')
    // Vue must keep public URLs literal instead of importing a base-prefixed srcset.
    const binding = (value: string) => md.utils.escapeHtml(JSON.stringify(value))
    const fallback = image.sources.find(source => source.width === 720) || image.sources.at(-1)!
    const srcset = imageSrcset(image.sources, base)
    const webp = image.webpSources?.length
      ? ` :webp-srcset="${binding(imageSrcset(image.webpSources, base))}"`
      : ''
    return `<figure class="episode-illustration" data-illustration="${md.utils.escapeHtml(image.id)}"><ResponsiveImage :src="${binding(url(fallback.src))}" :srcset="${binding(srcset)}"${webp} sizes="${episodeImageSizes}" :width="${image.width}" :height="${image.height}" alt="${md.utils.escapeHtml(image.alt)}" loading="${first ? 'eager' : 'lazy'}" fetchpriority="${first ? 'high' : 'auto'}" /></figure>\n`
  }
}
