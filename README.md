# 暗区突围 · 改枪码分享站 —— 数据库架构与 API 服务

面向《暗区突围》改枪码分享场景的完整后端方案：**PostgreSQL(Supabase) 数据模型 + RLS 安全策略 + Express/Prisma API 服务**。

技术选型上采取「两者兼得」的策略：数据库托管在 Supabase（获得 Auth、RLS、PostgREST、实时订阅等能力），
但业务读写统一经由 Express + Prisma 直连数据库（获得复杂的多条件排序、聚合与事务能力）。
两套通道共享同一份表结构与安全模型，互不冲突。

---

## 1. 目录结构

```
anqu/
├── db/
│   ├── 00_auth_shim.sql     auth 基础设施垫片（仅自建/本地环境，Supabase 请跳过）
│   ├── 01_schema.sql        表结构：扩展、枚举、字典表、主表、约束、索引、触发器
│   ├── 02_rls.sql           行级安全策略 + 列级授权（Supabase 安全模型）
│   ├── 03_functions.sql     评分函数、RPC（原子计数）、聚合视图
│   ├── 04_seed.sql          种子数据：6 大分类 + 59 把枪械 + 6 个改枪方案
│   └── seed_presets.json    同源 JSON Mock 数据（前端无后端环境联调用）
├── prisma/
│   └── schema.prisma        ORM 模型（类型映射，非 DDL 真源）
├── src/
│   ├── server.ts            应用入口：加固、鉴权上下文、日志、健康检查、优雅退出
│   ├── routes/              路由定义（URL → 中间件 → 控制器）
│   ├── controllers/         控制器：提取校验产物、组装响应
│   ├── services/            业务逻辑：SQL 查询、RPC 调用、DTO 映射
│   ├── schemas/             zod 请求契约（单一事实来源）
│   ├── middleware/          鉴权、校验、限流、错误处理
│   ├── lib/                 env 校验、Prisma 单例、Supabase 客户端、错误模型
│   └── types/               Express 类型增强
├── tests/
│   └── integration.test.mjs 34 项数据库集成测试（PGlite / 真实 PG 内核）
├── scripts/
│   └── check_sql.py         SQL 语法校验（pglast，无需真实数据库）
├── web/                     前端工程（React + Tailwind v4 + Lucide，独立 package.json）
├── .env.example
├── package.json
└── tsconfig.json
```

**分层原则**：`routes`（路由与中间件编排）→ `controllers`（HTTP 语义）→ `services`（业务与数据访问）。
校验规则集中在 `schemas/`，被路由与 service 共同引用，避免「应用层放行、数据库报错」的错配。

---

## 2. 数据模型

### 2.1 ER 关系

```
gun_categories ──1:N──> guns ──1:N──> builds ──1:N──> comments
   (slug PK)          (category FK)   (gun_id FK)      (build_id FK)
                                          │
                                          └──1:N──> build_likes ──N:1──> profiles(auth.users)
                                                     (PK: build_id+user_id)
```

### 2.2 三处关键设计决策

**① 分类用字典表而非 ENUM**

`gun_categories` 作为独立字典表，`guns.category` 外键指向其 `slug`。
理由：游戏版本更新可能新增分类（如"轻机枪"），字典表只需 `INSERT` 一行；
而 PostgreSQL 的 `ALTER TYPE ... ADD VALUE` 在事务中受限、且无法回滚，运维成本更高。
反观 `platform`（mobile/pc/both）与 `status` 取值域封闭，用 ENUM 换取类型安全与存储效率。

**② 计数列采用「反范式冗余 + 触发器同步」**

`builds.likes_count / copies_count / comments_count` 是冗余字段，由 `build_likes`、
`comments` 表上的 `AFTER INSERT OR DELETE` 触发器自动维护。

- 收益：列表页无需 `COUNT(*)` 子查询或 `JOIN` 聚合，`ORDER BY likes_count DESC` 可直接命中索引；
- 代价：写入放大（一次点赞 = 1 次 INSERT + 1 次 UPDATE）；
- 权衡结论：本项目读远多于写（列表页 QPS 是点赞的数十倍），冗余是正确取舍。

配套防护：`trg_builds_protect_counters` 触发器会拦截来自 `anon`/`authenticated`
的计数列写入，确保计数只能经触发器或 RPC 变更。

**③ 生成列 `code_hash` 用于去重**

`code_hash text GENERATED ALWAYS AS (md5(code)) STORED`，配合 `(gun_id, code_hash)` 索引，
在应用层实现"同枪同码"的友好去重提示。需要严格禁止重复时，可将其升级为唯一索引
（见 `01_schema.sql` 中的注释）。

