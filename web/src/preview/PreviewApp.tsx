import { useCallback, useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Info, X } from 'lucide-react';

import { AuthDialog } from '../components/AuthDialog';
import { NotFoundPage } from '../components/NotFoundPage';
import { PublishDialog } from '../components/PublishDialog';
import { BuildDetailPage } from '../pages/BuildDetailPage';
import { BuildsPage } from '../pages/BuildsPage';
import { PointerBackdrop } from '../components/PointerBackdrop';
import GunCatalogPage from '../pages/GunCatalogPage';
import GunDetailPage from '../pages/GunDetailPage';
import { PreviewHeader } from './PreviewHeader';
import { PreviewHomePage } from './PreviewHomePage';
import { PREVIEW_READONLY_EVENT, PREVIEW_READ_ONLY_MESSAGE } from './readOnly';
import { AppShellContext } from '../lib/appShell';
import type { AppShellValue, Notice } from '../lib/appShell';
import { AuthProvider } from '../lib/auth';
import { fetchGuns } from '../lib/apiPublic';
import { cn } from '../lib/cn';
import { FILTER_DEFAULTS, readFilters, writeFilters } from '../lib/queryParams';
import { EASE } from '../lib/styles';
import type { BuildDTO, CategoryDTO, GunDTO } from '../types/api';

/**
 * 应用外壳。
 *
 * 职责被刻意限定为四件事：加载全局字典、承载路由出口、托管全局 UI
 * （轻提示、发布弹窗、登录弹窗）。列表与详情的业务逻辑分别在各自的 page 里。
 *
 * `AuthProvider` 包在最外层，让 Header（登录按钮）、评论区、发布弹窗
 * 都能通过 `useAuth()` 读到会话状态。
 */
export default function PreviewApp() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ------------------------------------------------------ 全局字典 */
  const [guns, setGuns] = useState<GunDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  /**
   * 字典是否还在加载。
   *
   * `/guns/:slug` 必须区分"还没加载完"和"加载完但没有这把枪"——
   * 少了这个标志，直接深链进枪械详情时会先闪一个错误的 404。
   */
  const [dictionaryLoading, setDictionaryLoading] = useState(true);

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
      })
      .finally(() => {
        if (!cancelled) setDictionaryLoading(false);
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

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      const suffix = detail?.action ? `（${detail.action}）` : '';
      notify({ text: `${PREVIEW_READ_ONLY_MESSAGE}${suffix}` });
    };
    window.addEventListener(PREVIEW_READONLY_EVENT, handler);
    return () => window.removeEventListener(PREVIEW_READONLY_EVENT, handler);
  }, [notify]);

  /* ------------------------------------------------------ 投稿抽屉 */
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishGunId, setPublishGunId] = useState<string | null>(null);
  const openPublish = useCallback((initialGunId?: string) => {
    setPublishGunId(initialGunId ?? null);
    setPublishOpen(true);
  }, []);

  /* ------------------------------------------------------ 登录弹窗 */
  const [authOpen, setAuthOpen] = useState(false);
  const openAuth = useCallback(() => setAuthOpen(true), []);

  const handleAuthSuccess = useCallback(
    (message: string) => {
      setAuthOpen(false);
      notify({ text: message });
    },
    [notify],
  );

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
    () => ({
      guns,
      categories,
      dictionaryLoading,
      dataVersion,
      notify,
      openPublish,
      openAuth,
    }),
    [guns, categories, dictionaryLoading, dataVersion, notify, openPublish, openAuth],
  );

  return (
    /*
     * reducedMotion="user" 让**所有** framer-motion 组件自动尊重系统的
     * "减少动态效果"设置 —— 位移与缩放被关掉、透明度保留。
     * 放在最外层而不是每个组件里，是为了不让新组件忘记这一项；
     * CSS keyframes 那边由 index.css 里的全局媒体查询兜住，两边口径一致。
     */
    <MotionConfig reducedMotion="user">
      <AuthProvider previewReadOnly>
        <AppShellContext.Provider value={shellValue}>
          <div className="flex min-h-dvh flex-col">
            <PointerBackdrop />
            <PreviewHeader />

            <div className="flex-1">
              <Routes>
                <Route path="/" element={<PreviewHomePage />} />
                <Route path="/guns" element={<GunCatalogPage />} />
                <Route path="/guns/:slug" element={<GunDetailPage />} />
                <Route path="/builds" element={<BuildsPage />} />
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
                  'animate-rise-in glass-strong fixed bottom-6 left-1/2 z-50 flex',
                  'max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-3',
                  'rounded-panel px-4 py-3.5',
                  'shadow-[0_24px_60px_-16px_rgb(0_0_0_/_0.85)]',
                )}
              >
                <Info className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <span className="text-[13px] leading-relaxed text-ink">{notice.text}</span>

                {notice.action && (
                  <button
                    type="button"
                    onClick={() => {
                      notice.action?.onClick();
                      setNotice(null);
                    }}
                    className={cn(
                      'press ml-1 shrink-0 rounded-chip bg-accent px-3 py-1',
                      'text-[12px] font-semibold text-black',
                      `transition-all duration-300 ${EASE} hover:bg-accent-2`,
                    )}
                  >
                    {notice.action.label}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  aria-label="关闭提示"
                  className="press ml-1 shrink-0 rounded-chip p-1 text-ink-3 transition-colors hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ------------------------------------------------ 发布弹窗 */}
            {publishOpen && (
              <PublishDialog
                guns={guns}
                initialGunId={publishGunId}
                onClose={() => setPublishOpen(false)}
                onCreated={handleCreated}
              />
            )}

            {/* ------------------------------------------------ 登录弹窗 */}
            {authOpen && (
              <AuthDialog onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />
            )}
          </div>
        </AppShellContext.Provider>
      </AuthProvider>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ 子组件 */

function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-8 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-hairline pt-5 text-[11px] text-ink-3">
        <p>本站为玩家社区工具，与游戏官方无关；改枪码请在游戏内自行验证。</p>
      </div>
    </footer>
  );
}
