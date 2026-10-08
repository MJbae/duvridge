import { fileURLToPath } from 'node:url'
import { createReaderConfig } from '@duvridge/reader-core/config.mts'
import catalog from './generated/catalog.json'

export default createReaderConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  catalog,
  siteNames: { '/novels/': 'ToldLife Novels' },
})
