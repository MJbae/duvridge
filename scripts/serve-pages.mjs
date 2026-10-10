import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
const directory = path.resolve(process.argv[2] || '.deploy/toldlife')
const port = Number(process.argv[3] || 4190)
const rules = existsSync(path.join(directory, '_redirects')) ? new Map(readFileSync(path.join(directory, '_redirects'), 'utf8').trim().split('\n').filter(Boolean).map(line => { const [from, to, status] = line.split(/\s+/); return [from, { to, status: Number(status) }] })) : new Map()
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2' }
const compressedFontStyles = new Map()
createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const redirect = rules.get(url.pathname)
  if (redirect) { res.writeHead(redirect.status, { Location: redirect.to }); return res.end() }
  let decoded
  try { decoded = decodeURIComponent(url.pathname) } catch { res.writeHead(400); return res.end() }
  let file = path.resolve(directory, '.' + decoded)
  if (!file.startsWith(directory + path.sep) && file !== directory) { res.writeHead(403); return res.end() }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); return res.end() }
    file = path.join(file, 'index.html')
  } else if (!existsSync(file) && existsSync(file + '.html')) file += '.html'
  else if (url.pathname.endsWith('.html') && existsSync(file)) { res.writeHead(301, { Location: url.pathname.slice(0, -5) + url.search }); return res.end() }
  let status = 200
  if (!existsSync(file) || !statSync(file).isFile()) { status = 404; file = path.join(directory, '404.html') }
  if (!existsSync(file)) { res.writeHead(404); return res.end() }
  const size = statSync(file).size
  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = range ? Number(range[1]) : 0
  const end = range ? Math.min(Number(range[2] || size - 1), size - 1) : size - 1
  if (range && (start > end || start >= size)) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end() }
  const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' }
  if (/^\/fonts\/reader\.[a-f0-9]{16}\.css$/.test(decoded) && !range && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    if (!compressedFontStyles.has(file)) compressedFontStyles.set(file, gzipSync(readFileSync(file)))
    const body = compressedFontStyles.get(file)
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': body.length,
      'Cache-Control': 'public, max-age=31536000, immutable' })
    return res.end(req.method === 'HEAD' ? undefined : body)
  }
  if (/^\/fonts\/[^/]+\.[a-f0-9]{16}\.(woff2|css)$/.test(url.pathname)) headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  res.writeHead(range ? 206 : status, headers)
  if (req.method === 'HEAD' || size === 0) return res.end()
  createReadStream(file, { start, end }).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`Pages fixture: http://127.0.0.1:${port}`))
