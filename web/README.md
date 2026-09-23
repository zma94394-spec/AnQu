# 暗区改枪库 · 前端（Arena Builds Web）

React 18 + TypeScript + Tailwind CSS v4 + Lucide Icons，硬核战术暗黑风。

---

## 1. 启动

```bash
cd web
npm install
npm run dev        # http://127.0.0.1:5173
```

其他脚本：

```bash
npm run typecheck  # tsc --noEmit
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览构建产物
```

### 与后端联调

`web/.env.development` 默认 `VITE_USE_MOCK=true`，**不启动后端也能完整预览**，
界面右上角会显示 `MOCK` 标记。

接后端时把该值改为 `false`，请求会经 `vite.config.ts` 的 proxy 转发到
`http://127.0.0.1:3000`（后端 `npm run dev` 的默认端口）。

> 前端代码里只写相对路径 `/api/...`，因此生产环境只要把 `dist/`
> 与后端放在同一域（或反向代理 `/api`）即可，无需改代码，也没有 CORS 预检。

---

## 2. 目录结构

```
web/
├── index.html
├── vite.config.ts          开发代理 + Tailwind v4 插件
├── .env.development        VITE_USE_MOCK 开关
├── src/
│   ├── main.tsx            入口（BrowserRouter）
│   ├── App.tsx             外壳：全局字典、路由出口、轻提示、发布弹窗
│   ├── index.css           设计令牌（@theme）+ 基础层 + 动效
│   ├── pages/
│   │   ├── HomePage.tsx        列表页（筛选状态全部存在 URL 里）
│   │   └── BuildDetailPage.tsx 详情页（完整说明 + 评论区）
│   ├── types/
│   │   ├── api.ts          后端 DTO 的 TS 映射（手写对齐）
│   │   └── ui.ts           筛选值、排序选项、平台 Tab、标签词表
│   ├── lib/
│   │   ├── api.ts          类型化客户端 + 统一信封解包 + Mock 实现
│   │   ├── queryParams.ts  列表筛选状态 <-> URL search params
│   │   ├── appShell.ts     外壳 context（字典、通知、发布入口）
│   │   ├── clipboard.ts    剪贴板写入（含非安全上下文降级）
│   │   ├── validation.ts   发布表单校验（逐条镜像后端 zod 规则）
│   │   ├── format.ts       金额 / 计数 / 相对时间格式化
│   │   └── cn.ts           className 拼接
│   ├── hooks/
│   │   ├── useBuildsFeed.ts 列表数据源（含竞态守卫）
│   │   ├── useCopyCode.ts   改枪码复制交互（降级 + 计数上报 + 2s 复位）
│   │   └── useLikeBuild.ts  点赞交互（乐观更新 + 失败回滚）
│   ├── mocks/
│   │   └── seed.ts         内置演示数据（评分按后端公式本地重算）
│   ├── scripts/
│   │   ├── check-validation-parity.mts  前后端校验一致性检查
│   │   └── check-mocks.mts              Mock 数据有效性检查
│   └── components/
│       ├── Header.tsx          Logo + 全局搜索 + 平台 Tabs + 发布按钮
│       ├── FilterBar.tsx       分类 Pills + 排序（桌面 Tabs / 移动下拉）
│       ├── BuildCard.tsx       方案卡片（改枪码复制为核心交互）
│       ├── PublishDialog.tsx   发布方案弹窗（含可搜索枪械选择器）
│       ├── CommentSection.tsx  评论列表 + 发表
│       └── States.tsx          骨架屏 / 空态 / 错误态
```

> `scripts/` 实际位于 `web/scripts/`，缩进仅用于示意归属。

## 2.1 路由

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | `HomePage` | 列表。筛选状态全部在 URL 里 |
| `/builds/:id` | `BuildDetailPage` | 详情 + 评论 |
| `*` | 内置 404 | 引导回首页 |

**筛选状态放在 URL 而不是组件 state**，理由是：

1. 改枪码分享站的用户会把「筛选后的列表」链接发给队友，状态必须在 URL 里；
2. 浏览器前进/后退能正常回到上一个筛选条件；
3. Header 的搜索框在详情页也能用 —— 提交后跳到 `/?q=...` 即可，不需要给每个页面单独接线。

约定：**默认值一律不写入 URL**。`/?platform=pc&sort=hot` 比
`/?q=&platform=pc&category=all&sort=hot&page=1` 好得多。

筛选变更默认用 `replace`（避免点分类把历史记录刷满），**翻页例外用 push**
（"后退"回到上一页符合直觉）。

