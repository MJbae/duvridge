/** Shared by VitePress builds and the dependency-free deployment portal renderer. */
export function readerFontHead(manifest) {
  const preload = manifest.faces.filter(face => face.common && (face.family === 'ToldLife Serif' || face.weight === '600'))
  return [
    ['link', { id: 'reader-fonts', rel: 'stylesheet', href: `/fonts/${manifest.stylesheet}` }],
    ...preload.map(face => ['link', { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `/fonts/${face.file}` }]),
  ]
}

export function readerFontHeadHtml(manifest) {
  if (!manifest) return ''
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return readerFontHead(manifest).map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${escape(value)}"`).join(' ')}>`).join('\n')
}
