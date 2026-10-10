import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { resolveConfig, serve } from 'vitepress'
import { readerFontMiddleware } from '@duvridge/reader-ui/fonts/font-server.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: 'string', default: '4173' }, host: { type: 'string' } } })
const root = path.resolve(positionals[0] ?? 'site')
const config = await resolveConfig(root, 'serve', 'production')
const fonts = path.join(config.outDir, 'fonts')
if (!existsSync(path.join(fonts, 'manifest.json'))) throw new Error('Build the reader and its font assets before previewing it.')
const server = await serve({ root, port: Number(values.port) })
// VitePress 1.x uses Polka for preview, so Vite's configurePreviewServer hook does not run.
server.use(readerFontMiddleware(fonts))