> 生产部署注意：`BrowserRouter` 走真实 History API，
> 反向代理需配置「未命中静态文件则回落到 `index.html`」，否则刷新
> `/builds/xxx` 会 404。

---

## 3. 三个核心组件

### `Header.tsx`

- 左侧品牌区：`Crosshair` 图标 + 「暗区改枪库 / Arena Builds」
- 中间全局搜索：受控输入，实际防抖在 `App` 层（320ms），支持 `Ctrl/⌘ + K` 聚焦
- 右侧平台分段控件 `[全部] [手游] [PC端游]` + 高亮「+ 发布方案」按钮
- 响应式：窄屏时搜索框与平台 Tab 折到第二、三行，搜索框保持整行宽度

### `FilterBar.tsx`

- 分类 Pills 来自 `GET /api/guns` 的 `categories`，**不是前端硬编码**，
  因此后端新增分类（如「轻机枪」）前端零改动即可出现；每个 Pill 带方案数角标
- 排序：桌面端为图标 Tab，移动端为原生 `<select>`
  （原生弹层不会有定位与遮挡问题，比自绘下拉更稳）
- 底部一行展示结果总数与当前排序口径，避免用户猜「性价比」怎么算

### `BuildCard.tsx`

头部（枪械 badge / 平台图标 / 造价）→ 标题 → 说明 → **改枪码交互区** → 标签 → 互动区。

改枪码复制流程严格按需求实现：

1. `navigator.clipboard.writeText(code)`
2. 按钮切换为绿色「已复制！」并保持 **2000ms**（`COPY_FEEDBACK_MS`）
3. 调用 `POST /api/builds/:id/copy` 更新复制次数

在此之上补了三处工程细节：

| 细节 | 原因 |
|---|---|
| 剪贴板降级到 `textarea + execCommand` | 异步 Clipboard API 仅在**安全上下文**（https / localhost）可用。内网 http 部署时它会 reject，按钮会永久卡在失败态 |
| 计数上报失败**不回滚**成功态 | 复制本身已成功，计数是次要指标，不能因接口失败误导用户 |
| `select-all` 应用在改枪码上 | 即使复制按钮不可用，用户也能一次点选整串码手动 `Ctrl+C` |

点赞为乐观更新：先 +1，接口返回后以服务端值为准，失败则回滚并提示。

### `PublishDialog.tsx`

由 `App` **条件渲染**（`{open && <PublishDialog/>}`），因此每次打开都是全新挂载，
表单状态天然重置，不需要额外的 reset 逻辑。

- 枪械选择器：**按钮展开面板**式，而非"输入框 + 联想"的 combobox。
  后者要同时管理「输入的是搜索词还是已选值」，边界情况多且容易出错。
- 标签：词表快选（`TAG_VOCABULARY`）+ 自定义输入，上限 8 个
- 交互细节：`Esc` 关闭、背景滚动锁定、首字段自动聚焦、Tab 焦点陷阱、
  提交中禁止关闭、校验失败时焦点跳到第一个出错字段
- 错误映射：`VALIDATION_ERROR` 的字段级 `details` 回填到对应输入框；
  `DUPLICATE_BUILD_CODE` 定位到改枪码；`INVALID_GUN_ID` 定位到枪械

发布成功后，`App` 会判断新方案是否**被当前筛选条件过滤掉**并在提示里说明 ——
不说清楚的话，用户看不到自己刚发的方案会误以为发布失败并重复提交。

### `BuildDetailPage.tsx`

卡片把 `description` 截断为 2 行，而"改装思路 + 建议子弹"恰恰是这个站的核心价值，
所以详情页用 `whitespace-pre-line` 完整展示（种子数据的说明用 `\n` 分段，
不保留换行会挤成一坨，正好丢掉"建议子弹"那行的可读性）。

结构上有一个**必须的拆分**：详情页主体拆成内层 `BuildDetail` 组件。
因为 `useCopyCode` / `useLikeBuild` 都依赖已加载的方案数据，
而 hooks 不能写在 `build === null` 的条件分支里 ——
由父组件在数据就绪后才渲染内层组件，hooks 调用顺序才是稳定的。

### `CommentSection.tsx`

- 列表：分页 + "加载更多"，追加时**按 id 去重**（防重复点击导致同一条评论出现两次）
- 发表：`≤500` 字，与后端 `createCommentBodySchema` 对齐

