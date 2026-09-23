import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    // 开发期把 /api 代理到 Express 后端，前端代码里只写相对路径，
    // 既避免 CORS 预检，也让生产环境（同域反向代理）无需改代码。
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
