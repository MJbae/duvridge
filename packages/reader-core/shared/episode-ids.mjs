/** Episode IDs match music filenames; these aliases only support older data. */
export function episodeId(kind, number = 1) {
  if (kind === 'prologue') return 'prolog'
  if (kind === 'epilogue') return 'epilog'
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('회차 번호가 잘못되었습니다.')
  if (kind === 'episode') return `ep${String(number).padStart(2, '0')}`
  if (kind === 'side') return number === 1 ? 'side' : `side-${String(number).padStart(2, '0')}`
  throw new Error(`회차 종류가 잘못되었습니다: ${kind}`)
}

export const legacyHeadingIds = Object.freeze({
  prologue: 'prolog',
  josae: 'ep01', jige: 'ep02', 'serial-number': 'ep03', cheonsuman: 'ep04',
  kalguksu: 'ep05', laver: 'ep06', anchovy: 'ep07', bearing: 'ep08',
  leaving: 'ep09', 'reclaimed-land': 'ep10', 'bus-fare': 'ep11', 'rice-mill': 'ep12',
  flashlight: 'ep13', 'power-line': 'ep14', 'seed-rice': 'ep15', kitchen: 'ep16',
  'bad-debt': 'ep17', 'last-land': 'ep18', 'wet-rice': 'ep19', farewell: 'ep20',
  'four-sons': 'ep21', promise: 'ep22', robot: 'ep23',
  epilogue: 'epilog', 'side-table': 'side',
})

export const legacyDecadeIds = Object.freeze({
  '1930s': 'ep01', '1940s': 'ep01', '1950s': 'ep03',
  '1960s': 'ep05', '1970s': 'ep07', '1980s': 'ep12',
  '1990s': 'ep17', '2000s': 'ep21', '2010s': 'ep23', '2020s': 'side',
})

export const legacyEpisodes = Object.freeze({ ...legacyDecadeIds, ...legacyHeadingIds })
export const legacyPageIds = Object.freeze(Object.fromEntries(
  Object.entries(legacyHeadingIds).map(([old, id]) => [
    `${['prologue', 'epilogue'].includes(old) ? 'life' : 'ep'}-${old}`, id,
  ])
))
export const legacyReadingIds = Object.freeze({
  ...legacyEpisodes,
  ...legacyPageIds,
  ...Object.fromEntries(Object.entries(legacyDecadeIds).map(([old, id]) => [`life-${old}`, id])),
})
// Decade pages were split into episodes; their old scroll offsets cannot be reused.
export const legacyScrollResetIds = Object.freeze(
  Object.keys(legacyDecadeIds).flatMap(id => [id, `life-${id}`])
)
