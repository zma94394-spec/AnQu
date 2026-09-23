import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Crosshair,
  LayoutGrid,
  Monitor,
  Plus,
  Search,
  Smartphone,
  X,
} from 'lucide-react';

import { useAppShell } from '../lib/appShell';
import { USE_MOCK } from '../lib/api';
import { cn } from '../lib/cn';
import { readFilters, writeFilters } from '../lib/queryParams';
import type { FeedFilters } from '../lib/queryParams';
import { PLATFORM_TABS } from '../types/ui';

/** 搜索防抖时长。300~350ms 是"不觉得卡"与"不浪费请求"的常见平衡点 */
const SEARCH_DEBOUNCE_MS = 320;

/** 平台 Tab 对应的图标 */
const PLATFORM_ICON = {
  all: LayoutGrid,
  mobile: Smartphone,
  pc: Monitor,
} as const;

/**
 * 全局导航栏。
 *
 * 搜索与平台筛选**直接读写 URL**，而不是接收 props ——
 * 这样它在列表页和详情页上的行为完全一致：在详情页搜索会自动跳到
 * `/?q=...`，不需要给每个页面单独接线。
 */
export function Header() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { openPublish } = useAppShell();

  const filters = readFilters(searchParams);
  const isHome = location.pathname === '/';

  // 输入框保留本地态用于防抖，URL 变化时回同步（例如点了"重置筛选"）
  const [input, setInput] = useState(filters.q);
  useEffect(() => {
    setInput(filters.q);
  }, [filters.q]);

  const searchRef = useRef<HTMLInputElement>(null);

  const applyFilters = useCallback(
    (patch: Partial<FeedFilters>) => {
      const next = { ...filters, ...patch };
      const params = writeFilters(next);
      const target = `/${params.toString()}`;

      // 在列表页改筛选用 replace，避免每次点分类都塞一条历史记录；
      // 在详情页改筛选用 push，这样"后退"能回到刚才看的方案。
      navigate(target, { replace: isHome });
    },
    [filters, isHome, navigate],
  );

  // 搜索防抖：只在输入稳定后写 URL
  useEffect(() => {
    const next = input.trim();
    if (next === filters.q) return;

    const timer = window.setTimeout(() => {
      applyFilters({ q: next, page: 1 });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [input, filters.q, applyFilters]);

  // ⌘K / Ctrl+K 聚焦搜索框。这是列表类产品的通用预期，
  // 成本很低但能显著减少一次鼠标移动。
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-void/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:h-16 lg:flex-nowrap lg:px-6 lg:py-0">
        {/* ---------------------------------------------- 品牌 */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="暗区改枪库 首页"
        >
          <span
            className={cn(
              'clip-tactical grid h-9 w-9 place-items-center',
              'bg-gradient-to-br from-tactical to-tactical-deep',
              'shadow-[0_0_18px_-2px_rgba(245,158,11,0.55)]',
              'transition-transform duration-200 group-hover:scale-105',
            )}
          >
            <Crosshair className="h-5 w-5 text-void" strokeWidth={2.5} aria-hidden="true" />
          </span>

          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-tight text-ink">暗区改枪库</span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
              Arena Builds
            </span>
          </span>
        </button>

        {/* ---------------------------------------------- 发布按钮（移动端右对齐） */}
        <button
          type="button"
          onClick={openPublish}
          className={cn(
            'order-2 ml-auto flex shrink-0 items-center gap-1.5 lg:order-none lg:ml-0',
            'clip-tactical bg-tactical px-3 py-2 text-xs font-bold text-void lg:px-4',
            'transition-colors hover:bg-tactical-deep hover:text-ink',
            'animate-tactical-pulse',
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          <span className="hidden sm:inline">发布方案</span>
        </button>

        {/* ---------------------------------------------- 全局搜索 */}
        <div className="order-3 w-full lg:order-none lg:w-auto lg:max-w-xl lg:flex-1">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="搜索枪械或方案关键字，如 FAL、腰射、封锁区…"
              aria-label="搜索改枪方案"
              autoComplete="off"
              className={cn(
                'h-10 w-full rounded-lg border border-line bg-surface/70 pl-9 pr-20',
                'text-sm text-ink placeholder:text-dim',
                'transition-colors duration-150',
                'hover:border-line-strong',
                'focus:border-tactical/60 focus:bg-surface focus:outline-none',
              )}
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
                className={cn(
                  'absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center',
                  'rounded text-dim transition-colors hover:bg-raised hover:text-ink',
                )}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : (
              <kbd
                className={cn(
                  'pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2',
                  'rounded border border-line bg-raised px-1.5 py-0.5',
                  'font-mono text-[10px] font-medium text-dim sm:block',
                )}
                aria-hidden="true"
              >
                Ctrl K
              </kbd>
            )}
          </div>
        </div>

        {/* ---------------------------------------------- 平台切换 + Mock 标记 */}
        <div className="order-4 flex w-full items-center gap-2 lg:order-none lg:w-auto">
          <div
            role="group"
            aria-label="平台筛选"
            className="flex items-center gap-1 rounded-lg border border-line bg-surface/60 p-1"
          >
            {PLATFORM_TABS.map((tab) => {
              const Icon = PLATFORM_ICON[tab.value];
              const active = filters.platform === tab.value;

              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => applyFilters({ platform: tab.value, page: 1 })}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                    'text-xs font-semibold transition-all duration-150',
                    active
                      ? 'bg-tactical text-void shadow-[0_0_14px_-2px_rgba(245,158,11,0.6)]'
                      : 'text-muted hover:bg-raised hover:text-ink',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {USE_MOCK && (
            <span
              title="当前展示的是内置演示数据，未连接后端接口"
              className={cn(
                'shrink-0 rounded border border-tactical/40 bg-tactical/10',
                'px-1.5 py-1 font-mono text-[10px] font-bold tracking-wider text-tactical',
              )}
            >
              MOCK
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
