import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('找不到 #root 挂载点，请检查 index.html');
}

createRoot(container).render(
  <StrictMode>
    {/* BrowserRouter 走真实的 History API，因此 /builds/:id 这类深链
        在开发期由 Vite 的 SPA fallback 处理；生产环境需要
        在反向代理上配置「未命中静态文件则回落到 index.html」。 */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
