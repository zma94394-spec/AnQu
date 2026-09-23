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

/** CORS 白名单：支持逗号分隔的多来源；生产环境禁止通配符 */
export const corsOrigins: string[] | boolean = (() => {
  const list = env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.includes('*')) {
    if (isProd) {
      console.warn('[env] 生产环境检测到 CORS_ORIGIN=*，已自动降级为同源限制');
      return false;
    }
    return true;
  }
  return list;
})();
