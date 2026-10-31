# 枪械图片接入台账（UI-010 STEP 1）

调查日期：2026-10-11。调查机器：owner 本机（Windows，中文网络环境）。
每条候选都记：**原始 URL / 权利人 / 授权或使用条款 / 枪械身份 / PC 版本对应证据 / 裁定**。

结论先说：**本轮 0 条拿到可用授权，0 张入库。** 下表里的"不可达"是这台机器的网络事实，
不等于"该来源没有授权" —— 换一台能访问的机器或让 owner 直接供图，结论可能改变。

---

## 1. 官方公开渠道

| 项 | 内容 |
| --- | --- |
| URL | <https://aqtwwx.qq.com/>（《暗区突围：无限》官网，国服） |
| 权利人 | 腾讯（发行/研发主体见站内署名） |
| 取证 | HTTP 200，正文 29,418 B。整页 HTML 里**没有**媒体包 / press kit / 素材下载 / 内容再分发许可 的任何入口；页面内链接只有 `javascript:` 动作与宣传图直链 |
| 授权 | 未在本页发现任何授予第三方再分发的条款 |
| 枪械身份 | 不适用（没有可登记的素材单元） |
| PC 对应证据 | 不适用 |
| 裁定 | **不纳入**。公开可访问 ≠ 允许转载 |

| 项 | 内容 |
| --- | --- |
| URL | <https://www.arenabreakoutinfinite.com/en/>（全球官网，PC） |
| 权利人 | 腾讯 / Level Infinite |
| 取证 | HTTP 200，正文 87,610 B。导航与页脚**全部**链接已枚举：Store、Discord、Creator Bounty、Creator Code、Support、Security Center、CDK Redemption、Mobile Game、YouTube / X / Discord / Twitch / Reddit / Facebook / TikTok / Telegram |
| 授权 | 同一份 HTML 里检索 `contract / agreement / protocol / privacy / terms` 均无命中；页面上没有新闻稿素材区 |
| 裁定 | **不纳入**（没有素材分发面） |

## 2. 官方创作者计划（最接近"允许复用"的一层）

| 项 | 内容 |
| --- | --- |
| URL | <https://sg-creatorhub.playerinfinite.com/bounty/bountymission?game_id=30048&area_id=asia&game=arenabreakoutInfinite>、<https://www.arenabreakoutinfinite.com/creatorcode/index.html?lang=en> |
| 权利人 | 腾讯 / Level Infinite |
| 条款 | 需登录报名的 UGC 激励计划（视频/直播向）。其授权范围由活动规则单独约定，**页面本身不是素材许可** |
| 枪械身份 | 不适用 |
| 裁定 | **授权不明 → 只记候选，不下载入库**。若 owner 以创作者身份拿到书面许可，按 `docs/weapon_assets/README.md` 的登记流程接入，`kind` 用 `game_asset` 并把文书编号填进 `permissionEvidence` |

## 3. 社区维基

| 项 | 内容 |
| --- | --- |
| URL | <https://arena-breakout-infinite.fandom.com/zh/wiki/Arena_Breakout_Infinite_Wiki> |
| 权利人 | 站点文本按 Fandom 社区条款；**游戏截图逐文件单独标注**，通常是"版权方素材 / 合理使用"类标签 |
| 取证 | 本机 `UND_ERR_CONNECT_TIMEOUT`（WebFetch 与 node fetch 各一次，均失败）→ **无法读取其逐文件授权标注** |
| 裁定 | **不纳入**。无法核验授权标注的素材一律不入库；即便可达，游戏截图类条目的默认标注也不是再分发许可 |

## 4. 自由授权摄影（唯一带机器可读逐文件授权的一类）

| 项 | 内容 |
| --- | --- |
| URL | `https://commons.wikimedia.org/w/api.php?...generator=category...`（拟取 `Category:MP5 submachine gun` 等分类的 `extmetadata`：`UsageTerms` / `LicenseShortName` / `Artist`） |
| 权利人 | 逐文件作者，CC BY / CC BY-SA / CC0 等 |
| 取证 | 本机 **4/4 次连接超时**：`commons.wikimedia.org`、`en.wikipedia.org`、`zh.wikipedia.org`、`upload.wikimedia.org` 全部 `UND_ERR_CONNECT_TIMEOUT`；同一时刻 `anqu.onrender.com` 与 `arenabreakoutinfinite.com` 返回 200 ⇒ 是域名不可达，不是脚本问题 |
| 枪械身份 | 若可达，还需逐张核对**文件描述页画的到底是哪支枪**（不许凭文件名推断型号），并确认与本站 canonical 行名一致 |
| 裁定 | **本轮不纳入**（不可达即不可核验）。这类素材即使接入也只能标 `kind=real_photo`，且 caption 必须含"实物"字样 —— 校验器 B2 已把这条钉成硬判据，防止现实照片冒充游戏内画面 |

