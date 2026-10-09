export function workStorageKey(workId: string, kind: string): string
export function migrateWorkStorage(storage: Pick<Storage, 'getItem' | 'setItem'>, work: { id: string; legacyRoot?: boolean }): void
export function reactionPageId(work: { id: string; legacyRoot?: boolean }, pageId: string): string
