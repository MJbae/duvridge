import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

export function bookSource(source, book) {
  if (!(source instanceof URL) && (typeof source !== 'string' || !source.trim())) {
    throw new TypeError('An explicit book source directory is required.')
  }
  if (!book || typeof book !== 'object') throw new TypeError('Book metadata is required.')
  return resolve(source instanceof URL ? fileURLToPath(source) : source)
}

export function localAssetPath(root, asset) {
  if (typeof asset !== 'string' || !asset || isAbsolute(asset) || /^[a-z][a-z\d+.-]*:/i.test(asset)) {
    throw new Error(`Expected a book-relative asset path: ${asset}`)
  }
  const target = resolve(root, asset)
  const location = relative(root, target)
  if (!location || location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location)) {
    throw new Error(`Asset path leaves its source directory: ${asset}`)
  }
  return target
}

export function publicAssetPath(root, asset) {
  if (typeof asset !== 'string' || asset.startsWith('//') || /[?#]/.test(asset)) {
    throw new Error(`Expected a local public asset URL: ${asset}`)
  }
  return localAssetPath(resolve(root, 'public'), asset.replace(/^\//, ''))
}

export function imageDimensions(image, label) {
  if (![image?.width, image?.height].every(value => Number.isInteger(value) && value > 0)) {
    throw new Error(`Invalid image dimensions: ${label}`)
  }
  return { width: image.width, height: image.height }
}

export function imageTargets(root, image, label) {
  const targets = []
  for (const [key, type, quality, extensions] of [
    ['sources', 'image/jpeg', 0.82, ['.jpg', '.jpeg']],
    ['webpSources', 'image/webp', 0.8, ['.webp']],
  ]) {
    if (image[key] === undefined) continue
    if (!Array.isArray(image[key])) throw new Error(`Invalid ${key}: ${label}`)
    for (const item of image[key]) {
      if (!Number.isInteger(item.width) || item.width <= 0 || !extensions.includes(extname(item.src ?? '').toLowerCase())) {
        throw new Error(`Invalid ${key} image target: ${label}`)
      }
      targets.push({ path: publicAssetPath(root, item.src), width: item.width, type, quality })
    }
  }
  if (!targets.length) throw new Error(`No responsive image targets: ${label}`)
  if (new Set(targets.map(target => target.path)).size !== targets.length) {
    throw new Error(`Duplicate image output paths: ${label}`)
  }
  return targets
}

export async function imageData(path) {
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml' }
  const type = types[extname(path).toLowerCase()]
  if (!type) throw new Error(`Unsupported source image format: ${path}`)
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`
}

// Decode and encode every selected input before replacing any public asset.
export async function renderResponsiveImages(inputs) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    return await page.evaluate(async inputs => {
      const canvasOf = (width, height) => Object.assign(document.createElement('canvas'), { width, height })
      const draw = (target, from, ...area) => {
        const context = target.getContext('2d')
        if (!context) throw new Error('This browser cannot draw a canvas.')
        context.imageSmoothingQuality = 'high'
        context.drawImage(from, ...area, 0, 0, target.width, target.height)
        return target
      }
      const encode = blob => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      const results = []
      for (const input of inputs) {
        const image = new Image()
        image.src = input.data
        await image.decode()
        if (input.minimumSize && Math.max(image.naturalWidth, image.naturalHeight) < input.minimumSize) {
          throw new Error(`Master too small: ${input.id}`)
        }
        const aspectRatio = input.width / input.height
        const cropWidth = input.crop === 'full-width'
          ? image.naturalWidth
          : Math.min(image.naturalWidth, image.naturalHeight * aspectRatio)
        const cropHeight = cropWidth / aspectRatio
        if (cropHeight > image.naturalHeight) throw new Error(`Cover source is too short for its aspect ratio: ${input.id}`)
        const cropX = (image.naturalWidth - cropWidth) / 2
        const cropY = (image.naturalHeight - cropHeight) / 2
        for (const target of input.targets) {
          let canvas = draw(canvasOf(Math.round(cropWidth), Math.round(cropHeight)), image, cropX, cropY, cropWidth, cropHeight)
          // Halving preserves the source texture before the final responsive resize.
          while (canvas.width / 2 >= target.width) {
            canvas = draw(canvasOf(Math.round(canvas.width / 2), Math.round(canvas.height / 2)), canvas)
          }
          canvas = draw(canvasOf(target.width, Math.floor(target.width / aspectRatio)), canvas)
          const blob = await new Promise(resolve => canvas.toBlob(resolve, target.type, target.quality))
          if (!blob || blob.type !== target.type) throw new Error(`This browser cannot encode ${target.type}.`)
          results.push({ path: target.path, data: await encode(blob) })
        }
      }
      return results
    }, inputs)
  } finally {
    await browser.close()
  }
}

export async function writeImageOutputs(outputs) {
  for (const output of outputs) {
    await mkdir(dirname(output.path), { recursive: true })
    await writeFile(output.path, Buffer.from(output.data, 'base64'))
  }
  return outputs.map(output => output.path)
}
