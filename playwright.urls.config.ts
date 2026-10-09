import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser', testMatch: 'work-urls.spec.ts', workers: 2, fullyParallel: true,
  reporter: 'list', outputDir: '.deploy/work-url-test-results',
  use: { baseURL: 'http://127.0.0.1:4190', trace: 'retain-on-failure' },
  projects: [{ name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }, { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } }],
  webServer: { command: 'node scripts/prepare-work-url-browser-fixture.mjs && node scripts/serve-pages.mjs .deploy/work-url-fixture 4190', url: 'http://127.0.0.1:4190', timeout: 180000 },
})
