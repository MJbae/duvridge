import type { Theme } from 'vitepress'
import NovelReaderLayout from './NovelReaderLayout.vue'
import ResponsiveImage from '@duvridge/reader-ui/components/ResponsiveImage.vue'
import './novel-reader.css'

export default { Layout: NovelReaderLayout, enhanceApp({ app }) { app.component('ResponsiveImage', ResponsiveImage) } } satisfies Theme