### 2.3 索引策略

| 索引 | 服务的查询场景 |
|---|---|
| `ix_builds_created (status, created_at DESC)` | `sort=latest` |
| `ix_builds_likes (status, likes_count DESC)` | `sort=hot` 的粗排 |
| `ix_builds_cost (status, estimated_cost)` | `sort=cost_asc/desc`、`min_cost/max_cost` |
| `ix_builds_gun_platform (gun_id, platform, created_at DESC)` | 枪械详情页的默认列表 |
| `ix_builds_tags GIN` | `tag=性价比` 数组包含查询 |
| `ix_builds_title_trgm GIN (gin_trgm_ops)` | `q=关键词` 模糊搜索 |
| `ix_guns_name_trgm GIN (gin_trgm_ops)` | 枪械名模糊搜索 |

> 说明：`sort=hot` 与 `sort=cost_performance` 使用含时间衰减/除法运算的表达式排序，
> 无法走索引。数据量在 10 万条以内、且 `status='published'` 的选择性足够高时，
> 先由 `ix_builds_likes` / `ix_builds_cost` 过滤再排序的性能可以接受。
> 若方案量级突破百万，应改为**物化视图 + 定时刷新评分**，或引入 Redis Sorted Set 维护榜单。

---

## 3. 部署步骤

### 3.1 建库

**Supabase 环境**（推荐）：

```bash
# 1) 在 Supabase 控制台新建项目，获取 Connection string
# 2) 复制环境变量模板
cp .env.example .env      # 填入 DATABASE_URL / DIRECT_URL / SUPABASE_*

# 3) 按依赖顺序执行 SQL（务必保持顺序：函数先于 RLS，RLS 先于种子数据）
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/01_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/03_functions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/02_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/04_seed.sql
# 或一条命令： npm run db:apply
```

**自建 PostgreSQL / 本地开发环境**：需先执行 `00_auth_shim.sql` 补齐 `auth` schema、
`auth.users` 表、`auth.uid()` 函数与 `anon` / `authenticated` / `service_role` 角色，
之后 01~04 可原样执行（**不要在 Supabase 上执行该垫片**，它会覆盖官方 `auth.uid()`）：

```bash
npm run db:apply:selfhosted
```

> 该垫片使整套方案不再绑定 Supabase：Express 侧通过
> `set_config('request.jwt.claims', ...)` 注入身份的机制与 PostgREST 完全一致，
> 因此 RLS 策略无需任何修改即可在自建 PG 上生效。

### 3.2 启动服务

```bash
npm install
npm run prisma:generate     # 生成 Prisma Client 类型
npm run dev                 # 开发模式（tsx watch）
npm run build && npm start  # 生产模式
```

启动后访问 `GET /health` 应返回 `{"success":true,"data":{"status":"ok","db":"up"}}`。

### 3.3 数据库结构变更

**本项目以 SQL 脚本为 DDL 唯一真源**。修改表结构时：

1. 改 `db/*.sql`；
2. 执行变更；
3. 跑 `npm run prisma:pull` 让 `schema.prisma` 重新对齐。

**不要使用 `prisma migrate dev`**——它会尝试反向生成 DDL，与 RLS 策略、触发器、
生成列、自定义函数冲突，可能造成策略丢失。

---

## 4. API 契约

统一响应体：

```jsonc
// 成功
{ "success": true, "data": { ... }, "pagination": { ... } }
// 失败
{ "success": false, "error": { "code": "BUILD_NOT_FOUND", "message": "改枪方案不存在或已下架" } }
```

### 4.1 `GET /api/guns` —— 获取所有枪械及其分类

| 参数 | 类型 | 说明 |
|---|---|---|
| `category` | string | 可选，按分类 slug 过滤 |
| `q` | string | 可选，按枪械名模糊搜索 |

```jsonc
{
  "success": true,
  "data": {
    "categories": [
      { "slug": "assault_rifle", "name": "突击步枪", "sort_order": 10, "gun_count": 16, "build_count": 3 }
    ],
    "guns": [
      { "id": "uuid", "name": "AKM", "slug": "akm", "category": "assault_rifle",
        "category_name": "突击步枪", "icon_url": "https://...", "build_count": 1 }
    ]
  }
}
```
缓存：`Cache-Control: public, max-age=300`。

