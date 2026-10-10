import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'reader-fonts.spec.ts',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  outputDir: 'test-results/fonts',
  use: { baseURL: 'http://127.0.0.1:4396', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'webkit-phone', use: { browserName: 'webkit', viewport: { width: 390, height: 844 } } },
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: 'python3 scripts/assemble-toldlife-pages.py --skip-build --video-media none --output .deploy/font-browser && node scripts/serve-pages.mjs .deploy/font-browser 4396',
    url: 'http://127.0.0.1:4396/',
    reuseExistingServer: false,
    timeout: 120000,
  },
})