## 5. 项目内部既有素材

| 项 | 内容 |
| --- | --- |
| 取证 | `git ls-files` 匹配 png/jpg/jpeg/webp/avif/gif/svg = **0 个**；`web/public/` 只有 `favicon.ico` 与 `_redirects`；工作区无未跟踪图片 |
| 裁定 | `favicon.ico` 是本站品牌砖，不是枪械 → 不能当枪图用。**仓内没有可合法复用的枪械素材** |

## 6. 后端字段现状（接入的另一半）

| 项 | 内容 |
| --- | --- |
| URL | `GET https://anqu.onrender.com/api/guns`（只读） |
| 取证 | HTTP 200；`icon_url` **89/89 为 null**（UI-009 两次独立读取一致，本轮浏览器侧 89 张板子全部 `data-state="idle"` 再证一次） |
| 政策 | `db/04_seed.sql:11-16`（DATA-005 清除 60 行占位域名）、`db/guns_sources.md:113`「icon_url / name_en 保持 NULL：真实枪械图素材来源（含版权与官方性）尚未确立」 |
| 裁定 | 本任务**不改生产数据库**（授权明令）。因此接入层不依赖 `icon_url`：登记表在前、`icon_url` 在后，两条路都空就走 UI-009 的诚实空位版面 |

---

## 最快的一条路（给 owner）

`kind=owner_capture` 是门槛最低的一类：owner 自己在 PC 客户端里对每把枪的军械库/预览界面截图，
归属清晰、无需向任何人申请许可。拿到之后按 `docs/weapon_assets/README.md` 五步走，
一条命令校验，图就上屏。八分类各一把代表枪 = 8 张，够 STEP 4 的样板目标。

---

# UI-011 追加：两份点名候选的核验结果

调查日期 2026-10-11，机器同上。**结论：两份候选都停在"未能核验"，0 张入库。**
下表记录的是可复查的坐标，不是我读到的许可内容 —— 我没有拿到过这两个页面的任何一个字节，
不声称亲自验证过作者、许可证或商用条款。

| 候选 | 对应本站枪械 | 核验尝试 | 结果 |
| --- | --- | --- | --- |
| <https://commons.wikimedia.org/wiki/File:PEO_M4_Carbine_RAS_noBG.png> | `m4a1`（现实枪型：M4 卡宾枪） | node fetch ×2、托管 fetch 工具 ×1 | 全部 `UND_ERR_CONNECT_TIMEOUT`（约 10.7s 超时） |
| <https://commons.wikimedia.org/wiki/File:HK416N.png> | `hk416a5`（现实枪型：HK416） | node fetch ×2、托管 fetch 工具 ×1 | 同上，全部连接超时 |

对照组（同一时刻、同一台机器）：`https://anqu.onrender.com/api/guns` 返回 200、
`https://www.arenabreakoutinfinite.com/en/` 返回 200 ⇒ 不是脚本或代理坏了，是 `commons.wikimedia.org`
与 `upload.wikimedia.org` 在这台机器上不可达（`en.wikipedia.org` / `zh.wikipedia.org` 同样超时）。

因此**两份候选都缺三样东西**，缺一不可入库：
1. 许可事实（实际作者 / 文件版本 / 许可证与署名条件 / 是否允许商用 / 衍生条件）—— 页面读不到；
2. 文件字节 —— 拿不到就无从计算 SHA-256，登记表的哈希字段只能是编的；
3. 现实枪型 ↔ 本站行的对应证据 —— 需要读文件描述页确认它画的到底是哪支枪，不许凭文件名猜。

换一台能访问 Wikimedia 的机器（或由 owner 直接提供下载好的原件 + 描述页截图），
这三样一次就能补齐；届时 `kind` 只能填 `REAL_WORLD_REFERENCE`，
caption 必须写"现实枪械参考照片（非游戏内截图）"—— 校验器已经把这两个词钉成硬判据。

## 官方实机截图这一路（只读检查）

| 检查项 | 现场情况 | 结论 |
| --- | --- | --- |
| 官网 `aqtwwx.qq.com` / `arenabreakoutinfinite.com` 页面内的条款链接 | 两站首页 HTML 里检索 `contract / agreement / terms / privacy` 均无命中（条款由前端路由渲染，页面源码里没有落点） | 未取得可引用的条款文本 |
| 腾讯游戏用户协议常见入口 `game.qq.com/contract/` | HTTP 404 | 未能定位到现行文本 |
| 创作者计划（Creator Bounty / Creator Code） | 需登录报名的 UGC 激励，管的是创作者内容发布 | 不构成对第三方网站的图片再分发许可 |

**判据**：游戏实机截图 ≠ 拥有公开再分发权。在拿到写明"允许本站公开传播"的书面依据之前，
`GAME_PC_VERIFIED_IMAGE` 一类**一张都不登记**。