**关键点：`POST /api/builds/:id/comments` 挂了 `requireAuth`**，
未登录返回 401 `AUTH_REQUIRED`。这必须与"网络失败/服务器错误"区别对待 ——
前者是**缺前置条件**，提示用户"重试"毫无意义，只会让人反复点。
因此代码里单独识别该错误码，给出"需要先登录"的说明而非通用失败文案。

---

## 3.1 前后端校验一致性检查

`lib/validation.ts` 逐条手写镜像了后端 `createBuildBodySchema` 的规则。
这种「两处手写同一套规则」的结构必然会漂移，因此配了一个检查脚本：

```bash
npm run check:validation
```

它把 34 个边界用例同时喂给前端校验和后端 zod schema，断言两个方向都成立：

- **A. 前端放行 ⇒ 后端必须接受**（不能给用户虚假信心）
- **B. 后端拒绝 ⇒ 前端必须拦下**（不能让用户白填一遍再被拒）

**这个脚本已经抓到 2 个真实缺陷**，都是"静默归一化"导致的：

| 缺陷 | 现象 | 修复 |
|---|---|---|
| 造价为空被转成 `0` | `Number('')` 在 JS 里等于 `0`，于是"没填造价"变成"造价 0 柯恩币"这种脏数据 | 未填时**整体省略该字段**，让后端的 `required_error` 正常触发 |
| 空标签被 `.filter()` 掉 | 前端拦下、后端其实也会拦，形成假分歧；更糟的是静默丢弃用户输入 | 不再过滤，交给后端 `z.string().trim().min(1)` 判定 |

> 教训：**校验层与转换层都不要做静默归一化**。要么原样传递让下游判定，
> 要么显式省略字段表达"未提供"，但不要把一个非法值悄悄换成另一个合法值。

## 3.2 Mock 数据有效性检查

```bash
npm run check:mocks
```

内置演示数据不能只是"看起来像"，它必须是**后端真的会接受的数据** ——
否则会出现"Mock 模式下一切正常，切到真实后端就 400"这种最难查的问题。

检查 6 项：每条方案能否通过 `createBuildBodySchema`、每条评论能否通过
`createCommentBodySchema`、外键能否解析、评分是否为有限数、
评论数徽标与列表条数是否一致、id 是否唯一。

> 写这个脚本时踩了一个坑：`hot_score` **不能做精确相等比较**。
> `hotScore()` 内部读 `Date.now()`，模块加载时组装一次、检查时重算一次，
> 相隔几毫秒分数就有极小差异 —— 断言必然随机失败。改用相对容差判断。
> （`cp_score` 不含时间项，可以精确比较。）

---

## 4. 后端契约对齐

前端类型在 `src/types/api.ts` **手写对齐**后端 DTO（真源为后端
`src/services/{builds,guns}.service.ts`），改动后端 DTO 时需同步该文件。

| 端点 | 响应结构 | 前端消费处 |
|---|---|---|
| `GET /api/guns` | `{ success, data: { categories, guns } }` | `App` 分类字典与统计 |
| `GET /api/builds` | `{ success, data: BuildDTO[], pagination }` | `useBuildsFeed` |
| `POST /api/builds/:id/copy` | `{ success, data: { id, copies_count } }` | `BuildCard.handleCopy` |
| `POST /api/builds/:id/like` | `{ success, data: { id, liked, likes_count } }` | `BuildCard.handleLike` |
| 任意错误 | `{ success: false, error: { code, message, details? } }` | `ApiError` + `ErrorState` |

两处**极易写错**的地方已在代码注释中标出：

1. `GET /api/builds` 的 `pagination` 与 `data` **平级**，不嵌在 `data` 里。
2. 后端 DTO 里 `created_at` 声明为 `Date`，但经 `res.json()` 到达前端是
   **ISO 字符串**，因此前端类型必须是 `string`。

### Mock 模式的两点刻意设计

1. **评分本地按后端公式重算**（`build_hot_score` / `build_cp_score`），
   而不是写死数字 —— 保证 Mock 下的排序结果与真实后端一致，
   不会出现「看着一样、排序不同」的错觉。
2. **`icon_url` 全部置 `null`** —— 真实种子数据里是占位域名
   `assets.example-anqu.com`，预览时会渲染成破图；置 null 顺带验证前端降级路径。

---

## 5. 设计语言：Apple HIG

参考苹果官网与 HIG，从原来的「硬核战术暗黑」整体转为 Apple 风格。
三条原则贯穿全站：

1. **用不透明度分层，而不是用不同色相**。Apple 深色模式里「次要文字」不是另一种
   灰色，而是同一个白色降透明度 —— 这样在任意背景（含玻璃层）上都和谐。
