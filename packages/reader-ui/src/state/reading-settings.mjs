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
