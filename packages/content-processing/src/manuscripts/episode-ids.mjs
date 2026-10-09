/** Episode IDs match music filenames; these aliases only support older data. */
export function episodeId(kind, number = 1) {
  if (kind === 'prologue') return 'prolog'
  if (kind === 'epilogue') return 'epilog'
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('회차 번호가 잘못되었습니다.')
  if (kind === 'episode') return `ep${String(number).padStart(2, '0')}`
  if (kind === 'side') return number === 1 ? 'side' : `side-${String(number).padStart(2, '0')}`
  throw new Error(`회차 종류가 잘못되었습니다: ${kind}`)
}

/** Derive compatibility identifiers from a book's authored legacy maps. */
export function createLegacyEpisodeMaps({ headingIds = {}, decadeIds = {} } = {}) {
  const legacyHeadingIds = Object.freeze({ ...headingIds })
  const legacyDecadeIds = Object.freeze({ ...decadeIds })
  const legacyEpisodes = Object.freeze({ ...legacyDecadeIds, ...legacyHeadingIds })
  const legacyPageIds = Object.freeze(Object.fromEntries(
    Object.entries(legacyHeadingIds).map(([old, id]) => [
      `${['prologue', 'epilogue'].includes(old) ? 'life' : 'ep'}-${old}`, id,
    ])
  ))
  const legacyReadingIds = Object.freeze({
    ...legacyEpisodes,
    ...legacyPageIds,
    ...Object.fromEntries(Object.entries(legacyDecadeIds).map(([old, id]) => [`life-${old}`, id])),
  })
  const legacyScrollResetIds = Object.freeze(
    Object.keys(legacyDecadeIds).flatMap(id => [id, `life-${id}`])
  )
  return { legacyHeadingIds, legacyDecadeIds, legacyEpisodes, legacyPageIds, legacyReadingIds, legacyScrollResetIds }
}
