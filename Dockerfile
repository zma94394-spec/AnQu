# ============================================================================
#  暗区突围 · 改枪码分享站  ——  后端 API 镜像
#
#  构建：docker build -t anqu-api .
#  运行：docker run --env-file .env -p 3000:3000 anqu-api
#
#  适用于 Render / Railway / Fly.io / 自建 VPS。
# ============================================================================

# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- 构建阶段
FROM node:22-alpine AS build
WORKDIR /app

# ⚠️ Prisma 的查询引擎是原生二进制，依赖 libssl。
#    Alpine 默认不带 openssl，漏装会在**启动时**才报
#    "Unable to require libquery_engine... Error loading shared library libssl.so"，
#    构建阶段完全看不出问题 —— 这是 Prisma + Alpine 最经典的坑。
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# 先 generate 再 build：tsc 需要 @prisma/client 的类型定义
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------- 运行阶段
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl \
 && addgroup -S app \
 && adduser -S app -G app

ENV NODE_ENV=production

# 直接复用构建阶段的 node_modules：其中已包含 prisma generate 的产物。
# 若在运行阶段重新 `npm ci --omit=dev && npx prisma generate`，
# prisma CLI 属于 devDependency，还得额外把它带进来，反而多一层不确定性。
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# 非 root 运行：容器被攻破时降低影响面
USER app

EXPOSE 3000

# 用 node 内置 fetch 探活，避免为了 curl 再装一个包
# start-period 给 15s：Prisma 首次连接池预热需要时间
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 直接 node 启动（不经 npm），保证 SIGTERM 直达进程 ——
# server.ts 里注册了 SIGTERM 优雅退出，中间多一层 npm 会让信号丢失，
# 部署平台滚动更新时就会出现"请求被硬切断"。
CMD ["node", "dist/server.js"]