### 4.2 `GET /api/builds` —— 分页获取改枪方案

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `page` | int | 1 | 页码 |
| `page_size` | int | 20 | 每页条数，上限 50 |
| `category` | string | — | 枪型 slug，如 `assault_rifle` |
| `platform` | enum | — | `mobile` / `pc` / `both` |
| `gun_id` | uuid | — | 指定枪械 |
| `tag` | string | — | 标签，如 `性价比` |
| `q` | string | — | 标题关键词 |
| `min_cost` / `max_cost` | int | — | 造价区间（柯恩币） |
| `sort` | enum | `latest` | 见下表 |

**排序策略定义**

| `sort` | 语义 | 排序表达式 |
|---|---|---|
| `latest` | 最新 | `created_at DESC` |
| `hot` | 最热 | `(likes*3 + copies) / (小时龄+2)^0.6 DESC` —— 时间衰减，给新方案曝光机会 |
| `cost_performance` | 性价比最高 | `(likes*2 + copies) / 造价 × 10000 DESC` —— 单位柯恩币换取的社区认可度 |
| `cost_asc` | 造价升序 | `estimated_cost ASC` |
| `cost_desc` | 造价降序 | `estimated_cost DESC` |

> `hot` 与 `cost_performance` 的权重系数集中在 `db/03_functions.sql`，
> 可通过调整函数参数统一改变全站排序口径，无需改应用代码。

```jsonc
{
  "success": true,
  "data": [ { "id": "uuid", "title": "...", "code": "...", "estimated_cost": 30000,
              "platform": "both", "tags": ["性价比"], "likes_count": 128, "copies_count": 452,
              "hot_score": 87.12, "cp_score": 213.33, "gun": { ... }, "author": { ... } } ],
  "pagination": { "page": 1, "page_size": 20, "total": 137, "total_pages": 7, "has_next": true }
}
```

### 4.3 `POST /api/builds` —— 提交新的改枪方案

请求体（`Content-Type: application/json`）：

```jsonc
{
  "gun_id": "11111111-1111-4111-8111-111111111111",
  "title": "【性价比】3万柯恩币封锁区拉满",
  "code": "3042187654921837465012938475610293847561",
  "estimated_cost": 30000,
  "platform": "both",
  "tags": ["性价比", "低后坐", "腰射"],
  "description": "建议子弹：7.62×39 BP（穿甲）或 PS（日常）"
}
```

- 成功返回 `201` + 完整方案对象（与列表项结构一致）；
- `author_id` 取自鉴权上下文，**不接受请求体传入**，防止伪造署名；
- 限流：10 分钟 20 次/IP；
- 错误码：`VALIDATION_ERROR`(400)、`INVALID_GUN_ID`(400)、`DUPLICATE_BUILD_CODE`(409)、`RATE_LIMITED`(429)。

### 4.4 `POST /api/builds/:id/copy` —— 复制次数 +1

无请求体。返回 `{ "id": "...", "copies_count": 453 }`。
实现为单条 `UPDATE ... SET copies_count = copies_count + 1 RETURNING`，
天然原子，不存在读改写竞态。

### 4.5 `POST /api/builds/:id/like` —— 点赞

双路径：

| 场景 | 行为 | 返回 |
|---|---|---|
| 携带有效 `Authorization: Bearer <jwt>` | 幂等开关：已赞则取消，未赞则点赞 | `{ "id", "liked": false, "likes_count": 127 }` |
| 无 Token | 直接累加（不去重） | `{ "id", "liked": true, "likes_count": 129 }` |

> **为什么登录用户要走 `build_likes` 表？**
> 纯 `+1` 接口在缺少去重的情况下，单个脚本即可把任意方案刷上热榜。
> `build_likes` 的 `PRIMARY KEY (build_id, user_id)` 让重复点赞天然幂等，
> 且计数由触发器同步，杜绝了「写关系表」与「改计数」两步之间的漂移。

### 4.6 附加端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/builds/:id` | 方案详情 |
| GET | `/api/builds/:id/comments` | 评论分页列表 |
| POST | `/api/builds/:id/comments` | 发表评论（需登录） |
| DELETE | `/api/comments/:id` | 删除评论（作者本人或版主） |
| GET | `/health` | 健康检查（含数据库探测） |

---

## 5. 安全模型

### 5.1 RLS 双层约束

仅靠 RLS 无法阻止「作者修改自己方案的 `likes_count`」——因为 RLS 只判断**行**的归属，
不判断**列**。因此本项目采用 RLS + 列级授权双管齐下：

