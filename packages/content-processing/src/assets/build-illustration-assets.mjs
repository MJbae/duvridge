import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { bookSource, imageData, imageDimensions, imageTargets, localAssetPath, renderResponsiveImages, writeImageOutputs } from './asset-files.mjs'

async function masterData(root, master) {
  const path = localAssetPath(root, master)
  try {
    return await imageData(path)
  } catch (error) {
    // Historical registry paths remain reference data after the source tree moves.
    if (error.code !== 'ENOENT') throw error
    return imageData(localAssetPath(root, `illustrations/source-images/${basename(master)}`))
  }
}

/** Re-encode registered illustration masters using their manifest output paths. */
export async function buildIllustrationAssets({ source, book, ids = [] }) {
  const root = bookSource(source, book)
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id)) {
    throw new TypeError('Illustration ids must be an array of nonempty strings.')
  }
  const registry = JSON.parse(await readFile(resolve(root, 'illustrations/source-images/regeneration-prompts.json'), 'utf8'))
  const manifest = JSON.parse(await readFile(resolve(root, 'illustrations/manifest.json'), 'utf8'))
  if (!Array.isArray(registry.images) || !Array.isArray(manifest.images)) throw new Error('Invalid illustration registry or manifest.')
  const selected = ids.length ? registry.images.filter(image => ids.includes(image.id)) : registry.images
  for (const id of ids) {
    if (!selected.some(image => image.id === id)) throw new Error(`Unknown replacement illustration: ${id}`)
  }

  const inputs = []
  for (const image of selected) {
    const target = manifest.images.find(item => item.id === image.id)
    const dimensions = imageDimensions(target, image.id)
    const targets = imageTargets(root, target, image.id)
    const data = await masterData(root, image.master)
    inputs.push({ id: image.id, data, ...dimensions, minimumSize: Math.max(dimensions.width, dimensions.height), targets })
  }
  if (new Set(inputs.flatMap(input => input.targets.map(target => target.path))).size !== inputs.reduce((count, input) => count + input.targets.length, 0)) {
    throw new Error('Selected illustrations have duplicate output paths.')
  }
  if (!inputs.length) return { ids: [], files: [] }
  const outputs = await renderResponsiveImages(inputs)
  return { ids: selected.map(image => image.id), files: await writeImageOutputs(outputs) }
}
