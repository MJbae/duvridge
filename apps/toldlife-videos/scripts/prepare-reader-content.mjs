import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { materializeBookContent } from '@duvridge/content-processing/source-files/materialize-book-content.mjs'
import { resolveBookSource } from '@duvridge/content-processing/source-files/resolve-book-source.mjs'
import { prepareContent as prepareShared, plainText } from '@duvridge/content-processing/catalog/prepare-reader-content.mjs'
import { loadNarration } from '../site/.vitepress/shared/narration-catalog.mjs'
import { prepareWorkCatalogs } from '@duvridge/content-processing/source-files/prepare-work-catalogs.mjs'
export { plainText }
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function prepareContent(options = {}) {
  const root = path.resolve(options.root ?? projectRoot)
  const editorial = resolveBookSource({ repositoryRoot: path.resolve(projectRoot, '../..'), appRoot: projectRoot })
  if (root === projectRoot) materializeBookContent(root, editorial)
  if (root === projectRoot) return prepareWorkCatalogs({ repositoryRoot: path.resolve(projectRoot, '../..'), appRoot: root,
    narrationSource: ({ source, book }) => ({
      [book.legacy?.servedAtRoot ? path.resolve(projectRoot, '../toldlife-audiobooks/content/narration') : path.join(source, 'narration/timings')]: 'content/narration',
      [book.legacy?.servedAtRoot ? path.resolve(projectRoot, '../toldlife-audiobooks/site/public/record') : path.join(source, 'narration/record')]: 'site/public/record',
    }),
    extendCatalog({ root, structure, work }) { return { catalog: { narration: loadNarration(root, structure.episodes, { work }).tracks } } },
  })
  return prepareShared({ ...options, root, book: editorial.book, extendCatalog({ root, structure, work }) {
    const narration = loadNarration(root, structure.episodes, { work })
    return { catalog: { narration: narration.tracks } }
  } })
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { prepareContent() } catch (error) { console.error(`[content] ${error.message}`); process.exitCode = 1 }
}
