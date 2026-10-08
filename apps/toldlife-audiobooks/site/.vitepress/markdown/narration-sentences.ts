import type { MarkdownOptions } from 'vitepress'
import { compact } from '../shared/narration-cues.mjs'

type Markdown = Parameters<NonNullable<MarkdownOptions['config']>>[0]
type CoreRule = Parameters<Markdown['core']['ruler']['push']>[1]
type State = Parameters<CoreRule>[0]
type Token = State['tokens'][number]
export type NarrationSentences = Record<string, { cue: number; text: string }[]>
type Wrap = { child: number; from: number; to: number; cue: number }
type Paragraph = { token: Token; text: string; owners: { child: number; at: number }[] }

/** Each visible character of a paragraph with the text token it came from; whitespace is skipped. */
function readParagraph(token: Token): Paragraph {
  const owners: Paragraph['owners'] = []
  let text = ''
  token.children?.forEach((child, index) => {
    if (child.type !== 'text') return
    child.content = child.content.normalize('NFC')
    for (let at = 0; at < child.content.length; at++) {
      if (/\s/.test(child.content[at])) continue
      text += child.content[at]
      owners.push({ child: index, at })
    }
  })
  return { token, text, owners }
}

/** A sentence that crosses inline markup gets one span per text token, with the same cue. */
function wrapsFor(paragraph: Paragraph, start: number, end: number, cue: number): Wrap[] {
  const first = paragraph.owners[start]
  const last = paragraph.owners[end - 1]
  const wraps: Wrap[] = []
  for (let child = first.child; child <= last.child; child++) {
    const content = paragraph.token.children![child]
    if (content.type !== 'text') continue
    wraps.push({ child, cue, from: child === first.child ? first.at : 0, to: child === last.child ? last.at + 1 : content.content.length })
  }
  return wraps
}

function rebuild(state: State, paragraph: Paragraph, wraps: Wrap[]) {
  const tokens: Token[] = []
  const piece = (type: string, content: string) => {
    const token = new state.Token(type, '', 0)
    token.content = content
    tokens.push(token)
  }
  paragraph.token.children!.forEach((child, index) => {
    const own = wraps.filter(wrap => wrap.child === index)
    if (!own.length) return tokens.push(child)
    let cursor = 0
    for (const wrap of own) {
      if (wrap.from > cursor) piece('text', child.content.slice(cursor, wrap.from))
      piece('html_inline', `<span class="cue" data-cue="${wrap.cue}">`)
      piece('text', child.content.slice(wrap.from, wrap.to))
      piece('html_inline', '</span>')
      cursor = wrap.to
    }
    if (cursor < child.content.length) piece('text', child.content.slice(cursor))
  })
  paragraph.token.children = tokens
}

/** Wraps each narrated sentence so the reader can mark the one being read aloud. */
export function narrationSentences(md: Markdown, options: { sentences: NarrationSentences }) {
  md.core.ruler.push('narration_sentences', state => {
    const frontmatter = state.env.frontmatter
    if (frontmatter?.kind !== 'episode') return
    const sentences = options.sentences[String(frontmatter.episodeId || '')]
    if (!sentences?.length) return
    const paragraphs = state.tokens
      .filter((token, index) => token.type === 'inline' && state.tokens[index - 1]?.type === 'paragraph_open')
      .map(readParagraph)
    const wraps = new Map<Paragraph, Wrap[]>()
    let current = 0
    let offset = 0
    const missing: number[] = []
    for (const { cue, text } of sentences) {
      const needle = compact(text)
      const index = paragraphs.findIndex((paragraph, position) => position >= current && needle
        && paragraph.text.indexOf(needle, position === current ? offset : 0) >= 0)
      if (index < 0) {
        missing.push(cue + 1)
        continue
      }
      const start = paragraphs[index].text.indexOf(needle, index === current ? offset : 0)
      current = index
      offset = start + needle.length
      wraps.set(paragraphs[index], [...(wraps.get(paragraphs[index]) ?? []), ...wrapsFor(paragraphs[index], start, offset, cue)])
    }
    // The content check found these sentences in the manuscript, so a miss here means the page differs from it.
    if (missing.length) console.warn(`[narration] ${frontmatter.episodeId}: 본문 문단에서 찾지 못해 표시하지 않는 문장 ${missing.join(', ')}번`)
    for (const [paragraph, list] of wraps) rebuild(state, paragraph, list)
  })
}
