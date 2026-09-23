import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    rollupOptions: {
      output: {
        /**
         * 把体积大且极少变动的依赖拆成独立 chunk。
         *
         * 不减少首屏字节数，但显著改善缓存命中：应用代码每次发版都会变，
         * 而 react / supabase 这些 vendor 代码几周才动一次 ——
         * 拆开后用户发版时只需重新下载应用代码那一小块。
         */
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },

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
