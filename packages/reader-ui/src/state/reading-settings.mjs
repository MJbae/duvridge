export const fontSizeOptions = [
  { label: '작게', pixels: 18, sample: '1.125rem' },
  { label: '기본', pixels: 20, sample: '1.25rem' },
  { label: '크게', pixels: 23, sample: '1.4375rem' },
  { label: '아주 크게', pixels: 26, sample: '1.625rem' },
]
export const leadingOptions = [{ value: 'normal', label: '보통' }, { value: 'wide', label: '넓게' }]
export const faceOptions = [{ value: 'serif', label: '명조' }, { value: 'sans', label: '고딕' }]

/** Invalid or missing preferences return to the default reading settings. */
export function readingSettings(saved = {}) {
  const font = typeof saved.font === 'number' || (typeof saved.font === 'string' && /^[0-3]$/.test(saved.font)) ? Number(saved.font) : 1
  return {
    font: Number.isInteger(font) && font >= 0 && font < fontSizeOptions.length ? font : 1,
    leading: leadingOptions.some(option => option.value === saved.leading) ? saved.leading : 'wide',
    face: faceOptions.some(option => option.value === saved.face) ? saved.face : 'serif',
  }
}

/** Keep first-paint CSS and later Vue settings in agreement without changing the SSR markup. */
export function applyReadingSettings(settings, element = globalThis.document?.documentElement) {
  if (!element) return
  element.dataset.readerFont = String(settings.font)
  element.dataset.readerLeading = settings.leading
  element.dataset.readerFace = settings.face
}

/** The head runs before CSS can start downloading the server's default serif face. */
export function readingSettingsBootstrap() {
  return `(()=>{const fontSizeOptions=${JSON.stringify(fontSizeOptions)};const leadingOptions=${JSON.stringify(leadingOptions)};const faceOptions=${JSON.stringify(faceOptions)};const readingSettings=${readingSettings.toString()};const applyReadingSettings=${applyReadingSettings.toString()};try{applyReadingSettings(readingSettings({font:localStorage.getItem('family-library:font'),leading:localStorage.getItem('family-library:leading'),face:localStorage.getItem('family-library:face')}))}catch{applyReadingSettings(readingSettings())}})()`
}
