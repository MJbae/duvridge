export function migrateReactionIds(options: { project: string; apply?: boolean; emulator?: boolean }): Promise<{
  project: string; mode: string; sourceDocuments: number; plannedWrites: number; copied: number; alreadyCurrent: number
}>
