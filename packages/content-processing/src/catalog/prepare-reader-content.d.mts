import type { BookConfig, ManuscriptEpisode, Place, ReaderCatalog } from '../types'
type CatalogWork = ReaderCatalog['work'] & { episodeCount: number }
type ExtensionContext = {
  root: string
  structure: { places: Place[]; episodes: ManuscriptEpisode[] }
  work: CatalogWork
  toText: typeof plainText
  warn: (message: string) => void
}
export const reservedWorkIds: Set<string>
export function plainText(markdown: unknown): string
export function prepareContent(options?: {
  root?: string
  book?: BookConfig
  logger?: { log?: (message: string) => void; warn?: (message: string) => void }
  extendCatalog?: (context: ExtensionContext) => { catalog?: Record<string, unknown>; generated?: [string, unknown][] }
}): { catalog: ReaderCatalog; manifest: { version: number; directory: string; files: string[]; sources: { source: string; id: string; filename: string }[] }; warnings: string[] }
