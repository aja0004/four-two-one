import { defineConfig, devices } from '@playwright/test';

const CHROME_PATH =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export default defineConfig({
  testDir: './tests/cujs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 390, height: 844 }, // iPhone 14/15 viewport
    launchOptions: {
      executablePath: process.env.CI ? undefined : CHROME_PATH,
    },
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command: 'npx next dev --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
