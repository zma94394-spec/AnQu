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
app.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      data: {
        status: 'ok',
        db: 'up',
        db_latency_ms: Date.now() - startedAt,
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
