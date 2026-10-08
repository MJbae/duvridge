import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: /(?:reading|narration)\.spec\.ts/,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results/reading',
  use: { baseURL: 'http://127.0.0.1:4184/bae-memoir/', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    {
      name: 'small-phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 320, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4184',
    url: 'http://127.0.0.1:4184/bae-memoir/',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      SITE_BASE: '/bae-memoir/',
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_AUTH_DOMAIN: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_APP_ID: '',
    },
  },
})