```sql
-- 第一层：RLS —— 只能改自己的行
CREATE POLICY p_builds_update ON public.builds FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff())
  WITH CHECK (author_id = auth.uid() OR public.is_staff());

-- 第二层：列级授权 —— 即便命中上面的策略，也无权写计数列
REVOKE INSERT, UPDATE, DELETE ON public.builds FROM anon, authenticated;
GRANT UPDATE (title, code, estimated_cost, platform, tags, description, status)
  ON public.builds TO authenticated;
```

第三层兜底是 `trg_builds_protect_counters` 触发器，将非可信角色的计数写入回滚为旧值。

### 5.2 角色权限矩阵

| 角色 | 枪械库 | 已发布方案 | 自己的方案 | 评论 | 点赞 | 计数列 |
|---|---|---|---|---|---|---|
| `anon` | 读 | 读 | — | 读 | 仅累加 | 禁写 |
| `authenticated` | 读 | 读 | 增删改 | 读+写+删自己 | 幂等开关 | 禁写 |
| `moderator` / `admin` | 读 | 读全部状态 | 可管理他人 | 可删任意 | 同左 | 可写 |
| `service_role` / 表属主 | 全部 | 全部 | 全部 | 全部 | 全部 | 可写 |

### 5.3 生产环境检查清单

- [ ] `CORS_ORIGIN` 配置为明确的前端域名，**不得为 `*`**（`env.ts` 已对生产环境做自动降级）
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 仅存在于服务端环境变量，绝不下发到浏览器
- [ ] 反向代理后已正确设置 `app.set('trust proxy', 1)`，否则限流会误伤全部用户
- [ ] 使用 Supabase Connection Pooling（6543）作为 `DATABASE_URL`，避免连接数耗尽
- [ ] `db/` 目录中的脚本已纳入版本控制，作为 DDL 唯一真源
- [ ] 对 `POST /api/builds` 接入内容审核（改枪码为数字串，风险低；标题/说明需过滤）

---

## 6. 验证情况

### 6.1 验证结果

| 验证项 | 命令 | 结果 |
|---|---|---|
| TypeScript 类型检查 | `npm run typecheck` | 通过，0 错误（`strict` + `noUncheckedIndexedAccess`） |
| 编译构建 | `npm run build` | 通过，产出 `dist/` |
| SQL 语法校验 | `npm run check:sql` | 5 个文件共 **148 条顶层语句**全部通过 PostgreSQL 17 语法解析 |
| **数据库集成测试** | `npm run test:db` | **34 项全部通过**（PostgreSQL 18 真实内核） |
| HTTP 参数校验 | 冒烟测试 | 非法分页/排序/UUID/改枪码 → `400 VALIDATION_ERROR` + 字段级 details |
| HTTP 鉴权与兜底 | 冒烟测试 | 未登录发评论 → `401`；未知路由 → `404`；限流 → `429` |

### 6.2 集成测试覆盖范围

`tests/integration.test.mjs` 运行在 **PGlite（PostgreSQL 18 的 WebAssembly 构建）** 上——
是真实 PG 内核而非模拟器，因此 RLS、触发器、`SECURITY DEFINER`、生成列、
`security_invoker` 视图的行为与生产环境一致。共 34 项断言，覆盖：

| 分组 | 覆盖内容 |
|---|---|
| 建库完整性 | 脚本可执行性、6 张表、3 个枚举、生成列 md5 正确性、索引齐备、CHECK 约束生效 |
| 预设数据 | 3 把补充枪械分类正确；3 个预设方案的造价/平台/标签/说明逐项比对；占位码格式合法且 md5 生成列正确 |
| 触发器 | 评论增删同步 `comments_count`；`updated_at` 仅在内容变更时刷新 |
| RPC 语义 | 复制计数连续 200 次无丢失更新；`RETURNING` 返回值精确；`BUILD_NOT_FOUND` 抛出 |
| 点赞幂等 | 同一用户重复点赞只计一次；不同用户各自计数；未登录抛 `AUTH_REQUIRED` |
| RLS 安全 | 匿名读不到草稿；匿名无法提交；用户 B 改/删用户 A 方案受影响 0 行 |
| 列级授权 | 作者无法自行刷高 `likes_count` / `copies_count` |
| 排序分页 | `cost_performance` 与 `hot` 的相对顺序正确；翻页不重不漏；`cp_score` 可建表达式索引而 `hot_score` 被拒 |
| 视图 | 聚合字段正确；`security_invoker` 生效，视图不泄露草稿 |
| 外键级联 | 删除方案级联清理评论与点赞；非法 `gun_id` 被拒 |

**不覆盖**：多连接真并发（PGlite 为单连接）。该项需在真实 Supabase 实例上做多会话压测。

