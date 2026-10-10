/** Shared by VitePress builds and the dependency-free deployment portal renderer. */
export function readerFontHead(manifest) {
  const preload = manifest.faces.filter(face => face.common && ((face.family === 'ToldLife Serif' && face.weight !== '400') || (face.family === 'ToldLife UI' && face.weight === '600')))
  return [
    ['link', { id: 'reader-fonts', rel: 'stylesheet', href: `/fonts/${manifest.stylesheet}` }],
    ...preload.map(face => ['link', { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `/fonts/${face.file}` }]),
  ]
}

/** A reading page chooses its body face after the pre-CSS preference bootstrap. */
export function readingFontPreloadScript(manifest) {
  const file = (family, weight) => {
    const face = manifest.faces.find(face => face.common && face.family === family && face.weight === weight)
    if (!face) throw new Error(`Missing common body face: ${family} ${weight}`)
    return `/fonts/${face.file}`
  }
  return `(()=>{const href=document.documentElement.dataset.readerFace==='sans'?${JSON.stringify(file('ToldLife UI', '400'))}:${JSON.stringify(file('ToldLife Serif', '400'))};const link=document.createElement('link');link.rel='preload';link.as='font';link.type='font/woff2';link.crossOrigin='anonymous';link.href=href;document.head.append(link)})()`
}

export function readerFontHeadHtml(manifest) {
  if (!manifest) return ''
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return readerFontHead(manifest).map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${escape(value)}"`).join(' ')}>`).join('\n')
}
