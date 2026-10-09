export const workStorageKey = (workId, kind) => `family-library:${workId}:${kind}`
/** Copy legacy keys once, without deleting the rollback-compatible originals. */
export function migrateWorkStorage(storage, work) {
  if (!work.legacyRoot) return
  for (const kind of ['reading', 'resume', 'completed', 'narration']) {
    try {
      const target = workStorageKey(work.id, kind)
      if (storage.getItem(target) !== null) continue
      const saved = storage.getItem(`family-library:${kind}`)
      if (saved !== null) storage.setItem(target, saved)
    } catch { /* Browser storage is optional. */ }
  }
}
/** Preserve the first work's existing Firestore IDs and reaction caches. */
export const reactionPageId = (work, pageId) => work.legacyRoot ? pageId : `${work.id}-${pageId}`