### 6.3 测试发现并修复的两个真实缺陷

这两个缺陷都无法通过语法检查或代码审阅发现，只有真正执行 SQL 才会暴露：

**① 聚合视图因多表 JOIN 产生笛卡尔放大**

`v_category_stats` 原先写作 `FROM gun_categories LEFT JOIN guns LEFT JOIN builds`，
而 `guns` 与 `builds` 是一对多，同一把枪有 N 个方案就会被计成 N 把枪——
测试断言「各分类枪械数之和 == 枪械总数」时得到 59 ≠ 56 才暴露
（当时的枪械总数为 56 把，59 是被放大后的错误值；与当前种子数据的 59 把无关联）。
已改为标量子查询，从根本上消除放大。

**② 生成列导致 `updated_at` 被无条件刷新**

`set_updated_at` 原先用 `to_jsonb(NEW) - 'updated_at'` 做整行快照比对。
但 PostgreSQL 有一个易踩的行为：**在 `BEFORE UPDATE` 触发器中，`STORED` 生成列在 `NEW` 里是 `NULL`**
（生成值在 BEFORE 触发器之后才计算），而 `OLD` 持有已落库的真实值。
于是 `builds.code_hash` 让每次比对都判定"有变化"，点赞也会刷新 `updated_at`。
已改为通过 `pg_attribute.attgenerated` 动态识别并排除生成列。

```bash
npm run test:db      # 34 项数据库集成测试
npm run check:sql    # 需先 pip install pglast
```

---

## 7. 已知限制与后续演进

1. **匿名点赞无法去重**：受限于无身份标识。若需严格防刷，应要求登录，
   或引入「设备指纹 + Redis 布隆过滤器」做概率去重。
2. **排序的可索引性分三种情况，不能一概而论**（已由集成测试「索引可行性」一项固化验证）：

   | sort | 底层表达式 | 能否索引 | 说明 |
   |---|---|---|---|
   | `latest` / `cost_asc` / `cost_desc` | 直接引用列 | ✅ 已建 B-tree | `ix_builds_created` / `ix_builds_cost` |
   | `cost_performance` | `build_cp_score(...)` | ✅ **可以** | 函数为 `IMMUTABLE`，可建表达式索引 |
   | `hot` | `build_hot_score(...)` | ❌ **永远不行** | 含 `now()`，只能标 `STABLE`；索引表达式要求 `IMMUTABLE` |

   > 后两行是对既有文档的**修正**。此前笼统写作"热度/性价比排序无法命中索引"，
   对性价比一项判断有误 —— 已实测：`CREATE INDEX ... build_cp_score(...)` 成功，
   而 `CREATE INDEX ... build_hot_score(...)` 被 PostgreSQL 以
   `functions in index expression must be marked IMMUTABLE` 拒绝。

   **性价比排序的候选优化**（建议方案量过 5 万行后再评估）：

   ```sql
   CREATE INDEX CONCURRENTLY ix_builds_cp_score
     ON public.builds (
       public.build_cp_score(likes_count, copies_count, estimated_cost) DESC,
       id DESC
     )
     WHERE status = 'published';
   ```

   索引列顺序与列表查询的 `ORDER BY cp_score DESC, b.id DESC` 逐项对齐，
   `WHERE` 与 `buildWhere()` 恒定注入的 `b.status = 'published'` 对齐，
   因此是一个**部分表达式索引**，只覆盖在架方案，体积显著小于全表索引。

   ⚠️ 代价：每次写 `likes_count` / `copies_count` / `estimated_cost` 都要维护该索引，
   高频点赞场景下会加剧写放大。**必须先在真实实例上用 `EXPLAIN ANALYZE` 确认收益为正再上线**，
   不能因为"能建"就默认"该建"。

   **热度排序没有索引路径**，只能换架构：物化视图 + 定时重算（分钟级延迟通常可接受），
   或 Redis ZSet 榜单（实时，但需处理与数据库的一致性）。
3. **触发器同步计数在极端并发下会成为热点行**：单个爆款方案被高频点赞时，
   `builds` 上的同一行会被串行化更新。可通过「Redis 计数 + 定时回写」缓解。
4. **评论暂不支持嵌套回复**：如需二级回复，在 `comments` 增加 `parent_id uuid REFERENCES comments(id)`
   即可，无需改动现有索引结构。
5. **单连接环境无法验证真并发**：集成测试基于 PGlite（单连接），
   已覆盖 RPC 的原子语义，但多会话竞态仍需真实实例压测。
