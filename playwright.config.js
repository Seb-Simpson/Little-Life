import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',
  fullyParallel:false,
  workers:1,
  timeout:30000,
  use:{locale:'en-GB',timezoneId:'Europe/London',reducedMotion:'reduce',baseURL:process.env.LITTLE_LIFE_TEST_URL||'http://127.0.0.1:5173',trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined}},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:process.env.LITTLE_LIFE_TEST_URL?undefined:[
    {command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI},
    {command:'node scripts/serve.mjs --root dist --port 5174',url:'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI},
  ],
});
