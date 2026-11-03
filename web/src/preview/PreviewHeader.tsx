import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, LogOut, Plus, Search, X } from 'lucide-react';

import { BrandMark } from '../components/BrandMark';
import { useAppShell } from '../lib/appShell';
import { useAuth } from '../lib/auth';
import { USE_MOCK } from '../lib/apiPublic';
import { cn } from '../lib/cn';
import { readFilters, writeFilters } from '../lib/queryParams';
import type { FeedFilters } from '../lib/queryParams';

/** 搜索防抖时长。300~350ms 是"不觉得卡"与"不浪费请求"的常见平衡点 */
const SEARCH_DEBOUNCE_MS = 320;

const EASE = 'ease-[cubic-bezier(0.25,1,0.5,1)]';

/**
 * 全局导航栏。
 *
 * 搜索与平台筛选**直接读写 URL**，而不是接收 props ——
 * 这样它在列表页和详情页上的行为完全一致：在详情页搜索会自动跳到
 * `/?q=...`，不需要给每个页面单独接线。
 *
 * UI-003 只改了视觉层。以下这些是**功能契约**，一行逻辑都没动：
 * `aria-label="搜索改枪方案"` 的 text 输入框（Ctrl+K 用例靠它确认焦点）、
 * `role="group" aria-label="平台筛选"`、`aria-current`、`aria-pressed`、
 * 防抖写 URL、以及 `/?q=...` 必须带问号这条（漏了会被路由兜底成 404）。
 */
