function resolveId(catalog, id) {
  return Object.hasOwn(catalog.legacyIds, id) ? catalog.legacyIds[id] : id
}

/** Preserve positions when only the ID changed; decade pages had different text. */
export function migrateReading(catalog, saved) {
  if (!saved || typeof saved.id !== 'string' || !Number.isFinite(saved.scroll)) return null
  const id = resolveId(catalog, saved.id)
  const entry = catalog.readingOrder.find(episode => episode.id === id)
  if (!entry) return null
  return {
    id, title: entry.title, url: entry.url,
    scroll: catalog.legacyScrollResetIds.includes(saved.id) ? 0 : Math.max(0, saved.scroll),
    ...(typeof saved.finished === 'boolean' ? { finished: saved.finished } : {}),
    // How far through the episode, from 0 to 1, for the work page's progress bar.
    ...(Number.isFinite(saved.progress) && saved.progress >= 0 && saved.progress <= 1 ? { progress: saved.progress } : {}),
  }
}

export function migrateCompleted(catalog, saved) {
  if (!Array.isArray(saved)) return []
  const known = new Set(catalog.readingOrder.map(episode => episode.id))
  return [...new Set(saved.filter(id => typeof id === 'string').map(id => resolveId(catalog, id)).filter(id => known.has(id)))]
}
