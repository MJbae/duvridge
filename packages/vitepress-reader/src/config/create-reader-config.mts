import { defineConfig, type MarkdownOptions, type UserConfig } from 'vitepress'
import { loadEnv, searchForWorkspaceRoot } from 'vite'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { episodeIllustrations } from '../markdown/render-episode-illustrations.ts'
import { episodeContext } from '../markdown/render-episode-context.ts'
import type { ReaderCatalog, Cover, Sharing } from '@duvridge/content-processing/types'
import { coverImageSizes, episodeImageSizes, imagePreload } from '@duvridge/reader-ui/images/create-image-sources.mjs'
import { copyReaderFonts, readerFontsPlugin, type ReaderFontAssets } from '@duvridge/reader-ui/fonts/reader-fonts.mjs'
import { readingFontPreloadScript } from '@duvridge/reader-ui/fonts/font-head.mjs'
import { readingSettingsBootstrap } from '@duvridge/reader-ui/state/reading-settings.mjs'

/** An address from an earlier site layout and the page that now answers it. */
export type MovedPage = { from: string; to: string }

/**
 * Pages once published in `folder` as `{page}.html` (or without the extension) and the page in the
 * work's home folder that replaced each; an empty target is the work home itself.
 */
export function formerPageRules({ folder, home, pages }: { folder: string; home: string; pages: Record<string, string> }): MovedPage[] {
  return Object.entries(pages).flatMap(([page, target]) => [
    { from: `${folder}${page}.html`, to: `${home}${target}` },
    { from: `${folder}${page}`, to: `${home}${target}` },
  ])
}

type SeriesSharing = Sharing & { images?: Partial<Record<'original' | 'video', Sharing['image']>> }
type ReaderMetadata = { work: ReaderCatalog['work'] & { cover: Cover; sharing: SeriesSharing } }

type ReaderConfigOptions = {
  root: string
  defaultBase?: string
  defaultOrigin: string
  catalog: Partial<ReaderCatalog> & ReaderMetadata
  catalogs?: Record<string, ReaderCatalog & ReaderMetadata>
  /** The service's series selects its preview independently of the deployment base. */
  series?: string
  siteNames?: Record<string, string>
  configureMarkdown?: NonNullable<MarkdownOptions['config']>
  /** Fills in a service's own page kinds before the shared metadata is written. */
  preparePage?: (pageData: Parameters<NonNullable<UserConfig['transformPageData']>>[0]) => void
  /** Earlier addresses this build replaces; the deployment turns the list into permanent redirects. */
  movedPages?: (context: { base: string; work: string }) => MovedPage[]
  themeConfig?: Record<string, unknown>
  fonts?: ReaderFontAssets
}

