// ============================================================================
//  暗区突围 · 改枪码分享站  ——  PM2 进程配置（VPS / 自建服务器）
//
//  用法：
//    npm ci && npx prisma generate && npm run build
//    pm2 start ecosystem.config.cjs --env production
//    pm2 save && pm2 startup        # 开机自启
//
//  更新：
//    git pull && npm ci && npx prisma generate && npm run build && pm2 reload anqu-api
//
//  ⚠️ 文件后缀是 .cjs —— 根 package.json 声明了 "type": "module"，
//     用 .js 会被当成 ESM 解析，而 PM2 的配置文件需要 CommonJS。
// ============================================================================

module.exports = {
  apps: [
    {
      name: 'anqu-api',
      script: 'dist/server.js',

      // ---------------------------------------------------------------- 进程模型
      // cluster 模式让多进程共享同一端口（Node cluster 的端口复用），
      // 无需在前面再挂一层 Nginx 做负载均衡。
      exec_mode: 'cluster',

      // ⚠️ 不要图省事写成 'max'。每个 worker 都会各自建立 Prisma 连接池，
      //    Supabase 免费版的连接数上限很低，实例数 × connection_limit
      //    一旦超过上限就会开始随机报 "too many clients already"。
      //    当前配置：2 实例 × connection_limit=1 = 2 条连接，留足余量。
      //    要扩容时先算连接数，再调 instances。
      instances: 2,

      // ---------------------------------------------------------------- 生命周期
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '400M',

      // ⚠️ 必须大于应用自身的优雅退出时限（server.ts 里是 10s）。
      //    否则 PM2 会在请求还没处理完时就 SIGKILL，滚动更新期间用户会看到
      //    连接被重置。这里给到 15s。
      kill_timeout: 15000,

      // 应用没有实现 process.send('ready')，因此不能用 wait_ready，
      // 只能靠固定等待来判断启动完成。
      listen_timeout: 10000,

      // ---------------------------------------------------------------- 日志
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: './logs/out.log',
      error_file: './logs/error.log',

      // ---------------------------------------------------------------- 环境变量
      // 敏感值（DATABASE_URL、SUPABASE_*）不要写在这里 ——
      // 本文件会进版本库。让 PM2 从 .env 读取：
      //   set -a && source .env && set +a && pm2 start ...
      // 或在启动前 export。
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
