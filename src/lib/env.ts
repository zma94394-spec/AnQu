import 'dotenv/config';
import { z } from 'zod';

/**
 * 环境变量校验：进程启动即校验，缺失或非法直接退出（fail fast），
 * 避免运行到一半才因配置缺失而 500。
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL 必填'),
  DIRECT_URL: z.string().min(1).optional(),

  SUPABASE_URL: z.string().url('SUPABASE_URL 必须是合法 URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY 必填'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  · ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // 使用 console.error 而非 logger，保证在任何 logger 初始化前都能输出
  console.error(`[env] 环境变量校验失败：\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';

/**
 * CORS 白名单。返回值语义对应 `cors` 包的 `origin` 选项：
 *   · `string[]` —— 仅允许列表内的来源
 *   · `true`     —— 回显请求的 Origin（等价于"接受任意来源"）
 *   · `false`    —— 仅同源
 *
 * ⚠️ 关于 `CORS_ORIGIN=*`：这里刻意返回 `true`（回显 Origin），
 *    而**不是**字符串 `'*'`。
 *
 *    原因：`server.ts` 的 cors 配置带了 `credentials: true`，
 *    而浏览器规范禁止 `Access-Control-Allow-Origin: *` 与凭证同时生效 ——
 *    若返回字面量 `*`，浏览器会直接拒绝该响应，前端表现为 NETWORK_ERROR，
 *    而后端日志一切正常，极难定位。回显 Origin 则与 credentials 兼容。
 *
 * 安全性说明：本 API 的鉴权完全依赖 `Authorization: Bearer`（不使用 Cookie）。
 *    恶意站点既读不到本域下的 localStorage，也无法凭 CORS 取得用户身份，
 *    因此"开放 CORS"在这里不构成越权风险，只是允许任意站点调用公开接口。
 *    如需收紧，把 CORS_ORIGIN 改为逗号分隔的域名列表即可。
 */
export const corsOrigins: string[] | boolean = (() => {
  const list = env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.includes('*')) {
    if (isProd) {
      console.warn(
        '[env] CORS_ORIGIN=* —— 已开放任意来源访问（回显请求 Origin）。' +
          '如需收紧，请改为逗号分隔的域名列表。',
      );
    }
    return true;
  }

  // 显式设成空串属于误配置：空白名单等于谁都不放行，
  // 表现为前端全部 NETWORK_ERROR 而后端毫无异常日志。按"未配置"处理并告警。
  if (list.length === 0) {
    console.warn('[env] CORS_ORIGIN 为空，已按"接受任意来源"处理；如需限制请填写域名列表');
    return true;
  }

  return list;
})();