export function PreviewHeader() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { openPublish, openAuth, notify } = useAppShell();
  const { user, signOut } = useAuth();

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      notify({ text: '已退出登录。' });
    } catch {
      notify({ text: '退出失败，请稍后重试。' });
    }
  }, [notify, signOut]);

  const filters = readFilters(searchParams);
  const isHome = location.pathname === '/';
  const isBuilds = location.pathname === '/builds';
  /** 枪械目录与枪械详情：这个上下文里搜索的是枪，不是方案 */
  const isGuns = location.pathname === '/guns' || location.pathname.startsWith('/guns/');

  // 输入框保留本地态用于防抖，URL 变化时回同步（例如点了"重置筛选"）
  const [input, setInput] = useState(filters.q);
  useEffect(() => {
    setInput(filters.q);
  }, [filters.q]);

  const searchRef = useRef<HTMLInputElement>(null);

  const applyFilters = useCallback(
    (patch: Partial<FeedFilters>) => {
      const next = { ...filters, ...patch };
      const queryString = writeFilters(next).toString();

      /*
       * 页头的搜索框与平台 Tab 是**列表**的筛选器，所以它们该写在
       * 用户当前所在的那条列表路由上：首页写 `/?q=`，方案库写 `/builds?q=`。
       *
       * 原先这里是硬编码 `/`：在 `/builds` 上一搜索就被甩回首页，
       * 用户在方案库里设好的分类与排序全部丢失。
       * 枪械路由不经过这里（见 applyGunSearch），其上下文是枪而不是方案。
       */
      const base = isBuilds ? '/builds' : '/';

      // ⚠️ 必须拼成 `/?q=...` / `/builds?q=...`，不能是 `/q=...`。
      //    漏掉 `?` 会得到一条普通路径，被路由的 `*` 兜底命中，
      //    用户一搜索就跳到 404 页面 —— 而且 URL 看起来"挺正常"，很难察觉。
      //    没有参数时回到裸列表页。
      const target = queryString ? `${base}?${queryString}` : base;

      // 在列表页改筛选用 replace，避免每次点分类都塞一条历史记录；
      // 在详情页改筛选用 push，这样"后退"能回到刚才看的方案。
      navigate(target, { replace: isHome || isBuilds });
    },
    [filters, isBuilds, isHome, navigate],
  );

  /**
   * 枪械上下文里的搜索。
   *
   * 只带 `q` 与当前分类，不把方案的 platform / sort / page / gun 带进 `/guns` ——
   * 那些是方案列表的维度，搬过去只会造出一条看起来有筛选、其实没人读的 URL。
   */
  const applyGunSearch = useCallback(
    (raw: string) => {
      const next = new URLSearchParams();
      const q = raw.trim();
      if (q) next.set('q', q);
      const category = searchParams.get('category');
      if (category) next.set('category', category);
      const queryString = next.toString();
      navigate(`/guns${queryString ? `?${queryString}` : ''}`, { replace: true });
    },
    [navigate, searchParams],
  );

  // 搜索防抖：只在输入稳定后写 URL
  useEffect(() => {
    const next = input.trim();
    if (next === filters.q) return;

    const timer = window.setTimeout(() => {
      if (isGuns) applyGunSearch(next);
      else applyFilters({ q: next, page: 1 });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [input, filters.q, applyFilters, applyGunSearch, isGuns]);

  // ⌘K / Ctrl+K 聚焦搜索框。这是列表类产品的通用预期，
  // 成本很低但能显著减少一次鼠标移动。
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // 首页的搜索在首屏里，由 HomeSearch 接管 Ctrl+K，避免两个输入框抢焦点
      if (isHome) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHome]);

  return (
    /*
     * `glass-thin` 必须保留：它带 `backdrop-filter: blur()`，而 e2e 的视觉
     * 基线用例是**直接读 computed style** 断言模糊生效的。UI-003 换了描边
     * 与内部控件的形制，但没有换材质。
     */
    <header className={cn('glass-thin sticky top-0 z-40', isHome && 'home-header')}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:h-[68px] lg:flex-nowrap lg:px-6 lg:py-0">
        {/* ---------------------------------------------- 品牌 */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="press group flex shrink-0 items-center gap-3 rounded-hud"
          aria-label="枪谱 首页"
        >
          <span
            className={cn(
              'relative grid h-10 w-10 place-items-center overflow-hidden rounded-[9px]',
              'border border-hairline bg-[linear-gradient(145deg,rgb(224_164_106_/_0.18),rgb(13_18_23_/_0.7))]',
              `transition-colors duration-200 ${EASE} group-hover:border-accent-line`,
            )}
          >
            <BrandMark className="h-5 w-5 text-accent" />
          </span>

          <span className="text-[19px] font-semibold tracking-[0.1em] text-ink">枪谱</span>
        </button>

        {/*
         * ---------------------------------------------- 主导航
         * 当前页用底部一道冷光下划线，不用填充色块 —— 页头已经有一个实心
         * 主按钮（发布），导航再来一块实心黄就会互相抢权重。
         */}
        <nav aria-label="主导航" className="flex shrink-0 items-center gap-0.5">
          <Link
            to="/"
            aria-current={isHome ? 'page' : undefined}
            data-active={isHome}
            className="hud-navlink press"
          >
            首页
          </Link>
          <Link
            to="/guns"
            aria-current={isGuns ? 'page' : undefined}
            data-active={isGuns}
            className="hud-navlink press"
          >
            枪械库
          </Link>
          <button
            type="button"
            onClick={() => navigate('/builds')}
            aria-current={isBuilds ? 'page' : undefined}
            data-active={isBuilds}
            className="hud-navlink press"
          >
            方案库
          </button>
        </nav>

        {/* ---------------------------------------------- 投稿入口（移动端右对齐） */}
        <button
          type="button"
          onClick={() => openPublish()}
          aria-label="投稿"
          className="btn-hud press order-2 ml-auto shrink-0 !px-3.5 !py-2 !text-[12px] lg:order-none lg:ml-0"
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          <span className="hidden sm:inline">投稿</span>
        </button>

        {/* ---------------------------------------------- 全局搜索（首页由首屏搜索接管） */}
        {!isHome && (
          <div className="order-3 w-full lg:order-none lg:w-auto lg:max-w-xl lg:flex-1">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                aria-hidden="true"
              />
              {/* 战术输入框：直角暗舱 + hairline，聚焦时暖光描边 */}
              <input
                ref={searchRef}
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  isGuns
                    ? '搜索枪械：中文名、英文名或 slug'
                    : '搜索枪械或方案关键字，如 ACE32、腰射、封锁区…'
                }
                aria-label={isGuns ? '搜索枪械' : '搜索改枪方案'}
                autoComplete="off"
                className="hud-field h-10 pl-10 pr-20 text-[15px]"
              />

              {/* 清空按钮：有内容时才出现，避免空态下多一个无用控件 */}
              {input ? (
                <button
                  type="button"
                  onClick={() => {
                    setInput('');
                    searchRef.current?.focus();
                  }}
                  aria-label="清空搜索"
                  className="press absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-hud bg-glass-2 text-ink-3 transition-colors hover:text-hud"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : (
                <kbd
                  className={cn(
                    'pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2',
                    'rounded-hud border border-hairline bg-black/40 px-1.5 py-0.5',
                    'font-mono text-[10px] font-medium text-ink-3 sm:block',
                  )}
                  aria-hidden="true"
                >
                  ⌘K
                </kbd>
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------- 账户与数据源标记 */}
        <div className="order-4 flex w-auto items-center gap-2.5 lg:order-none lg:ml-auto lg:w-auto">
          {/* 登录态入口。
              放在导航栏而不是只藏在详情页评论区 —— 否则用户在首页
              根本找不到登录入口，而点赞开关与评论都需要登录。 */}
          {user ? (
            <div className="flex shrink-0 items-center gap-1 rounded-hud border border-hairline bg-black/35 py-1 pl-1 pr-1.5">
              <span
                className="hud-readout grid h-6 w-6 place-items-center rounded-hud bg-accent/20 text-[11px] font-bold text-accent"
                aria-hidden="true"
              >
                {(user.nickname ?? user.email ?? 'U').slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-[7rem] truncate text-[12px] font-medium text-ink-2 sm:block">
                {user.nickname ?? user.email}
              </span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                aria-label="退出登录"
                title="退出登录"
                className="press grid h-6 w-6 place-items-center rounded-hud text-ink-3 transition-colors hover:bg-glass-2 hover:text-danger"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openAuth}
              className={cn(
                'press flex shrink-0 items-center gap-1.5 rounded-hud border border-hairline px-3 py-2',
                'text-[13px] font-medium text-ink-2',
                `transition-all duration-300 ${EASE} hover:border-hud hover:text-hud`,
              )}
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              登录
            </button>
          )}

          {USE_MOCK && (
            <span
              title="当前展示的是内置演示数据，未连接后端接口"
              className="hud-readout shrink-0 rounded-hud border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent"
            >
              MOCK
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
