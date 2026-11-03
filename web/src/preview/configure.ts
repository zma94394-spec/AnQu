import { configurePreviewApiPolicy } from '../lib/apiPublic';
import { PREVIEW_DATA_MODE, PREVIEW_READ_ONLY } from './readOnly';

/**
 * Preview 入口在任何页面渲染/请求之前执行这里：
 * - readOnly 是硬编码的 true，不依赖 Vercel 环境变量；
 * - 数据源只在显式 VITE_USE_MOCK=false 时允许只读远程 GET，
 *   缺失时回落到 Mock，绝不自动回退真实 API。
 */
configurePreviewApiPolicy({
  readOnly: PREVIEW_READ_ONLY,
  useMock: PREVIEW_DATA_MODE === 'mock',
});

export { PREVIEW_DATA_MODE };
