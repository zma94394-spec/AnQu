import { PrismaClient } from '@prisma/client';
import { env, isProd } from './env.js';

/**
 * Prisma 单例。
 * 开发环境下 tsx watch 会反复重载模块，若不做全局缓存会耗尽数据库连接。
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: isProd ? ['warn', 'error'] : ['query', 'warn', 'error'],
  });

if (!isProd) {
  globalForPrisma.__prisma = prisma;
}

/** 进程退出时优雅断开连接 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

// 便于排查连接目标（不打印密码）
if (!isProd) {
  try {
    const u = new URL(env.DATABASE_URL);
    console.log(`[prisma] 已连接目标：${u.hostname}:${u.port || 5432}${u.pathname}`);
  } catch {
    /* 忽略 URL 解析失败，Prisma 自身会给出更明确的报错 */
  }
}
