import { createLegacyEpisodeMaps } from '@duvridge/content-processing/manuscripts/episode-ids.mjs'
import book from '../../../content/book.json' with { type: 'json' }
export * from '@duvridge/content-processing/manuscripts/episode-ids.mjs'
export const { legacyHeadingIds, legacyDecadeIds, legacyEpisodes, legacyPageIds, legacyReadingIds, legacyScrollResetIds } = createLegacyEpisodeMaps(book.legacy)