2. **材质（Material）而非纯色块**。面板 = 半透明白 + 背景模糊 + 1px 微亮描边，
   让背后内容透出来形成纵深。
3. **层级靠留白与字重，不靠边框和线条**。标题大而重、正文小而疏。

### 5.1 令牌（`src/index.css` 的 `@theme`）

| 令牌 | 值 | 用途 |
|---|---|---|
| `base` / `base-2` | `#000000` / `#0a0a0c` | 底色，Apple 深色模式基准 |
| `glass` / `glass-2` / `glass-3` | 白 8% / 12% / 18% | 三级玻璃层 |
| `hairline` / `hairline-2` | 白 15% / 30% | 1px 微亮描边 |
| `ink` / `ink-2` / `ink-3` | 白 96% / 64% / 40% | 文字三级 |
| `accent` / `accent-2` | `#ff9f0a` / `#ffb340` | 品牌战术黄（取 systemOrange 色相） |
| `signal` / `danger` | `#30d158` / `#ff453a` | 已复制 / 错误（Apple systemGreen/Red） |

圆角：`rounded-card` 22px（卡片）、`rounded-panel` 18px（面板）、
`rounded-control` 14px（控件）、`rounded-chip` 全圆（按钮 / 标签）。

> squircle 的说明：真正的连续曲率需要 SVG 遮罩或 CSS `corner-shape`
> （尚未广泛支持），这里用大 `border-radius` 作为实用近似。

字体：`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
"PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif`。
正文 15px / 行高 1.6，标题收紧字距（`-0.022em`）。

### 5.2 材质与动效类

| 类名 | 作用 |
|---|---|
| `.glass` | 标准玻璃：`blur(20px) saturate(180%)` + 白 8% + 1px 白 15% 描边 |
| `.glass-strong` | 弹窗用，更实（`blur(30px)`，底色 `rgb(30 30 34 / 0.72)`） |
| `.glass-thin` | 顶部导航用，更薄，避免遮挡内容 |
| `.elevate` / `.elevate-hover` | `0 10px 30px rgba(0,0,0,.12)` + 悬浮抬升 |
| `.press` | 按下时 `scale(0.975)`，模拟 iOS 触感反馈 |
| `.animate-modal-in` / `.animate-dropdown-in` | 弹窗缩放淡入 / 下拉展开 |

统一缓动：`cubic-bezier(0.25, 1, 0.5, 1)`（Apple 的过渡曲线，起步快收尾缓）。
`backdrop-filter` 全部带 `-webkit-` 前缀 —— 否则 Safari 上完全没有模糊效果。

### 5.3 Bento Grid 与组件

- **主页顶部**是 Bento 概览区：左侧大卡片突出「推荐方案」（独立取热度榜首，
  不受当前筛选影响，否则一筛选「推荐」就跟着变，失去编辑精选的意味），
  右侧三张小卡片放统计与分类（方案总数 / 枪械库 / 最热分类）。
- **卡片**全部 `rounded-card` + `.elevate-hover`，悬浮上移 3px。
- **弹窗**：高斯模糊蒙版 + 中心浮起，表单控件改为 iOS 风格
  （内嵌填充而非描边，聚焦时描边才亮起）。
- **枪械选择器下拉**：柔和缩放淡入，无匹配时给出优雅空状态
  （说明"下一步该做什么"，而不是只说没有）。
- 保留 `⌘K` / `Ctrl+K` 唤起搜索。

已处理 `prefers-reduced-motion`，对减少动效的用户关闭全部动画。


## 6. 未接入项（后端已就绪，前端待做）

| 功能 | 状态 | 需要的接口 |
|---|---|---|
| 登录态 | 未接入 | Supabase Auth |
| 编辑 / 删除自己的方案 | 未接入 | `PATCH` / `DELETE /api/builds/:id` |
| 删除自己的评论 | 未接入 | `DELETE /api/comments/:id`（后端已实现，仅作者或版主可删） |
| 按枪械筛选 | 接口支持 `gun_id`，UI 暂未放入口 | `GET /api/builds?gun_id=` |
| 标签点击筛选 | 接口支持 `tag`，标签目前不可点 | `GET /api/builds?tag=` |

列表、详情、发布、评论均已接入。

点赞在未登录时走后端匿名路径（仅累加、不去重）；接入登录后会自动切换到
幂等开关语义，前端无需改动 —— `BuildCard` 与详情页都按 `res.liked` 渲染状态。

评论在未登录时会被后端 401 拒绝，前端已给出明确提示而非通用错误。
