export const episodeImageSizes = '(min-width: 680px) 632px, (max-width: 360px) calc(100vw - 40px), calc(100vw - 48px)'
export const coverImageSizes = '100vw'

export function imageSrcset(sources, base) {
  const prefix = base.endsWith('/') ? base : `${base}/`
  return sources.map(source => `${prefix}${source.src.replace(/^\//, '')} ${source.width}w`).join(', ')
}

// Preload the same responsive candidate as <picture>, only in the preferred format.
// Omitting href avoids downloading a mismatched size in older browsers.
export function imagePreload(sources, base, sizes, type) {
  return ['link', { rel: 'preload', as: 'image', type, fetchpriority: 'high',
    imagesrcset: imageSrcset(sources, base), imagesizes: sizes }]
}
