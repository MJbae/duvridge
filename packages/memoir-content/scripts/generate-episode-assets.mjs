import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// Re-encode the selected replacement masters with the existing responsive sizes
// and the same progressive canvas resizing used for the home cover.
const root = new URL('../', import.meta.url)
const registry = JSON.parse(await readFile(new URL('content/illustration-sources/regeneration-prompts.json', root), 'utf8'))
const manifest = JSON.parse(await readFile(new URL('content/episode-illustrations.json', root), 'utf8'))
const requested = process.argv.slice(2)
const selected = requested.length ? registry.images.filter(image => requested.includes(image.id)) : registry.images
for (const id of requested) {
  if (!selected.some(image => image.id === id)) throw new Error(`Unknown replacement illustration: ${id}`)
}

// Load and validate every input before overwriting any public file.
const inputs = []
for (const image of selected) {
  const target = manifest.images.find(item => item.id === image.id)
  if (!target || target.width !== 1280 || target.height !== 720) throw new Error(`Invalid illustration target: ${image.id}`)
  const source = await readFile(new URL(image.master, root))
  inputs.push({ id: image.id, data: source.toString('base64') })
}

const widths = [360, 720, 1280]
const formats = [{ extension: 'webp', type: 'image/webp', quality: 0.8 }, { extension: 'jpg', type: 'image/jpeg', quality: 0.82 }]
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage()
  const outputs = await page.evaluate(async ({ inputs, widths, formats }) => {
    const canvasOf = (width, height) => Object.assign(document.createElement('canvas'), { width, height })
    const draw = (target, from, ...area) => {
      const context = target.getContext('2d')
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
      image.src = `data:image/png;base64,${input.data}`
      await image.decode()
      if (Math.max(image.naturalWidth, image.naturalHeight) < 1280) throw new Error(`Master too small: ${input.id}`)
      const cropWidth = Math.min(image.naturalWidth, image.naturalHeight * 16 / 9)
      const cropHeight = cropWidth * 9 / 16
      const cropX = (image.naturalWidth - cropWidth) / 2
      const cropY = (image.naturalHeight - cropHeight) / 2
      for (const width of widths) {
        let canvas = draw(canvasOf(Math.round(cropWidth), Math.round(cropHeight)), image, cropX, cropY, cropWidth, cropHeight)
        while (canvas.width / 2 >= width) canvas = draw(canvasOf(Math.round(canvas.width / 2), Math.round(canvas.height / 2)), canvas)
        canvas = draw(canvasOf(width, Math.floor(width * 9 / 16)), canvas)
        for (const format of formats) {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, format.type, format.quality))
          if (!blob || blob.type !== format.type) throw new Error(`Cannot encode ${format.type}`)
          results.push({ name: `${input.id}-${width}.${format.extension}`, data: await encode(blob) })
        }
      }
    }
    return results
  }, { inputs, widths, formats })

  for (const output of outputs) {
    const target = new URL(`site/public/images/episodes/${output.name}`, root)
    await writeFile(target, Buffer.from(output.data, 'base64'))
  }
  process.stdout.write(`Generated ${outputs.length} episode files from ${selected.length} replacement masters in ${fileURLToPath(new URL('site/public/images/episodes/', root))}.\n`)
} finally {
  await browser.close()
}