/** One reading/metadata configuration; services add their own Markdown features. */
export function createReaderConfig({ root, catalog, catalogs, series, defaultBase = '/', defaultOrigin, siteNames = {}, configureMarkdown, preparePage, movedPages, themeConfig, fonts }: ReaderConfigOptions) {
  const sharedRoot = fileURLToPath(new URL('../../', import.meta.url))
  const env = loadEnv(process.env.NODE_ENV || 'production', root, '')
  const base = process.env.SITE_BASE || env.SITE_BASE || defaultBase
  const workTitle = catalog.work.title
  const siteName = siteNames[base] || (series && siteNames[`/${series}/`]) || workTitle
  const siteDescription = catalog.work.sharing.description
  const siteOrigin = process.env.SITE_ORIGIN || env.SITE_ORIGIN || defaultOrigin


  return defineConfig({
    lang: 'ko-KR',
    title: workTitle,
    titleTemplate: `:title · ${workTitle}`,
    description: siteDescription,
    base,
    ...(process.env.SITE_OUT_DIR ? { outDir: path.resolve(process.env.SITE_OUT_DIR) } : {}),
    lastUpdated: false,
    cleanUrls: true,
    appearance: false,
    themeConfig,
    head: [
      ['script', {}, "try{const m=localStorage.getItem('family-library:theme');if(['auto','light','dark'].includes(m))document.documentElement.dataset.theme=m}catch(e){}"],
      ['script', {}, readingSettingsBootstrap()],
      ['meta', { name: 'theme-color', content: '#111318' }],
      ['meta', { name: 'color-scheme', content: 'light dark' }],
      [
        'meta',
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      ...(fonts?.head.filter(([, attributes]) => attributes.rel !== 'preload') ?? []),
      ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
      ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${base}favicon-32.png` }],
      ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}apple-touch-icon.png` }],
      ['link', { rel: 'manifest', href: `${base}site.webmanifest` }],
      ['meta', { name: 'application-name', content: siteName }],
      ['meta', { name: 'apple-mobile-web-app-title', content: siteName }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:locale', content: 'ko_KR' }],
      ['meta', { property: 'og:site_name', content: siteName }],
    ],
    markdown: {
      headers: { level: [2, 3] },
      // 원고의 일반 Markdown과 사진을 지원하며 임의 HTML 실행은 허용하지 않습니다.
      config(md) {
        md.set({ html: false })
        md.use(episodeIllustrations, { base, images: catalog.illustrations || {}, works: catalogs })
        md.use(episodeContext)
        configureMarkdown?.(md)
      },
    },
    vite: {
      plugins: fonts ? [readerFontsPlugin(fonts.directory)] : [],
      envDir: root,
      server: { fs: { allow: [searchForWorkspaceRoot(root), sharedRoot] } },
      build: { chunkSizeWarningLimit: 650 },
    },
    transformPageData(pageData) {
      const selected = catalogs?.[String(pageData.frontmatter.workId || '')]
      const activeCatalog = selected ?? catalog
      const workTitle = activeCatalog.work.title
      const siteDescription = activeCatalog.work.sharing.description
      const sharing = activeCatalog.work.sharing
      const share = sharing.images?.[series === 'videos' ? 'video' : 'original'] ?? sharing.image
      const shareImage = new URL(`${base}${share.src.replace(/^\//, '')}`, siteOrigin).href
      const shareImageAlt = share.alt
      preparePage?.(pageData)
      const isHome = pageData.frontmatter.layout === 'home'
      // Every series names a work home after the work itself.
      const title = pageData.frontmatter.formatRoot || isHome ? workTitle
        : String(pageData.frontmatter.shareTitle || `${pageData.title} · ${workTitle}`)
      // The client reads PageData.titleTemplate; the static head reads frontmatter.
      pageData.titleTemplate = false
      pageData.frontmatter.titleTemplate = false
      pageData.title = title
      const description = isHome
        ? siteDescription
        : String(pageData.frontmatter.description || siteDescription)
      const relative = pageData.relativePath
        .replace(/(^|\/)index\.md$/, '$1')
        .replace(/\.md$/, '')
      // A series root belongs to the platform home, which opens on that series' tab.
      const formatRoot = Boolean(pageData.frontmatter.formatRoot)
      const redirectTo = formatRoot
        ? `/?tab=${base.replaceAll('/', '')}`
        : pageData.frontmatter.redirect ? `${base}${String(pageData.frontmatter.redirect).replace(/^\//, '')}` : ''
      const url = new URL(formatRoot ? '/' : redirectTo || `${base}${relative}`, siteOrigin).href
      pageData.description = description
      pageData.frontmatter.description = description
      pageData.frontmatter.head ??= []
      if (fonts && !redirectTo) {
        const preload = fonts.head.filter(([, attributes]) => attributes.rel === 'preload')
        if (series === 'novels' && !isHome) {
          pageData.frontmatter.head.push(['script', {}, readingFontPreloadScript(fonts.manifest)],
            ...preload.filter(([, attributes]) => attributes.href?.includes('ui-600.')))
        } else pageData.frontmatter.head.push(...preload)
      }
      pageData.frontmatter.head.push(
      ['meta', { property: 'og:image', content: shareImage }],
      ['meta', { property: 'og:image:secure_url', content: shareImage }],
      ['meta', { property: 'og:image:type', content: share.type || 'image/png' }],
      ['meta', { property: 'og:image:width', content: String(share.width) }],
      ['meta', { property: 'og:image:height', content: String(share.height) }],
      ['meta', { property: 'og:image:alt', content: shareImageAlt }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:image', content: shareImage }],
      ['meta', { name: 'twitter:image:alt', content: shareImageAlt }]
      )
      if (isHome) {
        const cover = activeCatalog.work.cover
        pageData.frontmatter.head.push(imagePreload(cover.webpSources?.length ? cover.webpSources : cover.sources,
          base, coverImageSizes, cover.webpSources?.length ? 'image/webp' : 'image/jpeg'))
      } else if (pageData.frontmatter.kind === 'episode') {
        const images = activeCatalog.illustrations || {}
        const episodeImages = images[String(pageData.frontmatter.episodeId)] ?? []
        const first = episodeImages.find(image => image.representative) ?? episodeImages[0]
        if (first) {
          pageData.frontmatter.head.push(imagePreload(first.webpSources?.length ? first.webpSources : first.sources,
            base, episodeImageSizes, first.webpSources?.length ? 'image/webp' : 'image/jpeg'))
        }
      }
      if (redirectTo) {
        pageData.frontmatter.redirectTo = redirectTo
        pageData.frontmatter.head.push(
          ['script', {}, `location.replace(${JSON.stringify(redirectTo)}+location.hash)`],
          ['meta', { 'http-equiv': 'refresh', content: `0;url=${redirectTo}` }]
        )
      }
      pageData.frontmatter.head.push(
        ['link', { rel: 'canonical', href: url }],
        ['meta', { property: 'og:title', content: title }],
        ['meta', { property: 'og:description', content: description }],
        ['meta', { property: 'og:url', content: url }],
        ['meta', { name: 'twitter:title', content: title }],
        ['meta', { name: 'twitter:description', content: description }]
      )
    },
    async buildEnd({ outDir }) {
      if (fonts) await copyReaderFonts(fonts.directory, outDir)
      const works = Object.values(catalogs ?? { single: catalog }).map(entry => ({
        id: entry.work.id, legacyRoot: entry.work.legacyRoot, title: entry.work.title, cover: entry.work.cover,
        // The films made from the work, for the platform home's video tab.
        films: (entry.work.films ?? []).map(film => ({ id: film.id, title: film.title, card: film.card, poster: film.poster })),
        legacyIds: entry.legacyIds ?? {}, episodes: entry.readingOrder?.map(episode => ({ id: episode.id, label: episode.label,
          recorded: Boolean((entry as ReaderCatalog & { narration?: Record<string, unknown> }).narration?.[episode.id]) })) ?? [],
      }))
      writeFileSync(path.join(outDir, 'work-index.json'), JSON.stringify(works) + '\n')
      const pages = Object.values(catalogs ?? { single: catalog }).flatMap(entry => movedPages?.({ base, work: entry.work.id }) ?? [])
      writeFileSync(path.join(outDir, 'moved-pages.json'), `${JSON.stringify({ version: 1, pages }, null, 2)}\n`)
    },
  })

}
