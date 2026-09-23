import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env, corsOrigins, isProd } from './lib/env.js';
import { disconnectPrisma, prisma } from './lib/prisma.js';
import { optionalAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import apiRoutes from './routes/index.js';

const app = express();

/* ---------------------------------------------------------------- 基础加固 */
// 位于 Nginx / 云负载均衡之后时必须设置，否则限流会把所有请求识别为同一 IP。
// 这里固定为 1（单层代理），不要使用 true（表示信任任意层，可被伪造 X-Forwarded-For 绕过限流）。
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    // 纯 JSON API，无需 CSP；由前端站点自行设置
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86_400,
  }),
);

// 限制请求体体积：改枪码最长 2048 字符，64kb 余量充足，可抵御大包攻击
app.use(express.json({ limit: '64kb' }));

/* ---------------------------------------------------------------- 鉴权上下文 */
// 全局可选鉴权：解析 Bearer Token 并注入 req.user（未登录时为 null）。
// 具体接口再通过 requireAuth 决定是否强制登录。
app.use(optionalAuth);

/* ---------------------------------------------------------------- 访问日志 */
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const cost = Date.now() - startedAt;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ` +
        `${res.statusCode} ${cost}ms`,
    );
  });
  next();
});

/* ---------------------------------------------------------------- 健康检查 */

/**
 * 建库脚本应当创建的核心关系（表与视图）。
 *
 * 为什么健康检查要查这个：原来的 `/health` 只跑 `SELECT 1`，
 * 那只能证明"连得上数据库"—— **一个完全空白的库同样返回 ok**。
 * 线上就出现过「/health 200 一切正常，但所有业务接口 500」的情况，
 * 排查时只能逐个接口试探，绕了一大圈。
 */
const REQUIRED_RELATIONS = [
  'gun_categories',
  'guns',
  'builds',
  'comments',
  'build_likes',
  'profiles',
  'v_builds_feed',
  'v_category_stats',
] as const;

interface SchemaStatus {
  ok: boolean;
  missing: string[];
}

async function checkSchema(): Promise<SchemaStatus> {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = ANY(${[...REQUIRED_RELATIONS]})
  `;

  const found = new Set(rows.map((row) => row.name));
  const missing = REQUIRED_RELATIONS.filter((name) => !found.has(name));

  return { ok: missing.length === 0, missing };
}

/**
 * 存活探针（liveness）。进程活着 + 数据库连得上就返回 200。
 *
 * ⚠️ 刻意**不**因为架构缺失而返回 5xx：存活探针一旦失败，
 * 部署平台会重启实例甚至回滚部署，反而让排查更困难。
 * 架构缺失属于「就绪」问题，交给 `/ready` 表达。
 * 但状态会如实写进响应体，一眼就能看出问题。
 */
app.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - startedAt;

    let schema: SchemaStatus;
    try {
      schema = await checkSchema();
    } catch (err) {
      // 连 pg_class 都查不了，说明权限或连接有问题，如实上报而不是假装健康
      schema = { ok: false, missing: ['(pg_class 查询失败)'] };
      console.error('[health] 架构自检失败', err);
    }

    res.json({
      success: true,
      data: {
        status: schema.ok ? 'ok' : 'schema_missing',
        db: 'up',
        db_latency_ms: dbLatency,
        schema: schema.ok ? 'ok' : 'missing',
        ...(schema.ok ? {} : { missing_relations: schema.missing }),
        env: env.NODE_ENV,
        uptime_s: Math.round(process.uptime()),
      },
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      error: { code: 'DB_DOWN', message: '数据库不可达' },
      data: { status: 'degraded', db: 'down' },
    });
    console.error('[health] 数据库探测失败', err);
  }
});

/**
 * 就绪探针（readiness）。架构不完整即 503 ——
 * 此时实例不应接收业务流量，因为所有数据接口必然 500。
 *
 * 部署平台若支持区分存活/就绪，请把就绪探针指向这里。
 */
app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const schema = await checkSchema();

    if (!schema.ok) {
      res.status(503).json({
        success: false,
        error: {
          code: 'SCHEMA_NOT_READY',
          message:
            '数据库架构不完整，建库脚本可能未执行或执行失败。' +
            '请按 01_schema → 03_functions → 02_rls → 04_seed 的顺序重新执行。',
          details: { missing_relations: schema.missing },
        },
      });
      return;
    }

    res.json({ success: true, data: { status: 'ready' } });
  } catch (err) {
    res.status(503).json({
      success: false,
      error: { code: 'DB_DOWN', message: '数据库不可达' },
    });
    console.error('[ready] 探测失败', err);
  }
});

/* ---------------------------------------------------------------- 业务路由 */
app.use('/api', apiRoutes);

/* ---------------------------------------------------------------- 兜底 */
app.use(notFoundHandler);
app.use(errorHandler);

/* ---------------------------------------------------------------- 启动 */
const server = app.listen(env.PORT, () => {
  console.log(`[server] 暗区突围 · 改枪码分享站 API 已启动`);
  console.log(`[server] http://localhost:${env.PORT}  (${env.NODE_ENV})`);
});

/* ---------------------------------------------------------------- 优雅退出 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] 收到 ${signal}，开始优雅退出…`);

  // 停止接收新连接，等待在途请求完成（最长 10s）
  const forceTimer = setTimeout(() => {
    console.warn('[server] 超时强制退出');
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  server.close(async () => {
    await disconnectPrisma();
    console.log('[server] 已关闭 HTTP 服务与数据库连接');
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[process] 未处理的 Promise 拒绝：', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] 未捕获异常：', err);
  void shutdown('uncaughtException');
});

export { app, server };
