import { bookSource, imageData, imageDimensions, imageTargets, localAssetPath, publicAssetPath, renderResponsiveImages, writeImageOutputs } from './asset-files.mjs'

/** Build responsive cover copies from the book's approved source artwork. */
export async function buildCoverAssets({ source, book }) {
  const root = bookSource(source, book)
  const dimensions = imageDimensions(book.cover, 'cover')
  const targets = imageTargets(root, book.cover, 'cover')
  const approvedSource = book.assets?.coverSource
  const sourceFile = approvedSource
    ? (approvedSource.startsWith('/') ? publicAssetPath(root, approvedSource) : localAssetPath(root, approvedSource))
    : publicAssetPath(root, book.sharing?.image?.src)
  if (targets.some(target => target.path === sourceFile)) throw new Error('Cover output must not overwrite its approved source.')
  const data = await imageData(sourceFile)
  const outputs = await renderResponsiveImages([{ id: 'cover', data, ...dimensions, crop: 'full-width', targets }])
  return { sourceFile, files: await writeImageOutputs(outputs) }
}
