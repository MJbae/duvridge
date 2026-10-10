import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

/** Root font URLs remain identical in development, standalone preview and Pages. */
export function readerFontMiddleware(directory) {
  const compressedStylesheets = new Map()
  return (request, response, next) => {
    const name = (request.url || '').split('?')[0].match(/^\/fonts\/([a-zA-Z0-9.-]+)$/)?.[1]
    if (!name) return next()
    const file = path.join(directory, name)
    if (!existsSync(file) || !statSync(file).isFile()) { response.statusCode = 404; return response.end() }
    response.setHeader('Content-Type', name.endsWith('.woff2') ? 'font/woff2' : name.endsWith('.css') ? 'text/css; charset=utf-8' : name.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8')
    response.setHeader('Cache-Control', /\.[a-f0-9]{16}\.(woff2|css)$/.test(name) ? 'public, max-age=31536000, immutable' : 'no-cache')
    if (name.endsWith('.css') && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
      if (!compressedStylesheets.has(file)) compressedStylesheets.set(file, gzipSync(readFileSync(file)))
      const body = compressedStylesheets.get(file)
      response.setHeader('Content-Encoding', 'gzip')
      response.setHeader('Vary', 'Accept-Encoding')
      response.setHeader('Content-Length', body.length)
      return response.end(request.method === 'HEAD' ? undefined : body)
    }
    if (request.method === 'HEAD') return response.end()
    createReadStream(file).pipe(response)
  }
}
