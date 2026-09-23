# 上线部署指南

《暗区突围》改枪码分享站 —— 生产环境部署。

> **先读第 1 节。** 你提供的部署参数里有 4 处会直接导致上线失败或线上故障的问题，
> 已在下文逐条列出并修正。照抄原参数会卡在第一步。

---

## 1. 你提供的参数里需要修正的 4 处

### ① SQL 执行顺序错误（会直接报错，部署卡死）

你给的顺序是 `01 → 02 → 03 → 04`。**正确顺序是 `01 → 03 → 02 → 04`。**

原因是 `02_rls.sql` 引用了 `03_functions.sql` 里定义的函数，共 10 处：

| 函数 | 在 02_rls.sql 中的引用次数 | 用途 |
|---|---|---|
| `public.is_staff()` | 7 | 版主/管理员的越权策略 |
| `public.increment_build_copies()` | 1 | 复制计数的执行权限 |
| `public.increment_build_likes()` | 1 | 匿名点赞的执行权限 |
| `public.toggle_build_like()` | 1 | 登录点赞的执行权限 |

按 `01 → 02` 执行会在第二个文件就报：

```
ERROR:  function public.is_staff() does not exist
```

更麻烦的是：RLS 策略是逐条创建的，失败时已经建好一部分，
数据库处于"半套策略"状态，排查成本远高于彻底失败。

> `package.json` 里的 `db:apply` 脚本本来就是正确顺序，
> 只是文档里没强调这一点。

### ② 缺少 `SUPABASE_ANON_KEY`（必填，缺了进程直接退出）

`src/lib/env.ts` 用 zod 在启动时校验环境变量：

```ts
SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY 必填'),
```

缺失会 `process.exit(1)`，日志输出 `[env] 环境变量校验失败`。
它的用途是调用 Supabase Auth API 校验前端传来的 JWT（`auth.getUser(token)`）。

### ③ 缺少 `CORS_ORIGIN`（不配则线上前端全部调不通）

该变量有默认值 `http://localhost:5173`。生产环境不覆盖它，
浏览器会因为跨域被拦，前端所有请求失败。

另外代码里有这条保护：

```ts
if (list.includes('*')) {
  if (isProd) return false;   // 生产环境降级为"仅同源"
}
```

也就是说**生产环境写 `CORS_ORIGIN=*` 不会放开跨域，反而会收紧到仅同源**，
比不配更糟。请显式列出前端域名。

### ④ `SUPABASE_JWT_SECRET` 是多余的

全项目搜索 `JWT_SECRET` **没有任何引用**。本项目校验令牌走的是
`supabaseAuth.auth.getUser(token)`，即用 anon key 调用 Supabase Auth API，
而不是在本地用 JWT secret 验签。

留着它没有坏处，但会让你误以为需要保管一个其实用不到的密钥。建议删掉。

> 代价是每个请求多一次对 Supabase 的网络往返；好处是令牌吊销与密钥轮换
> 全部由 Supabase 负责，后端无状态。若后续要降低延迟，再引入本地验签。

### 附：`pgbooster` 拼写错误

你写的是 `?pgbooster=true`，正确参数名是 **`pgbouncer`**。

它的作用是让 Prisma 关闭预处理语句 —— 事务级连接池不支持跨语句的
prepared statement，不设置会在并发下随机报 `prepared statement ... already exists`。

另外端口要配对：`DATABASE_URL` 用连接池端口 **6543**，`DIRECT_URL` 用直连 **5432**。
两者都写 5432 会让运行时绕过连接池，实例一多就打满连接数。

---

## 2. 环境变量

模板已生成，复制后填值即可：

```bash
cp .env.example .env                    # 后端
# web/.env.production 已就绪，直接编辑占位符
```

- 后端模板：`.env.example`（含生产段与逐项说明）
- 前端模板：`web/.env.production`
- 前端速查：`web/.env.example`（含 VITE_ 变量的安全边界说明）

**安全边界**：`VITE_` 前缀的变量会被**内联进 JS 产物**，等于公开发布。
允许放 anon key（受 RLS 约束，本就设计为公开）和 API 域名；
**绝不允许**放 `SUPABASE_SERVICE_ROLE_KEY`、`DATABASE_URL` 或任何私钥。

`web/scripts/check-env.mts` 会在构建前自动拦截这类错误 ——
它会扫描所有 `VITE_` 变量名，命中 `SERVICE_ROLE` / `DATABASE_URL` / `JWT_SECRET`
等关键词就直接失败。同时也会拦截"忘记把占位符替换掉"和"生产环境开着 Mock"。

---

## 3. 数据库上线

```bash
# 交互式（会二次确认）
bash scripts/deploy_db.sh

# CI / 无人值守
bash scripts/deploy_db.sh --yes
```

脚本做的事：

1. 校验 `psql` 可用、`DIRECT_URL` / `DATABASE_URL` 已设置
2. 按 **01 → 03 → 02 → 04** 顺序执行（含 `ON_ERROR_STOP=1` 与 `--single-transaction`）
3. 打印对象数量与 RLS 开启状态供核对
4. 备份 `prisma/schema.prisma` 后执行 `npx prisma db pull`
5. 执行 `npx prisma generate`

