import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import ResponsiveImage from '@duvridge/reader-core/components/ResponsiveImage.vue'
import './style.css'

export default { Layout, enhanceApp({ app }) { app.component('ResponsiveImage', ResponsiveImage) } } satisfies Theme
