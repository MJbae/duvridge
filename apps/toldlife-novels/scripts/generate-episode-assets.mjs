import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveBookSource } from '@duvridge/content-processing/source-files/resolve-book-source.mjs'
import { buildIllustrationAssets } from '@duvridge/content-processing/assets/index.mjs'
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const editorial = resolveBookSource({ repositoryRoot: path.resolve(appRoot, '../..'), appRoot })
await buildIllustrationAssets({ ...editorial, ids: process.argv.slice(2) })