**为什么用 `--single-transaction`**：任一文件失败则整体回滚，不会留下半套 schema。
本项目没有使用 `CREATE INDEX CONCURRENTLY`（它不支持事务），因此整体包一个事务是安全的。

**手动执行等价命令**（供参考，注意顺序）：

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 --single-transaction -f db/01_schema.sql
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 --single-transaction -f db/03_functions.sql
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 --single-transaction -f db/02_rls.sql
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 --single-transaction -f db/04_seed.sql
npx prisma db pull && npx prisma generate
```

### ⚠️ 生产 Supabase 不要执行 `00_auth_shim.sql`

那是给自建 PostgreSQL 造 `auth` schema 与 `anon` / `authenticated` / `service_role`
角色的垫片。Supabase 上这些对象已存在，重复执行会干扰平台内置对象。

### ⚠️ `db pull` 后必须复查 `code_hash`

`prisma db pull` 会**重写整个** `schema.prisma`。请确认 `Build.codeHash`
仍带 `@ignore` —— 它是数据库生成列，一旦被 Prisma 当成可写字段，
运行时会报 `cannot insert into generated column`。

### 种子数据说明

`04_seed.sql` 会写入 6 个分类 + 59 把枪械（**生产必需**，没有枪械就无法提交方案），
同时也会写入 6 个演示方案与 2 条演示评论（**非必需**）。

若要清掉演示方案（保留枪械库）：

```sql
DELETE FROM public.builds WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666'
);
-- 评论随方案级联删除
```

⚠️ 演示方案的 `code` 是 `DEMO` 前缀占位符，**不能导入游戏**。
保留它们等于向用户展示一批无效改枪码，建议上线前清理。

---

## 4. 后端部署

### 4.1 Docker（Render / Railway / Fly.io / VPS 通用）

```bash
docker build -t anqu-api .
docker run --env-file .env -p 3000:3000 anqu-api
```

`Dockerfile` 的两个关键点：

- **Alpine 必须装 `openssl`**。Prisma 的查询引擎是原生二进制，依赖 libssl；
  漏装会在**启动时**才报 `Error loading shared library libssl.so`，构建阶段完全看不出问题。
- **`CMD ["node", "dist/server.js"]` 不经 npm**。`server.ts` 注册了 SIGTERM 优雅退出，
  中间多一层 npm 会让信号丢失，滚动更新时请求被硬切断。

镜像内已包含 `/health` 探活（Dockerfile 的 `HEALTHCHECK`），
部署平台可直接用它做存活检查。

### 4.2 Render

- Type: **Web Service**
- Environment: **Docker**（自动识别根目录 `Dockerfile`）
- Health Check Path: `/health`
- Environment Variables：把 `.env` 里的键值逐条填入面板
- ⚠️ Render 会自动注入 `PORT`，不要手动覆盖

### 4.3 Railway

- 连接仓库后自动识别 `Dockerfile`
- 在 Variables 里配置环境变量（支持粘贴 `.env` 批量导入）
- 健康检查路径同样填 `/health`

### 4.4 VPS（PM2）

```bash
npm ci && npx prisma generate && npm run build

# 敏感变量不要写进 ecosystem.config.cjs（会进版本库），
# 让它从 .env 读取：
set -a && source .env && set +a

pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

配置要点见 `ecosystem.config.cjs` 内注释，两处最易踩：

- **`instances: 2` 而非 `'max'`**。每个 worker 各自建立 Prisma 连接池，
  实例数 × `connection_limit` 超过 Supabase 上限就会随机报 `too many clients already`。
- **`kill_timeout: 15000` 必须大于应用自身的 10s 优雅退出时限**，
  否则滚动更新时在途请求会被 SIGKILL。

更新流程：

```bash
git pull && npm ci && npx prisma generate && npm run build && pm2 reload anqu-api
```

> 用 `reload` 而不是 `restart`：前者是零停机滚动重启，后者会中断服务。

---

## 5. 前端部署

### 5.1 Vercel

| 配置项 | 值 |
|---|---|
| Root Directory | `web` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

`web/vercel.json` 已包含路由重写与响应头，导入仓库即生效。

### 5.2 Cloudflare Pages

| 配置项 | 值 |
|---|---|
| Root directory | `web` |
| Build command | `npm run build` |
| Build output directory | `dist` |

`web/public/_redirects` 已包含 SPA 回落规则（构建时会复制到 `dist/`）。

### 5.3 为什么必须有重写规则

项目用 `BrowserRouter`（真实 History API）。没有回落规则时：

- 首页打开正常，点击卡片跳详情也正常（客户端路由）
- **但在 `/builds/xxx` 上按 F5 会 404** —— 服务器上并不存在这个路径

规则内容是「未命中静态文件则返回 `index.html`，状态码 **200**」。
用 301/302 会让地址栏跳回 `/`，深链直接失效。

### 5.4 环境变量

在平台控制台配置（会覆盖 `.env.production`）：

