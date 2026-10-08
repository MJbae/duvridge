import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// Regenerate with: npm run assets:cover
// Builds the home cover from the approved watercolor that sharing also uses.
// The artwork is not edited: a centered 16:9 crop is resized to the same
// 360·720·1280px WebP and JPG set as the episode illustrations.
const imagesDirectory = fileURLToPath(new URL('../site/public/images/', import.meta.url))
const sourceFile = `${imagesDirectory}bae-byunghee-hero-watercolor.png`
const widths = [360, 720, 1280]
const formats = [{ extension: 'webp', type: 'image/webp', quality: 0.8 }, { extension: 'jpg', type: 'image/jpeg', quality: 0.82 }]

const source = await readFile(sourceFile)
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage()
  const outputs = await page.evaluate(async ({ data, widths, formats }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const cropHeight = image.naturalWidth * 9 / 16
    if (cropHeight > image.naturalHeight) throw new Error('The cover source must be at least 16:9 wide.')

    const canvasOf = (width, height) => Object.assign(document.createElement('canvas'), { width, height })
    const draw = (target, from, ...area) => {
      const context = target.getContext('2d')
      context.imageSmoothingQuality = 'high'
      context.drawImage(from, ...area, 0, 0, target.width, target.height)
      return target
    }
    // Halving before the last step keeps the watercolor texture from aliasing at 360px.
    const resize = width => {
      let canvas = draw(canvasOf(image.naturalWidth, Math.round(cropHeight)), image, 0, (image.naturalHeight - cropHeight) / 2, image.naturalWidth, cropHeight)
      while (canvas.width / 2 >= width) canvas = draw(canvasOf(Math.round(canvas.width / 2), Math.round(canvas.height / 2)), canvas)
      return draw(canvasOf(width, Math.floor(width * 9 / 16)), canvas)
    }
    const dataUrl = blob => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1])
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })

    const results = []
    for (const width of widths) {
      const canvas = resize(width)
      for (const format of formats) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, format.type, format.quality))
        if (!blob || blob.type !== format.type) throw new Error(`This browser cannot encode ${format.type}.`)
        results.push({ name: `home-cover-${width}.${format.extension}`, data: await dataUrl(blob) })
      }
    }
    return results
  }, { data: source.toString('base64'), widths, formats })

  for (const output of outputs) await writeFile(`${imagesDirectory}${output.name}`, Buffer.from(output.data, 'base64'))
  process.stdout.write(`Generated ${outputs.length} home cover files from ${sourceFile}.\n`)
} finally {
  await browser.close()
}
