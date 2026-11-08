import { defineConfig, devices } from '@playwright/test';

/**
 * UI020-005：Preview 只读拦截测试。
 *
 * readonly-dev   = 开发服务器，VITE_USE_MOCK=true（Mock 数据）
 * readonly-built = 已构建的 dist（Vite production mode，VITE_USE_MOCK=false）
 *
 * built 项目会拦截所有真实 API/外部主机请求，测试只验证构建产物的只读网络层，
 * 不会访问真实 Render/Supabase。
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /(ui020-preview-readonly|ui020-preview-native-form|ui020-preview-visibility-built)\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'readonly-dev',
      use: { ...devices['Desktop Edge'], channel: 'msedge', baseURL: 'http://127.0.0.1:5173' },
    },
    {
      name: 'readonly-built',
      use: { ...devices['Desktop Edge'], channel: 'msedge', baseURL: 'http://127.0.0.1:4173' },
    },
    {
      name: 'readonly-missing-mock',
      use: { ...devices['Desktop Edge'], channel: 'msedge', baseURL: 'http://127.0.0.1:5181' },
    },
  ],
  webServer: [
    {
      command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 90_000,
      env: { VITE_USE_MOCK: 'true' },
    },
    {
      command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'npx vite --mode ui020-missing-mock --host 127.0.0.1 --port 5181 --strictPort',
      url: 'http://127.0.0.1:5181',
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
