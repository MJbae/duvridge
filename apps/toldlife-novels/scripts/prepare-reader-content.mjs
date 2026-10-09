import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { materializeBookContent } from '@duvridge/content-processing/source-files/materialize-book-content.mjs'
import { resolveBookSource } from '@duvridge/content-processing/source-files/resolve-book-source.mjs'
import { prepareContent as prepareShared, plainText } from '@duvridge/content-processing/catalog/prepare-reader-content.mjs'
export { plainText }
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function prepareContent(options = {}) {
  const root = path.resolve(options.root ?? projectRoot)
  const editorial = resolveBookSource({ repositoryRoot: path.resolve(projectRoot, '../..'), appRoot: projectRoot })
  if (root === projectRoot) materializeBookContent(root, editorial)
  return prepareShared({ ...options, root, book: editorial.book })
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { prepareContent() } catch (error) { console.error(`[content] ${error.message}`); process.exitCode = 1 }
}
