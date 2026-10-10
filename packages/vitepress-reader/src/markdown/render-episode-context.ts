import type { MarkdownOptions } from 'vitepress'

type Markdown = Parameters<NonNullable<MarkdownOptions['config']>>[0]

/** The optional manuscript dateline belongs to the episode body, below its opening painting. */
export function episodeContext(md: Markdown) {
  md.core.ruler.after('episode_illustrations', 'episode_context', state => {
    const frontmatter = state.env.frontmatter
    if (frontmatter?.kind !== 'episode' || !frontmatter.time) return
    const text = String(frontmatter.time).trim()
    if (!text) return

    const titleEnd = state.tokens.findIndex(token => token.type === 'heading_close' && token.tag === 'h1')
    let at = titleEnd + 1
    const opening = state.tokens[at]
    if (opening?.type === 'episode_illustration' && opening.meta.illustration.position.start) {
      ++at
    } else if (opening?.type === 'paragraph_open') {
      // Regular Markdown pictures work too; a later picture stays where it was authored.
      const children = state.tokens[at + 1]?.children ?? []
      if (children.length === 1 && children[0].type === 'image' && state.tokens[at + 2]?.type === 'paragraph_close') at += 3
    }
    const context = new state.Token('episode_context', '', 0)
    context.block = true
    context.content = text
    state.tokens.splice(at, 0, context)
  })
  md.renderer.rules.episode_context = (tokens, index) =>
    `<div class="episode-context" v-pre>${md.utils.escapeHtml(tokens[index].content)}</div>\n`
}
