import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Crosshair, LayoutGrid, Monitor, Plus, Search, Smartphone, X } from 'lucide-react';

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

const EASE = 'ease-[cubic-bezier(0.25,1,0.5,1)]';

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
    <header className="glass-thin sticky top-0 z-40">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:h-[68px] lg:flex-nowrap lg:px-6 lg:py-0">
        {/* ---------------------------------------------- 品牌 */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="press group flex shrink-0 items-center gap-3 rounded-control"
          aria-label="暗区改枪库 首页"
        >
          <span
            className={cn(
              'grid h-10 w-10 place-items-center rounded-[13px]',
              'bg-gradient-to-br from-accent to-accent-2',
              'shadow-[0_4px_16px_rgb(255_159_10_/_0.32)]',
              `transition-transform duration-300 ${EASE} group-hover:scale-[1.04]`,
            )}
          >
            <Crosshair className="h-5 w-5 text-black/85" strokeWidth={2.5} aria-hidden="true" />
          </span>

          <span className="flex flex-col leading-none">
            <span className="text-[17px] font-semibold tracking-[-0.022em] text-ink">
              暗区改枪库
            </span>
            <span className="mt-[3px] text-[10px] font-medium uppercase tracking-[0.16em] text-ink-3">
              Arena Builds
            </span>
          </span>
        </button>

        {/* ---------------------------------------------- 发布按钮（移动端右对齐） */}
        <button
          type="button"
          onClick={openPublish}
          className={cn(
            'press order-2 ml-auto flex shrink-0 items-center gap-1.5 rounded-chip lg:order-none lg:ml-0',
            'bg-accent px-4 py-2 text-[13px] font-semibold text-black',
            `transition-all duration-300 ${EASE}`,
            'hover:bg-accent-2 hover:shadow-[0_6px_22px_rgb(255_159_10_/_0.42)]',
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
          <span className="hidden sm:inline">发布方案</span>
        </button>

        {/* ---------------------------------------------- 全局搜索 */}
        <div className="order-3 w-full lg:order-none lg:w-auto lg:max-w-xl lg:flex-1">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            {/* iOS 风格搜索框：胶囊形、内嵌填充、无硬边框 */}
            <input
              ref={searchRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="搜索枪械或方案关键字，如 ACE32、腰射、封锁区…"
              aria-label="搜索改枪方案"
              autoComplete="off"
              className={cn(
                'h-10 w-full rounded-chip border border-transparent bg-glass pl-10 pr-20',
                'text-[15px] text-ink placeholder:text-ink-3',
                `transition-all duration-300 ${EASE}`,
                'hover:bg-glass-2',
                'focus:border-hairline-2 focus:bg-glass-2 focus:outline-none',
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
                className="press absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-chip bg-glass-2 text-ink-3 transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : (
              <kbd
                className={cn(
                  'pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2',
                  'rounded-md border border-hairline bg-glass px-1.5 py-0.5',
                  'font-mono text-[10px] font-medium text-ink-3 sm:block',
                )}
                aria-hidden="true"
              >
                ⌘K
              </kbd>
            )}
          </div>
        </div>

        {/* ---------------------------------------------- 平台分段控件 + Mock 标记 */}
        <div className="order-4 flex w-full items-center gap-2.5 lg:order-none lg:w-auto">
          {/* iOS 分段控件：容器内嵌，选中项浮起 */}
          <div
            role="group"
            aria-label="平台筛选"
            className="flex items-center gap-0.5 rounded-control bg-glass p-1"
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
                    'press flex items-center gap-1.5 rounded-[10px] px-3 py-1.5',
                    'text-[13px] font-medium',
                    `transition-all duration-300 ${EASE}`,
                    active
                      ? 'bg-glass-3 text-ink shadow-[0_2px_8px_rgb(0_0_0_/_0.28)]'
                      : 'text-ink-2 hover:text-ink',
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
              className="shrink-0 rounded-md border border-hairline bg-glass px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-accent"
            >
              MOCK
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
