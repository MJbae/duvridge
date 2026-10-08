import type { Theme } from 'vitepress'
import AudiobookReaderLayout from './AudiobookReaderLayout.vue'
import ResponsiveImage from '@duvridge/story-reader/components/ResponsiveImage.vue'
import './audiobook-reader.css'

export default { Layout: AudiobookReaderLayout, enhanceApp({ app }) { app.component('ResponsiveImage', ResponsiveImage) } } satisfies Theme