```
VITE_API_BASE_URL       = https://你的后端域名
VITE_SUPABASE_URL       = https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY  = <anon-public-key>
VITE_USE_MOCK           = false
```

⚠️ `VITE_USE_MOCK` 若为 `true`，站点会完全绕过后端接口 ——
用户看到写死的演示数据，点赞与评论都不落库。构建前自检会拦住这个错误。

---

## 6. 上线后冒烟验证

```bash
API=https://你的后端域名
WEB=https://你的前端域名

# 1. 存活
curl -sS -o /dev/null -w "health  %{http_code}\n" "$API/health"

# 2. 枪械库（应返回 success:true 且 guns 非空）
curl -sS "$API/api/guns" | head -c 300; echo

# 3. 方案列表（应返回分页信封）
curl -sS "$API/api/builds?page=1&page_size=2" | head -c 300; echo

# 4. CORS 预检：把 Origin 换成你的前端域名，应回显 Access-Control-Allow-Origin
curl -sS -i -X OPTIONS "$API/api/builds" \
  -H "Origin: $WEB" \
  -H "Access-Control-Request-Method: POST" | grep -i "access-control"

# 5. 深链回落：必须 200 且返回 HTML，不能是 404
curl -sS -o /dev/null -w "deeplink %{http_code}\n" "$WEB/builds/44444444-4444-4444-8444-444444444444"

# 6. 未登录发评论应被拒（401 AUTH_REQUIRED），说明鉴权生效
curl -sS -X POST "$API/api/builds/44444444-4444-4444-8444-444444444444/comments" \
  -H 'Content-Type: application/json' -d '{"content":"smoke"}'; echo
```

浏览器侧再确认三件事：卡片上的「复制改枪码」变绿、点赞数字变化、
右上角没有 `MOCK` 标记。

---

## 7. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 进程启动即退出，日志 `[env] 环境变量校验失败` | 缺 `SUPABASE_ANON_KEY` 或 `DATABASE_URL` | 补全后重启 |
| 启动报 `Error loading shared library libssl.so` | Alpine 镜像未装 openssl | 用本仓库 `Dockerfile`（已装） |
| 报 `function public.is_staff() does not exist` | SQL 执行顺序错了 | 按 `01 → 03 → 02 → 04` 重跑 |
| 报 `prepared statement ... already exists` | 连接串缺 `?pgbouncer=true` | 改用模板里的 `DATABASE_URL` |
| 报 `too many clients already` | 实例数 × 连接数超过 Supabase 上限 | 调小 `instances` 或 `connection_limit` |
| 浏览器报 CORS 错误 | `CORS_ORIGIN` 没配或写成了 `*` | 显式列出前端域名（多个用逗号分隔） |
| 前端请求打到 `https://[YOUR-BACKEND-API-DOMAIN]` | 构建时环境变量没生效 | 平台控制台配置变量后重新部署 |
| 前端右上角显示 `MOCK` | `VITE_USE_MOCK=true` | 改为 `false` 重新构建 |
| 刷新 `/builds/xxx` 返回 404 | 缺少 SPA 回落规则 | 确认 `vercel.json` / `_redirects` 已生效 |
| 报 `cannot insert into generated column "code_hash"` | `db pull` 后 `@ignore` 丢了 | 给 `codeHash` 补回 `@ignore` |
| 复制改枪码失败 | 站点是 http，Clipboard API 不可用 | 前端已内置降级；确认浏览器允许剪贴板权限 |

---

## 8. 回滚

**后端**：镜像保留上一个 tag 即可回退。

```bash
docker build -t anqu-api:$(git rev-parse --short HEAD) .
# 出问题：docker run anqu-api:<上一个 tag>
```

PM2：

```bash
git checkout <上一个 tag> && npm ci && npx prisma generate && npm run build
pm2 reload anqu-api
```

**前端**：Vercel / Cloudflare Pages 控制台都有「Instant Rollback」，
选择上一个部署即可，无需重新构建。

**数据库**：本次上线是**首次建库**，回滚等于清空。生产数据请务必依赖
Supabase 的自动备份（Database → Backups），并在上线前手动触发一次快照。

---

## 9. 上线检查清单

- [ ] `.env` 已填全，`CORS_ORIGIN` 是真实前端域名（不是 `*`，不是 localhost）
- [ ] `DATABASE_URL` 用 6543 + `?pgbouncer=true`，`DIRECT_URL` 用 5432
- [ ] 数据库按 `01 → 03 → 02 → 04` 顺序执行，RLS 校验 `relrowsecurity` 全为 `t`
- [ ] `db pull` 后确认 `codeHash` 仍带 `@ignore`
- [ ] 已清理 `DEMO` 前缀的演示方案（否则用户拿到无效改枪码）
- [ ] 后端 `/health` 返回 200
- [ ] 前端环境变量已在平台控制台配置，`VITE_USE_MOCK` 为 `false`
- [ ] 深链 `/builds/:id` 刷新返回 200
- [ ] 浏览器无 CORS 报错，右上角无 `MOCK` 标记
- [ ] 已触发一次 Supabase 数据库快照
