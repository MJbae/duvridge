import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { materializeContent } from '@duvridge/memoir-content/materialize.mjs'
import { prepareContent as prepareShared, plainText } from '@duvridge/reader-core/scripts/prepare-content.mjs'
export { plainText }
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function prepareContent(options = {}) {
  const root = path.resolve(options.root ?? projectRoot)
  if (root === projectRoot) materializeContent(root)
  return prepareShared({ ...options, root })
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { prepareContent() } catch (error) { console.error(`[content] ${error.message}`); process.exitCode = 1 }
}
