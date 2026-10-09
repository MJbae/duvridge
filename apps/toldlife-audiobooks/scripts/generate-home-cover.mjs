import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveBookSource } from '@duvridge/content-processing/source-files/resolve-book-source.mjs'
import { buildCoverAssets } from '@duvridge/content-processing/assets/index.mjs'
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const editorial = resolveBookSource({ repositoryRoot: path.resolve(appRoot, '../..'), appRoot })
await buildCoverAssets({ ...editorial, ids: process.argv.slice(2) })
