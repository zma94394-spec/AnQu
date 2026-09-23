import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { Info, PackageOpen, X } from 'lucide-react';

import { Header } from './components/Header';
import { PublishDialog } from './components/PublishDialog';
import { BuildDetailPage } from './pages/BuildDetailPage';
import { HomePage } from './pages/HomePage';
import { AppShellContext } from './lib/appShell';
import type { AppShellValue, Notice } from './lib/appShell';
import { fetchGuns } from './lib/api';
import { cn } from './lib/cn';
import { FILTER_DEFAULTS, readFilters, writeFilters } from './lib/queryParams';
import type { BuildDTO, CategoryDTO, GunDTO } from './types/api';

/**
 * 应用外壳。
 *
 * 职责被刻意限定为三件事：加载全局字典、承载路由出口、托管全局 UI
 * （轻提示与发布弹窗）。列表与详情的业务逻辑分别在各自的 page 里。
 */
export default function App() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ------------------------------------------------------ 全局字典 */
  const [guns, setGuns] = useState<GunDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetchGuns()
      .then((payload) => {
        if (cancelled) return;
        setGuns(payload.guns);
        setCategories(payload.categories);
      })
      .catch(() => {
        // 分类字典拉取失败不应阻断主列表 —— 退化为"只有全部"的筛选栏
        if (cancelled) return;
        setCategories([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* -------------------------------------------------------- 轻提示 */
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    // 带操作按钮的提示停留更久，否则用户来不及读完再点击
    const timer = window.setTimeout(() => setNotice(null), notice.action ? 9000 : 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const notify = useCallback((next: Notice) => setNotice(next), []);

  /* ------------------------------------------------------ 发布弹窗 */
  const [publishOpen, setPublishOpen] = useState(false);
  const openPublish = useCallback(() => setPublishOpen(true), []);

  /** 数据版本号：发布成功后自增，列表页据此强制重取 */
  const [dataVersion, setDataVersion] = useState(0);

  /**
   * 发布成功回调。
   *
   * 这里多做了一件事：判断新方案是否会被**当前筛选条件**过滤掉。
   * 不说清楚的话，用户发完看不到自己的方案，会误以为发布失败并重复提交。
   */
  const handleCreated = useCallback(
    (build: BuildDTO) => {
      setPublishOpen(false);
      setDataVersion((version) => version + 1);

      const filters = readFilters(searchParams);
      const hiddenBy: string[] = [];

      if (filters.q && !build.title.toLowerCase().includes(filters.q.toLowerCase())) {
        hiddenBy.push('搜索关键字');
      }
      if (filters.platform !== 'all' && build.platform !== filters.platform) {
        hiddenBy.push('平台筛选');
      }
      if (filters.category !== 'all' && build.gun.category !== filters.category) {
        hiddenBy.push('枪械分类');
      }

      if (hiddenBy.length === 0) {
        notify({ text: `「${build.title}」发布成功，已加入改枪库。` });
        return;
      }

      notify({
        text: `「${build.title}」发布成功，但当前${hiddenBy.join('、')}会把它过滤掉。`,
        action: {
          label: '查看我的方案',
          onClick: () => {
            // 清空筛选并切到「最新发布」，确保刚发的方案出现在第一页
            setSearchParams(writeFilters({ ...FILTER_DEFAULTS, sort: 'latest' }), {
              replace: true,
            });
            navigate('/');
          },
        },
      });
    },
    [navigate, notify, searchParams, setSearchParams],
  );

  const shellValue = useMemo<AppShellValue>(
    () => ({ guns, categories, dataVersion, notify, openPublish }),
    [guns, categories, dataVersion, notify, openPublish],
  );

  return (
    <AppShellContext.Provider value={shellValue}>
      <div className="flex min-h-dvh flex-col">
        <Header />

        <div className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/builds/:id" element={<BuildDetailPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>

        <SiteFooter />

        {/* ------------------------------------------------ 轻提示 */}
        {notice && (
          <div
            role="status"
            className={cn(
              'animate-rise-in fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2',
              'items-start gap-2.5 rounded-lg border border-tactical/40 bg-surface/95 px-4 py-3',
              'shadow-[0_18px_50px_-16px_rgba(0,0,0,0.9)] backdrop-blur-md',
            )}
          >
            <Info className="mt-px h-4 w-4 shrink-0 text-tactical" aria-hidden="true" />
            <span className="text-xs leading-relaxed text-ink">{notice.text}</span>

            {notice.action && (
              <button
                type="button"
                onClick={() => {
                  notice.action?.onClick();
                  setNotice(null);
                }}
                className={cn(
                  'ml-1 shrink-0 rounded border border-tactical/50 bg-tactical/12 px-2.5 py-1',
                  'text-[11px] font-bold text-tactical transition-colors hover:bg-tactical/25',
                )}
              >
                {notice.action.label}
              </button>
            )}

            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="关闭提示"
              className="ml-1 shrink-0 rounded p-0.5 text-dim transition-colors hover:bg-raised hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* ------------------------------------------------ 发布弹窗 */}
        {publishOpen && (
          <PublishDialog
            guns={guns}
            onClose={() => setPublishOpen(false)}
            onCreated={handleCreated}
          />
        )}
      </div>
    </AppShellContext.Provider>
  );
}

/* ------------------------------------------------------------------ 子组件 */

function NotFoundPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
      <PackageOpen className="h-12 w-12 text-dim" strokeWidth={1.5} aria-hidden="true" />
      <h1 className="mt-5 text-lg font-bold text-ink">页面不存在</h1>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        你访问的地址没有对应的内容，可能是链接已经失效。
      </p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-tactical px-4 py-2 text-xs font-bold text-void transition-colors hover:bg-tactical-deep hover:text-ink"
      >
        回到改枪库首页
      </Link>
    </main>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-8 lg:px-6">
      <div className="border-t border-line/70 pt-5 text-[11px] leading-relaxed text-dim">
        <p>
          本站为《暗区突围》玩家社区改枪码分享工具，与游戏官方无关。改枪码由玩家投稿，
          请在游戏内自行验证后使用。
        </p>
        <p className="mt-1.5">
          数据接口：<code className="font-mono">GET /api/builds</code> ·
          <code className="ml-1 font-mono">GET /api/guns</code> ·
          <code className="ml-1 font-mono">POST /api/builds/:id/copy</code> ·
          <code className="ml-1 font-mono">POST /api/builds/:id/like</code> ·
          <code className="ml-1 font-mono">GET/POST /api/builds/:id/comments</code>
        </p>
      </div>
    </footer>
  );
}
