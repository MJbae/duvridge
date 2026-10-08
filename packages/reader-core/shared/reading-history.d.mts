export type SavedReading = { id: string; title: string; url: string; scroll: number; finished?: boolean }
type HistoryCatalog = {
  readingOrder: { id: string; title: string; url: string }[]
  legacyIds: Record<string, string>
  legacyScrollResetIds: readonly string[]
}
export function migrateReading(catalog: HistoryCatalog, saved: unknown): SavedReading | null
export function migrateCompleted(catalog: HistoryCatalog, saved: unknown): string[]
