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

